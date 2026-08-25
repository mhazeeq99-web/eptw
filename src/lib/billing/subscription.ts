import type { SupabaseClient } from '@supabase/supabase-js'
import { hitpayProvider } from './hitpay'
import { ensureHitPayProPlan } from './plans'
import type {
  PaymentRecord,
  ProviderCheckout,
} from './types'
import { BillingNotConfiguredError } from './types'

export const PROVIDER_NAME = 'hitpay' as const

export type CompanySubscriptionRow = {
  id: number
  company_id: number
  plan_id: number
  status: string
  provider: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  provider_subscription_status: string | null
  reference: string | null
  current_period_start: string | null
  current_period_end: string | null
  created_at: string | null
  updated_at: string | null
}

/** The company's current subscription row (any status), if present. */
export async function getCompanySubscription(
  admin: SupabaseClient,
  companyId: number
): Promise<CompanySubscriptionRow | null> {
  const { data } = await admin
    .from('company_subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as CompanySubscriptionRow | null) ?? null
}

/** SGT date string YYYY-MM-DD (HitPay requires SGT billing dates). */
function sgtStartDate(): string {
  const now = new Date()
  const sgt = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return sgt.toISOString().slice(0, 10)
}

function buildReference(companyId: number): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `eptw:${companyId}:${suffix}`
}

/**
 * Starts the HitPay Pro checkout for a company.
 *
 * 1. Guard: no active subscription may already exist.
 * 2. Ensure the HitPay PRO plan exists.
 * 3. Create the HitPay recurring billing (checkout) with a server-generated
 *    reference that maps webhooks back to the company.
 * 4. Persist a company_subscriptions row with status 'pending' and the
 *    provider identifiers. The partial unique index on
 *    provider_subscription_id makes duplicate creates idempotent.
 *
 * The company is NOT upgraded here — only a verified webhook activates PRO.
 */
export async function startCheckout(
  admin: SupabaseClient,
  companyId: number,
  customerEmail: string,
  customerName: string
): Promise<ProviderCheckout> {
  const existing = await getCompanySubscription(admin, companyId)

  if (existing?.status === 'active') {
    throw new Error('This company is already on the Pro plan')
  }

  if (!hitpayProvider.isConfigured()) {
    throw new BillingNotConfiguredError()
  }

  const planId = await ensureHitPayProPlan(admin)

  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/settings/subscription`

  const checkout = await hitpayProvider.createCheckout({
    planId,
    customerEmail,
    customerName,
    reference: buildReference(companyId),
    redirectUrl,
    startDate: sgtStartDate(),
  })

  // Replace any prior non-active row for the company (e.g. an expired one)
  // with the fresh checkout record.
  if (existing) {
    await admin
      .from('company_subscriptions')
      .delete()
      .eq('id', existing.id)
  }

  const { data: plan } = await admin
    .from('plans')
    .select('id')
    .eq('code', 'pro')
    .single()

  const { error } = await admin
    .from('company_subscriptions')
    .insert({
      company_id: companyId,
      plan_id: plan?.id,
      status: 'pending',
      provider: PROVIDER_NAME,
      provider_customer_id: checkout.providerCustomerId ?? null,
      provider_subscription_id: checkout.providerSubscriptionId,
      provider_subscription_status: 'pending',
      reference: checkout.reference ?? null,
    })

  if (error) {
    throw new Error(
      `Failed to record subscription checkout: ${error.message}`
    )
  }

  return checkout
}

/**
 * Activates the company's subscription (verified webhook) and refreshes the
 * current billing period. Idempotent: re-activation simply refreshes dates.
 */
export async function activateSubscription(
  admin: SupabaseClient,
  subscriptionId: number,
  paidAt: string
): Promise<void> {
  const periodEnd = new Date(
    new Date(paidAt).getTime() + 30 * 24 * 60 * 60 * 1000
  ).toISOString()

  const { error } = await admin
    .from('company_subscriptions')
    .update({
      status: 'active',
      provider_subscription_status: 'active',
      current_period_start: paidAt,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)

  if (error) {
    throw new Error(`Failed to activate subscription: ${error.message}`)
  }
}

/**
 * Moves the company to the internal cancelled/expired state (verified webhook
 * or server-side cancellation). Data is never deleted — the company simply
 * falls back to FREE entitlements for NEW resources.
 */
export async function setSubscriptionState(
  admin: SupabaseClient,
  subscriptionId: number,
  state: 'active' | 'cancelled' | 'expired',
  providerStatus?: string
): Promise<void> {
  const { error } = await admin
    .from('company_subscriptions')
    .update({
      status: state,
      provider_subscription_status: providerStatus ?? state,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)

  if (error) {
    throw new Error(`Failed to update subscription state: ${error.message}`)
  }
}

/**
 * Cancels the Pro subscription server-side: cancels the HitPay recurring
 * billing (DELETE /v1/recurring-billing/{id}), then marks the local
 * subscription cancelled. The company falls back to FREE for new resources;
 * existing data stays untouched.
 */
export async function cancelSubscription(
  admin: SupabaseClient,
  companyId: number
): Promise<{ cancelled: boolean; message?: string }> {
  const sub = await getCompanySubscription(admin, companyId)

  if (!sub || sub.status !== 'active') {
    return {
      cancelled: false,
      message: 'No active Pro subscription to cancel',
    }
  }

  if (!hitpayProvider.isConfigured()) {
    throw new BillingNotConfiguredError()
  }

  if (sub.provider_subscription_id) {
    await hitpayProvider.cancelSubscription(sub.provider_subscription_id)
  }

  await setSubscriptionState(admin, sub.id, 'cancelled', 'cancelled')

  return { cancelled: true }
}

/**
 * Records a payment for a company (idempotent via the unique
 * provider_payment_id constraint).
 */
export async function recordPayment(
  admin: SupabaseClient,
  companyId: number,
  subscriptionId: number | null,
  payment: PaymentRecord
): Promise<{ recorded: boolean; reason?: string }> {
  const { data, error } = await admin
    .from('payments')
    .upsert(
      {
        company_id: companyId,
        subscription_id: subscriptionId,
        provider: PROVIDER_NAME,
        provider_payment_id: payment.providerPaymentId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paid_at: payment.paidAt ?? null,
      },
      { onConflict: 'provider_payment_id', ignoreDuplicates: true }
    )
    .select('id')

  if (error) {
    return { recorded: false, reason: error.message }
  }

  return { recorded: (data?.length ?? 0) > 0 }
}

export type { ProviderCheckout }
