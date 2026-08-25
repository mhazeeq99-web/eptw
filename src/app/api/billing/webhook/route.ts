import { processWebhookEvent } from '@/lib/billing'

/**
 * HitPay event webhook endpoint.
 *
 * HitPay POSTs the raw JSON body with a Hitpay-Signature header
 * (HMAC-SHA256 of the raw body with the webhook's salt). The handler:
 *   1. verifies the signature (raw bytes),
 *   2. records the event idempotently (unique provider_event_id),
 *   3. routes charge.created / recurring_billing.subscription_updated
 *      into company_subscriptions + payments,
 *   4. acks with 200 so HitPay stops retrying.
 *
 * No secrets are exposed; invalid signatures get 401.
 */
export async function POST(request: Request) {
  // Raw body is required — the HMAC is computed over the exact bytes.
  const rawBody = await request.text()

  const signature = request.headers.get('hitpay-signature') ?? ''
  const eventType = request.headers.get('hitpay-event-type')
  const eventObject = request.headers.get('hitpay-event-object')

  const result = await processWebhookEvent(
    rawBody,
    signature,
    eventType,
    eventObject
  )

  return new Response(result.body, { status: result.status })
}
