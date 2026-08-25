# ePTW — HitPay Billing Integration

This phase wires the Free/Pro entitlement architecture to real subscription
billing via HitPay. The entitlement engine is untouched: it still reads
`company_subscriptions` — HitPay only ever writes there through **verified
server-side webhooks**.

## Official API basis (verified)

Verified against the current official HitPay docs:

- Product guide: <https://docs.hitpayapp.com/apis/guide/recurring-billing>
- API reference: <https://docs.hitpayapp.com/apis/recurring-billing/create-billing>,
  <https://docs.hitpayapp.com/apis/recurring-billing/create-billing>
- Webhook signature guide: <https://docs.hitpayapp.com/apis/guide/events>
- Sandbox guide: <https://docs.hitpayapp.com/apis/guide/sandbox>

Endpoints used (exactly as documented):

| Action | Endpoint | Notes |
|---|---|---|
| Create subscription plan | `POST /v1/subscription-plan` | name, description, currency, amount, cycle, reference |
| Create recurring billing (checkout) | `POST /v1/recurring-billing` | plan_id, customer_email, customer_name, start_date (YYYY-MM-DD SGT), redirect_url, reference, payment_methods[] |
| Subscription status | `GET /v1/recurring-billing/{id}` | status, amount, currency, times_charged, expires_at |
| Cancel subscription | `DELETE /v1/recurring-billing/{id}` | documented cancel/remove endpoint |
| Webhook | POST to `/api/billing/webhook` | `Hitpay-Signature: HMAC-SHA256(raw body, per-webhook salt)` |

Auth header: `X-BUSINESS-API-KEY` (+ `X-Requested-With: XMLHttpRequest`,
`Content-Type: application/x-www-form-urlencoded`). Base URLs:
production `https://api.hit-pay.com`, sandbox `https://api.sandbox.hit-pay.com`.

## Environment variables (server-side only)

```
HITPAY_API_KEY=                     # sandbox or production business API key
HITPAY_API_URL=                     # default: https://api.sandbox.hit-pay.com
HITPAY_WEBHOOK_SALT=                # per-webhook salt (Developers -> Webhooks)
HITPAY_SUBSCRIPTION_PLAN_ID=        # optional; auto-created and stored on plans.provider_plan_id
NEXT_PUBLIC_APP_URL=http://localhost:3000   # base used for the checkout redirect_url
```

Never expose these to the browser, client components, `NEXT_PUBLIC_` (other
than APP_URL), logs or error responses.

## Registering the webhook

In the HitPay dashboard (Developers → Webhook Endpoints), register:

- URL: `https://<your-app>/api/billing/webhook`
- Events: `charge.created`, `recurring_billing.subscription_updated`,
  `recurring_billing.method_attached`, `recurring_billing.method_detached`

Copy the per-webhook **salt** into `HITPAY_WEBHOOK_SALT` (the salt from the
webhook detail view, not the API-key salt).

## Checkout → activation flow

1. `/pricing` → "Upgrade to Pro" → `/settings/subscription`
2. Safety Manager clicks **Start Pro Checkout** → `POST /api/billing/checkout`
   (server-side; company id from the authenticated profile, never the client).
3. Server ensures the HitPay PRO plan, calls `POST /v1/recurring-billing` with
   reference `eptw:<companyId>:<uuid>`, stores a `company_subscriptions` row
   with `status='pending'` + provider ids, and returns the HitPay hosted
   checkout URL.
4. Customer completes card details on HitPay → HitPay redirects back to
   `/settings/subscription?reference=...&status=...` — the page shows
   "Payment submitted — being confirmed" and refreshes.
5. HitPay webhook (`charge.created`) → HMAC verified → subscription set
   `active`, period refreshed, `payments` row recorded.
6. Entitlement engine now sees the active subscription → PRO.

A browser redirect alone NEVER activates PRO; the verified webhook is the
only authority.

## Webhook verification & idempotency

- Signature: `HMAC-SHA256(raw body, HITPAY_WEBHOOK_SALT)` hex compared
  (timing-safe) against the `Hitpay-Signature` header. Invalid → HTTP 401.
- Idempotency: every payload is recorded in `billing_events` with a unique
  `provider_event_id` (the payload id). Duplicate deliveries are acked but
  not processed again, so duplicate webhooks cannot duplicate payments,
  subscriptions or state transitions. `payments.provider_payment_id` and
  `company_subscriptions.provider_subscription_id` are unique as well.
- Company mapping (in order): `target_id`/`recurring_billing_id` →
  `provider_subscription_id`; `customer_id` → `provider_customer_id`;
  `order_reference_number`/`reference` → `company_subscriptions.reference`.

## Status mapping (HitPay → internal)

| HitPay recurring-billing status | internal `company_subscriptions.status` |
|---|---|
| `active` | `active` (PRO entitlements) |
| `cancelled` | `cancelled` → falls back to FREE |
| `expired` / `inactive` / `paused` | `expired` → falls back to FREE |
| checkout started (ours) | `pending` |

Only `active` grants PRO. Anything else means the entitlement engine
effectively serves FREE — existing data is never deleted.

## Payment failure / grace period

A failed recurring charge records a `failed` payment and is logged; the
subscription stays `active` (HitPay emails the customer to update their card;
the documented 7-day window before the subscription moves to an inactive
state is governed by HitPay, whose `recurring_billing.subscription_updated`
event then moves our state via the mapping above). We never delete data or
lock the company out of existing records on a failed charge.

## Cancellation & downgrade

"Cancel Pro" → `POST /api/billing/cancel` (Safety Manager only) → server calls
`DELETE /v1/recurring-billing/{id}` and sets the local status to `cancelled`.
The company falls back to FREE: existing permits/users/attachments/history
stay accessible; only NEW resource creation is restricted by Free limits.

## Known deployment-time verification item

HitPay documents `times_to_be_charged` with a default of `1` (range 1–100)
on the recurring-billing create call. This implementation deliberately does
not send it (an open-ended plan-driven subscription should follow the plan
cycle). Confirm the resulting billing behaviour against your sandbox account
during the go-live round-trip; if your HitPay account bills only once, set
`times_to_be_charged` explicitly (e.g. to the documented max) or use the
plan-driven cycle as confirmed by HitPay support.

## Testing without credentials

With `HITPAY_WEBHOOK_SALT` set locally, the webhook handler can be exercised
end-to-end by POSTing HMAC-signed payloads to `/api/billing/webhook`
(`scripts/qa-billing.ps1 -Mode webhook`). The checkout/cancel routes return
HTTP 503 ("Billing is not configured") until `HITPAY_API_KEY` is provided —
this is the safe, honest behaviour when no credentials exist. The full
sandbox round-trip (create checkout → HitPay hosted page → real webhook)
requires sandbox credentials from a HitPay developer account.
