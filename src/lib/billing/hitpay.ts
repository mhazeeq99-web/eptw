import { createHmac, timingSafeEqual } from 'crypto'
import type {
  BillingProvider,
  CreateCheckoutInput,
  PaymentRecord,
  ProviderCheckout,
  ProviderSubscription,
} from './types'
import { BillingNotConfiguredError } from './types'

/**
 * HitPay provider — implements BillingProvider against the current official
 * HitPay API (https://docs.hitpayapp.com):
 *
 *   POST   /v1/recurring-billing          create recurring billing (checkout)
 *   GET    /v1/recurring-billing/{id}     subscription status
 *   DELETE /v1/recurring-billing/{id}     cancel / delete the subscription
 *   POST   /v1/subscription-plan          create the PRO subscription plan
 *   Webhook: Hitpay-Signature header = HMAC-SHA256(raw body, per-webhook salt)
 *
 * Requests use the documented headers X-BUSINESS-API-KEY and
 * X-Requested-With: XMLHttpRequest, Content-Type application/x-www-form-urlencoded.
 *
 * Credentials come ONLY from server-side environment variables:
 *   HITPAY_API_KEY          sandbox/production business API key
 *   HITPAY_API_URL          default https://api.sandbox.hit-pay.com
 *   HITPAY_WEBHOOK_SALT     per-webhook salt (Developers -> Webhooks)
 *   HITPAY_SUBSCRIPTION_PLAN_ID (optional; auto-created and stored if absent)
 */

const PRODUCTION_URL = 'https://api.hit-pay.com'
const SANDBOX_URL = 'https://api.sandbox.hit-pay.com'

export function hitpayApiBaseUrl(): string {
  const configured = process.env.HITPAY_API_URL
  if (configured) return configured.replace(/\/+$/, '')
  return process.env.NODE_ENV === 'production'
    ? PRODUCTION_URL
    : SANDBOX_URL
}

function requireApiKey(): string {
  const key = process.env.HITPAY_API_KEY
  if (!key) {
    throw new BillingNotConfiguredError()
  }
  return key
}

