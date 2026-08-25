export type {
  BillingProvider,
  CreateCheckoutInput,
  InternalSubscriptionStatus,
  PaymentRecord,
  ProviderCheckout,
  ProviderName,
  ProviderSubscription,
} from './types'
export { BillingNotConfiguredError } from './types'
export { hitpayProvider, hitpayApiBaseUrl, mapProviderStatusToInternal, paymentFromHitPayCharge } from './hitpay'
export { ensureHitPayProPlan } from './plans'
export {
  PROVIDER_NAME,
  activateSubscription,
  cancelSubscription,
  getCompanySubscription,
  recordPayment,
  setSubscriptionState,
  startCheckout,
} from './subscription'
export type { CompanySubscriptionRow } from './subscription'
export { processWebhookEvent, findSubscriptionByPayload } from './webhooks'

import { hitpayProvider } from './hitpay'
import type { BillingProvider } from './types'

/**
 * Returns the active billing provider. The application routes through this
 * factory so provider logic never leaks into pages or the entitlement engine.
 */
export function getBillingProvider(): BillingProvider {
  return hitpayProvider
}
