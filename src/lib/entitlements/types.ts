/**
 * ePTW — entitlement model types.
 *
 * Plan configuration lives in the database (public.plans). NULL numeric
 * limits mean "unlimited". Feature flags gate optional capabilities only —
 * core safety functionality (PTW, JHA/JSA, LOTO, gas testing, safety
 * controls, audit history, printable permit) is available on every plan.
 */

export type Plan = {
  id: number
  code: string
  name: string
  price_monthly: number
  currency: string
  is_active: boolean
  // Numeric limits (null = unlimited)
  max_sites: number
  max_safety_managers: number
  max_safety_coordinators: number
  max_internal_staff: number
  max_contractor_admins: number
  max_total_users: number
  max_monthly_permits: number | null
  max_active_permits: number | null
  max_storage_bytes: number
  // Feature flags
  feature_jha: boolean
  feature_loto: boolean
  feature_gas_testing: boolean
  feature_contractor_ptw: boolean
  feature_basic_reports: boolean
  feature_advanced_reports: boolean
  feature_advanced_analytics: boolean
  feature_notifications: boolean
  feature_printable_permit: boolean
}

export type FeatureKey =
  | 'feature_jha'
  | 'feature_loto'
  | 'feature_gas_testing'
  | 'feature_contractor_ptw'
  | 'feature_basic_reports'
  | 'feature_advanced_reports'
  | 'feature_advanced_analytics'
  | 'feature_notifications'
  | 'feature_printable_permit'

export type UserRoleCounts = {
  safety_manager: number
  safety_coordinator: number
  internal_staff: number
  /** Contractor Admins belong to contractor orgs, not the company. */
  contractor_admins: number
  total: number
}

export type CompanyUsage = {
  /** Permits created by the company in the current calendar month. */
  monthlyPermits: number
  /** Permits in an active operational state (active / suspended). */
  activePermits: number
  users: UserRoleCounts
  /** Total bytes of permit attachments for the company. */
  storageBytes: number
  /** Always 0 until a real sites entity exists (future feature). */
  sites: number
}

export type Entitlements = {
  plan: Plan
  usage: CompanyUsage
}

export type EntitlementResult = {
  ok: boolean
  error?: string
  usage?: number
  limit?: number | null
  planCode?: string
}
