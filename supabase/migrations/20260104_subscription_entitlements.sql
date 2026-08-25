-- ============================================================================
-- ePTW — Free/Pro subscription & entitlement architecture (no payment yet)
-- ============================================================================
-- Adds the plan/entitlement model and company-scoped subscriptions.
--
--   * plans                 — configurable plans with limits + feature flags
--   * company_subscriptions — the company's subscription (one active per company)
--
-- Default-FREE behaviour: a company with NO active subscription is effectively
-- on the FREE plan (enforced by the application entitlement engine, not by
-- inserting rows for every existing company). Existing companies therefore
-- keep working with FREE entitlements after this migration.
--
-- No payment-provider columns (Stripe/HitPay/etc.) are introduced yet.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. plans
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MYR',
  is_active boolean NOT NULL DEFAULT true,

  -- Numeric limits (NULL = unlimited)
  max_sites integer NOT NULL DEFAULT 1,
  max_safety_managers integer NOT NULL DEFAULT 1,
  max_safety_coordinators integer NOT NULL DEFAULT 2,
  max_internal_staff integer NOT NULL DEFAULT 5,
  max_contractor_admins integer NOT NULL DEFAULT 3,
  max_total_users integer NOT NULL DEFAULT 11,
  max_monthly_permits integer,
  max_active_permits integer,
  max_storage_bytes bigint NOT NULL DEFAULT 524288000, -- 500 MB

  -- Feature flags
  feature_jha boolean NOT NULL DEFAULT true,
  feature_loto boolean NOT NULL DEFAULT true,
  feature_gas_testing boolean NOT NULL DEFAULT true,
  feature_contractor_ptw boolean NOT NULL DEFAULT true,
  feature_basic_reports boolean NOT NULL DEFAULT true,
  feature_advanced_reports boolean NOT NULL DEFAULT false,
  feature_advanced_analytics boolean NOT NULL DEFAULT false,
  feature_notifications boolean NOT NULL DEFAULT true,
  feature_printable_permit boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the two plans (idempotent; price/limits stay configurable on re-run).
INSERT INTO public.plans (
  code, name, price_monthly, currency, is_active,
  max_sites, max_safety_managers, max_safety_coordinators,
  max_internal_staff, max_contractor_admins, max_total_users,
  max_monthly_permits, max_active_permits, max_storage_bytes,
  feature_jha, feature_loto, feature_gas_testing, feature_contractor_ptw,
  feature_basic_reports, feature_advanced_reports, feature_advanced_analytics,
  feature_notifications, feature_printable_permit
)
VALUES (
  'free', 'Free', 0, 'MYR', true,
  1, 1, 2,
  5, 3, 11,
  20, 10, 524288000,
  true, true, true, true,
  true, false, false,
  true, true
),
(
  'pro', 'Pro', 99, 'MYR', true,
  5, 3, 10,
  50, 20, 83,
  NULL, NULL, 10737418240, -- 10 GB; unlimited permits/active permits
  true, true, true, true,
  true, true, true,
  true, true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly = EXCLUDED.price_monthly,
  currency = EXCLUDED.currency,
  is_active = EXCLUDED.is_active,
  max_sites = EXCLUDED.max_sites,
  max_safety_managers = EXCLUDED.max_safety_managers,
  max_safety_coordinators = EXCLUDED.max_safety_coordinators,
  max_internal_staff = EXCLUDED.max_internal_staff,
  max_contractor_admins = EXCLUDED.max_contractor_admins,
  max_total_users = EXCLUDED.max_total_users,
  max_monthly_permits = EXCLUDED.max_monthly_permits,
  max_active_permits = EXCLUDED.max_active_permits,
  max_storage_bytes = EXCLUDED.max_storage_bytes,
  feature_jha = EXCLUDED.feature_jha,
  feature_loto = EXCLUDED.feature_loto,
  feature_gas_testing = EXCLUDED.feature_gas_testing,
  feature_contractor_ptw = EXCLUDED.feature_contractor_ptw,
  feature_basic_reports = EXCLUDED.feature_basic_reports,
  feature_advanced_reports = EXCLUDED.feature_advanced_reports,
  feature_advanced_analytics = EXCLUDED.feature_advanced_analytics,
  feature_notifications = EXCLUDED.feature_notifications,
  feature_printable_permit = EXCLUDED.feature_printable_permit,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. company_subscriptions (subscription belongs to the COMPANY)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id bigint NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_subscriptions_company_status_idx
  ON public.company_subscriptions (company_id, status);

-- One effective (active) subscription per company.
CREATE UNIQUE INDEX IF NOT EXISTS company_subscriptions_one_active_per_company
  ON public.company_subscriptions (company_id)
  WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- 3. RLS — company-scoped reads; ordinary users can never write subscriptions
-- ----------------------------------------------------------------------------

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plans readable by authenticated users" ON public.plans;
CREATE POLICY "Plans readable by authenticated users"
  ON public.plans
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Company users can view own subscription" ON public.company_subscriptions;
CREATE POLICY "Company users can view own subscription"
  ON public.company_subscriptions
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR is_platform_admin()
  );

-- No INSERT/UPDATE/DELETE policies: only the service role (server) may
-- create or change subscriptions, so a client can never set its own plan.