async function hitpayPost(
  path: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, String(item))
    } else {
      form.append(key, String(value))
    }
  }

  const response = await fetch(`${hitpayApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'X-BUSINESS-API-KEY': requireApiKey(),
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: form.toString(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `HitPay ${path} failed with ${response.status}: ${text.slice(0, 300)}`
    )
  }

  return response.json() as Promise<Record<string, unknown>>
}

async function hitpayRequest(
  method: 'GET' | 'DELETE',
  path: string
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${hitpayApiBaseUrl()}${path}`, {
    method,
    headers: {
      'X-BUSINESS-API-KEY': requireApiKey(),
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `HitPay ${method} ${path} failed with ${response.status}: ${text.slice(0, 300)}`
    )
  }

  const text = await response.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

export const hitpayProvider: BillingProvider = {
  name: 'hitpay',

  isConfigured(): boolean {
    return Boolean(process.env.HITPAY_API_KEY)
  },

  async createCheckout(
    input: CreateCheckoutInput
  ): Promise<ProviderCheckout> {
    const data = await hitpayPost('/v1/recurring-billing', {
      plan_id: input.planId,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      start_date: input.startDate,
      redirect_url: input.redirectUrl,
      reference: input.reference,
      payment_methods: ['card'],
      send_email: 'false',
      // NOTE: times_to_be_charged is intentionally not sent. HitPay documents
      // a default of 1 (range 1..100); whether an open-ended plan-driven
      // subscription requires an explicit value must be confirmed against the
      // merchant's sandbox account before going live (see docs/BILLING_HITPAY.md).
    })

    const url = typeof data.url === 'string' ? data.url : null
    const id = typeof data.id === 'string' ? data.id : null

    if (!url || !id) {
      throw new Error(
        'HitPay recurring billing response is missing url/id'
      )
    }

    return {
      url,
      providerSubscriptionId: id,
      providerCustomerId:
        typeof data.customer_id === 'string'
          ? data.customer_id
          : null,
      reference:
        typeof data.reference === 'string'
          ? data.reference
          : input.reference,
    }
  },

  async getSubscriptionStatus(
    providerSubscriptionId: string
  ): Promise<ProviderSubscription> {
    const data = await hitpayRequest(
      'GET',
      `/v1/recurring-billing/${providerSubscriptionId}`
    )

    if (!data) {
      throw new Error('HitPay recurring billing not found')
    }

    return {
      providerSubscriptionId,
      status: typeof data.status === 'string' ? data.status : '',
      amount:
        typeof data.amount === 'number'
          ? data.amount
          : typeof data.amount === 'string'
            ? Number(data.amount)
            : null,
      currency:
        typeof data.currency === 'string' ? data.currency : null,
      expiresAt:
        typeof data.expires_at === 'string' ? data.expires_at : null,
      timesCharged:
        typeof data.times_charged === 'number'
          ? data.times_charged
          : null,
      customerId:
        typeof data.customer_id === 'string'
          ? data.customer_id
          : null,
      customerEmail:
        typeof data.customer_email === 'string'
          ? data.customer_email
          : null,
    }
  },

  async cancelSubscription(
    providerSubscriptionId: string
  ): Promise<void> {
    await hitpayRequest(
      'DELETE',
      `/v1/recurring-billing/${providerSubscriptionId}`
    )
  },

  verifyWebhookSignature(
    payload: string,
    signature: string
  ): boolean {
    const salt = process.env.HITPAY_WEBHOOK_SALT
    if (!salt || !signature) return false

    const computed = createHmac('sha256', salt)
      .update(payload, 'utf8')
      .digest('hex')

    const expected = Buffer.from(computed, 'hex')
    const received = Buffer.from(signature, 'hex')
    if (expected.length !== received.length) return false

    return timingSafeEqual(expected, received)
  },
}

/**
 * Maps a HitPay recurring-billing status into our internal status.
 * Only 'active' keeps PRO entitlements; anything else falls back to FREE
 * (the entitlement engine treats non-active subscriptions as no subscription).
 */
export function mapProviderStatusToInternal(
  providerStatus: string
): 'active' | 'cancelled' | 'expired' {
  switch (providerStatus) {
    case 'active':
      return 'active'
    case 'cancelled':
      return 'cancelled'
    case 'expired':
    case 'inactive':
    case 'paused':
    default:
      return 'expired'
  }
}

/**
 * Normalizes a HitPay charge payload into our payment record shape.
 * The documented charge object fields are used (id, amount, currency,
 * status, closed_at/created_at).
 */
export function paymentFromHitPayCharge(
  payload: Record<string, unknown>
): PaymentRecord | null {
  const id = typeof payload.id === 'string' ? payload.id : null
  if (!id) return null

  const amountValue = payload.amount
  const amount =
    typeof amountValue === 'number'
      ? amountValue
      : typeof amountValue === 'string'
        ? Number(amountValue)
        : NaN

  if (!Number.isFinite(amount)) return null

  const statusRaw = typeof payload.status === 'string' ? payload.status : ''
  let status: PaymentRecord['status']
  if (statusRaw === 'succeeded' || statusRaw === 'completed') {
    status = 'succeeded'
  } else if (statusRaw === 'failed' || statusRaw === 'declined') {
    status = 'failed'
  } else if (statusRaw === 'refunded' || statusRaw === 'partially_refunded') {
    status = 'refunded'
  } else {
    status = 'pending'
  }

  return {
    providerPaymentId: id,
    amount,
    currency:
      typeof payload.currency === 'string' ? payload.currency : 'MYR',
    status,
    paidAt:
      typeof payload.closed_at === 'string'
        ? payload.closed_at
        : typeof payload.created_at === 'string'
          ? payload.created_at
          : null,
  }
}
