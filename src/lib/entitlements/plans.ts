import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompanyUsage, Entitlements, Plan, UserRoleCounts } from './types'
import { getActivePermitCount, getCompanyUserCounts, getMonthlyPermitUsage, getStorageUsage } from './usage'

export const FREE_PLAN_CODE = 'free'
export const PRO_PLAN_CODE = 'pro'

/**
 * Last-resort fallback used only if the plans table cannot be read.
 * Normal operation always resolves the plan from the database so the
 * pricing model stays configurable without code changes.
 */
export const FALLBACK_FREE_PLAN: Plan = {
  id: 0,
  code: FREE_PLAN_CODE,
  name: 'Free',
  price_monthly: 0,
  currency: 'MYR',
  is_active: true,
  max_sites: 1,
  max_safety_managers: 1,
  max_safety_coordinators: 2,
  max_internal_staff: 5,
  max_contractor_admins: 3,
  max_total_users: 11,
  max_monthly_permits: 20,
  max_active_permits: 10,
  max_storage_bytes: 500 * 1024 * 1024,
  feature_jha: true,
  feature_loto: true,
  feature_gas_testing: true,
  feature_contractor_ptw: true,
  feature_basic_reports: true,
  feature_advanced_reports: false,
  feature_advanced_analytics: false,
  feature_notifications: true,
  feature_printable_permit: true,
}

/**
 * Resolves the effective plan for a company.
 *
 * The subscription belongs to the COMPANY. A company with no active
 * subscription (e.g. every existing company after this phase ships)
 * effectively uses the FREE plan — no subscription rows are required.
 *
 * Uses the service-role client so plan determination is authoritative and
 * never depends on the caller's RLS visibility.
 */
export async function getCompanyPlan(
  admin: SupabaseClient,
  companyId: number
): Promise<Plan> {
  const { data: subscription } = await admin
    .from('company_subscriptions')
    .select('plan_id')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle()

  if (subscription) {
    const { data: plan } = await admin
      .from('plans')
      .select('*')
      .eq('id', subscription.plan_id)
      .eq('is_active', true)
      .maybeSingle()

    if (plan) {
      return plan as Plan
    }
  }

  const { data: freePlan } = await admin
    .from('plans')
    .select('*')
    .eq('code', FREE_PLAN_CODE)
    .eq('is_active', true)
    .maybeSingle()

  return (freePlan as Plan) ?? FALLBACK_FREE_PLAN
}

export async function getCompanyUsage(
  admin: SupabaseClient,
  companyId: number
): Promise<CompanyUsage> {
  const [monthlyPermits, activePermits, users, storageBytes] =
    await Promise.all([
      getMonthlyPermitUsage(admin, companyId),
      getActivePermitCount(admin, companyId),
      getCompanyUserCounts(admin, companyId),
      getStorageUsage(admin, companyId),
    ])

  return {
    monthlyPermits,
    activePermits,
    users,
    storageBytes,
    // No sites entity exists yet; multi-site management is a future feature.
    sites: 0,
  }
}

export async function getCompanyEntitlements(
  admin: SupabaseClient,
  companyId: number
): Promise<Entitlements> {
  const [plan, usage] = await Promise.all([
    getCompanyPlan(admin, companyId),
    getCompanyUsage(admin, companyId),
  ])
  return { plan, usage }
}

export type { CompanyUsage, Entitlements, Plan, UserRoleCounts }
