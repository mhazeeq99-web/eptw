import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { hitpayProvider, mapProviderStatusToInternal, paymentFromHitPayCharge } from './hitpay'
import {
  activateSubscription,
  recordPayment,
  setSubscriptionState,
  type CompanySubscriptionRow,
} from './subscription'

/**
 * HitPay webhook processing.
 *
 * Event webhooks arrive at POST /api/billing/webhook with:
 *   Hitpay-Signature   HMAC-SHA256(raw JSON body, per-webhook salt)
 *   Hitpay-Event-Type  created | updated
 *   Hitpay-Event-Object charge | payment_request | recurring_billing | ...
 *
 * The recurring-billing flow registers these events (per the official
 * recurring-billing guide):
 *   charge.created                         recurring charge succeeded
 *   recurring_billing.subscription_updated subscription status changed
 *                                          (active, cancelled, paused, expired)
 *   recurring_billing.method_attached/detached payment method lifecycle
 *
 * Company identification is resolved from the payload, in order:
 *   target_id / recurring_billing_id  -> provider_subscription_id
 *   customer_id                       -> provider_customer_id
 *   order_reference_number / reference-> company_subscriptions.reference
 *
 * Idempotency: every processed payload is recorded in billing_events with a
 * unique provider_event_id (the payload id). A duplicate event is acked but
 * not processed twice, so duplicate webhooks cannot duplicate payments,
 * subscriptions or state transitions.
 */

export type WebhookResult = {
  status: number
  body: string
}

function toProviderEventId(payload: Record<string, unknown>): string | null {
  if (typeof payload.id === 'string' && payload.id) return payload.id
  if (typeof payload.charge_id === 'string' && payload.charge_id) return payload.charge_id
  if (typeof payload.recurring_billing_id === 'string' && payload.recurring_billing_id) {
    return `rb:${payload.recurring_billing_id}`
  }
  return null
}

function looksLikeCharge(payload: Record<string, unknown>): boolean {
  return (
    payload.channel === 'recurrent' ||
    typeof payload.amount !== 'undefined' ||
    typeof payload.currency !== 'undefined'
  ) && typeof payload.status === 'string'
}

function looksLikeSubscription(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.status === 'string' &&
    (typeof payload.cycle === 'string' ||
      typeof payload.times_charged !== 'undefined' ||
      typeof payload.recurring_billing_id === 'string')
  )
}

/**
 * Resolves the company's subscription row from the webhook payload.
 */
export async function findSubscriptionByPayload(
  admin: SupabaseClient,
  payload: Record<string, unknown>
): Promise<CompanySubscriptionRow | null> {
  const candidates: string[] = []
  for (const key of ['target_id', 'recurring_billing_id', 'id', 'customer_id', 'order_reference_number', 'reference']) {
    const value = payload[key]
    if (typeof value === 'string' && value) candidates.push(value)
  }

  for (const value of candidates) {
    const { data } = await admin
      .from('company_subscriptions')
      .select('*')
      .or(
        `provider_subscription_id.eq.${value},provider_customer_id.eq.${value},reference.eq.${value}`
      )
      .limit(1)
      .maybeSingle()
    if (data) return data as CompanySubscriptionRow
  }

  return null
}

/**
 * Processes an inbound webhook. `rawBody` MUST be the exact raw request body
 * (the HMAC is computed over the raw bytes).
 */
export async function processWebhookEvent(
  rawBody: string,
  signature: string,
  eventTypeHeader: string | null,
  eventObjectHeader: string | null
): Promise<WebhookResult> {
  if (!hitpayProvider.verifyWebhookSignature(rawBody, signature)) {
    return { status: 401, body: 'Invalid signature' }
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return { status: 400, body: 'Invalid JSON payload' }
  }

  const admin = createAdminClient()

  const eventType = eventTypeHeader ?? ''
  const eventObject = eventObjectHeader ?? ''
  const eventName = [eventObject, eventType].filter(Boolean).join('.') || 'unknown'

  // ---- Idempotency: record the event once -------------------------------
  const eventId = toProviderEventId(payload)
  if (eventId) {
    const { data: inserted } = await admin
      .from('billing_events')
      .upsert(
        {
          provider: 'hitpay',
          provider_event_id: eventId,
          event_type: eventName,
          status: typeof payload.status === 'string' ? payload.status : null,
          payload,
          processed_at: new Date().toISOString(),
        },
        { onConflict: 'provider_event_id', ignoreDuplicates: true }
      )
      .select('id')

    if ((inserted?.length ?? 0) === 0) {
      // Duplicate delivery — already processed.
      return { status: 200, body: 'OK' }
    }
  }

  const subscription = await findSubscriptionByPayload(admin, payload)

  if (!subscription) {
    // Ack HitPay but do nothing: the event cannot be mapped to a company.
    return { status: 200, body: 'OK' }
  }

  const companyId = subscription.company_id
  const payloadStatus = typeof payload.status === 'string' ? payload.status : ''

  // ---- Charge events (recurring charge outcome) -------------------------
  if (looksLikeCharge(payload)) {
    const payment = paymentFromHitPayCharge(payload)

    if (payment) {
      await recordPayment(admin, companyId, subscription.id, payment)
    }

    if (payloadStatus === 'succeeded' || payloadStatus === 'completed') {
      const paidAt =
        typeof payload.closed_at === 'string'
          ? payload.closed_at
          : typeof payload.created_at === 'string'
            ? payload.created_at
            : new Date().toISOString()
      await activateSubscription(admin, subscription.id, paidAt)
    } else if (payloadStatus === 'failed' || payloadStatus === 'declined') {
      // Grace period: a failed recurring charge does not immediately revoke
      // PRO. HitPay emails the customer; the subscription only moves to an
      // inactive state (and emits recurring_billing.subscription_updated)
      // after the documented 7-day window.
      await setSubscriptionState(admin, subscription.id, 'active', 'active')
    }

    return { status: 200, body: 'OK' }
  }

  // ---- Subscription status events (recurring_billing.subscription_updated)
  if (looksLikeSubscription(payload)) {
    const internal = mapProviderStatusToInternal(payloadStatus)
    await setSubscriptionState(
      admin,
      subscription.id,
      internal,
      payloadStatus
    )
    return { status: 200, body: 'OK' }
  }

  // Method attached/detached and anything else: logged already, no action.
  return { status: 200, body: 'OK' }
}
