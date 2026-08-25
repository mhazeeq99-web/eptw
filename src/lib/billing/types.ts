/**
 * Billing provider abstraction — the application only ever talks to
 * BillingProvider, never to HitPay directly. HitPay is the concrete
 * implementation; a different provider can be added without touching the
 * entitlement engine or the routes.
 */

export type ProviderName = 'hitpay'

/**
 * Internal subscription states (company_subscriptions.status).
 * 'pending' is used while a checkout is in flight, awaiting the verified
 * webhook. Only 'active' grants PRO entitlements.
 */
export type InternalSubscriptionStatus =
  | 'pending'
  | 'active'
  | 'cancelled'
  | 'expired'

export interface ProviderCheckout {
  url: string
  providerSubscriptionId: string
  providerCustomerId?: string | null
  reference?: string | null
}

export interface ProviderSubscription {
  providerSubscriptionId: string
  status: string
  amount?: number | null
  currency?: string | null
  expiresAt?: string | null
  timesCharged?: number | null
  customerId?: string | null
  customerEmail?: string | null
}

export interface PaymentRecord {
  providerPaymentId: string
  amount: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  paidAt?: string | null
}

export interface CreateCheckoutInput {
  planId: string
  customerEmail: string
  customerName: string
  /** Server-generated reference used to map webhooks back to the company. */
  reference: string
  redirectUrl: string
  /** Billing start date YYYY-MM-DD (SGT, per HitPay). */
  startDate: string
}

export interface BillingProvider {
  readonly name: ProviderName
  isConfigured(): boolean
  createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout>
  getSubscriptionStatus(
    providerSubscriptionId: string
  ): Promise<ProviderSubscription>
  cancelSubscription(providerSubscriptionId: string): Promise<void>
  /** True when the webhook HMAC-SHA256 signature matches the payload. */
  verifyWebhookSignature(payload: string, signature: string): boolean
}

export class BillingNotConfiguredError extends Error {
  constructor(
    message = 'Billing is not configured. Contact the administrator.'
  ) {
    super(message)
    this.name = 'BillingNotConfiguredError'
  }
}
