-- ============================================================================
-- ePTW — HitPay billing integration (provider-isolated subscription billing)
-- ============================================================================
-- Extends the entitlement schema with the minimal provider fields required
-- to run HitPay recurring-billing subscriptions, plus payment + billing
-- audit tables. The entitlement engine still reads company_subscriptions
-- exactly as before; HitPay only writes to it through verified server-side
-- webhooks.
--
-- Provider mapping (HitPay -> internal):
--   recurring billing status 'active'   -> 'active'
--   recurring billing status 'cancelled'-> 'cancelled'
--   recurring billing status 'expired'/'inactive'/'paused' -> 'expired'
--   checkout started, awaiting webhook  -> 'pending' (required to track the
--     in-flight checkout; the only addition to the status CHECK)
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. plans: provider plan id (HitPay subscription-plan) for the PRO plan
-- ----------------------------------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS provider_plan_id text;

-- ----------------------------------------------------------------------------
-- 2. company_subscriptions: provider fields + pending status
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS provider_subscription_status text,
  ADD COLUMN IF NOT EXISTS reference text;

-- Allow 'pending' (checkout started, awaiting verified webhook).
ALTER TABLE public.company_subscriptions
  DROP CONSTRAINT IF EXISTS company_subscriptions_status_check;
ALTER TABLE public.company_subscriptions
  ADD CONSTRAINT company_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'cancelled', 'expired'));

-- One provider subscription per company (webhook idempotency for duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS company_subscriptions_provider_sub_id_key
  ON public.company_subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_subscriptions_reference_key
  ON public.company_subscriptions (reference)
  WHERE reference IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. payments (payment history per company)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id bigint REFERENCES public.company_subscriptions(id) ON DELETE SET NULL,
  provider text,
  provider_payment_id text UNIQUE,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'MYR',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_company_idx ON public.payments (company_id);
CREATE INDEX IF NOT EXISTS payments_subscription_idx ON public.payments (subscription_id);

-- ----------------------------------------------------------------------------
-- 4. billing_events (webhook audit + idempotency record)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text,
  provider_event_id text UNIQUE,
  event_type text,
  status text,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. RLS — company-scoped reads; only trusted server-side billing writes
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company users can view own payments" ON public.payments;
CREATE POLICY "Company users can view own payments"
  ON public.payments
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR is_platform_admin()
  );

-- Audit log is platform-visible only; company users do not need it.
DROP POLICY IF EXISTS "Platform admins can view billing events" ON public.billing_events;
CREATE POLICY "Platform admins can view billing events"
  ON public.billing_events
  FOR SELECT TO authenticated
  USING (is_platform_admin());

-- No INSERT/UPDATE/DELETE policies on payments or billing_events: only the
-- service role (verified webhook / billing service) may write them.
