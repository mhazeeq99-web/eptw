import type { SupabaseClient } from '@supabase/supabase-js'
import { hitpayApiBaseUrl } from './hitpay'
import { BillingNotConfiguredError } from './types'

/**
 * Ensures the HitPay subscription plan for the ePTW PRO plan exists and
 * returns its HitPay plan id.
 *
 * Resolution order:
 *   1. HITPAY_SUBSCRIPTION_PLAN_ID env var (explicit operator override)
 *   2. plans.provider_plan_id already stored for the PRO plan
 *   3. Create it via POST /v1/subscription-plan (documented fields:
 *      name, description, currency, amount, cycle=monthly, reference) and
 *      persist the id on plans.provider_plan_id.
 *
 * The plan price always comes from the local plans table (the database
 * remains the source of truth — never hardcoded).
 */
export async function ensureHitPayProPlan(
  admin: SupabaseClient
): Promise<string> {
  const envPlanId = process.env.HITPAY_SUBSCRIPTION_PLAN_ID
  if (envPlanId) return envPlanId

  const { data: proPlan } = await admin
    .from('plans')
    .select('id, code, name, price_monthly, currency, provider_plan_id')
    .eq('code', 'pro')
    .eq('is_active', true)
    .maybeSingle()

  if (!proPlan) {
    throw new Error('PRO plan is not configured')
  }

  if (typeof proPlan.provider_plan_id === 'string' && proPlan.provider_plan_id) {
    return proPlan.provider_plan_id
  }

  const apiKey = process.env.HITPAY_API_KEY
  if (!apiKey) {
    throw new BillingNotConfiguredError()
  }

  const form = new URLSearchParams()
  form.append('name', 'ePTW Pro')
  form.append('description', 'ePTW Pro subscription (RM99/month)')
  form.append('currency', proPlan.currency ?? 'MYR')
  form.append('amount', String(proPlan.price_monthly))
  form.append('cycle', 'monthly')
  form.append('reference', 'eptw-pro')

  const response = await fetch(
    `${hitpayApiBaseUrl()}/v1/subscription-plan`,
    {
      method: 'POST',
      headers: {
        'X-BUSINESS-API-KEY': apiKey,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `HitPay create subscription plan failed with ${response.status}: ${text.slice(0, 300)}`
    )
  }

  const data = (await response.json()) as { id?: unknown }

  if (typeof data.id !== 'string' || !data.id) {
    throw new Error('HitPay subscription plan response missing id')
  }

  await admin
    .from('plans')
    .update({ provider_plan_id: data.id })
    .eq('id', proPlan.id)

  return data.id
}
