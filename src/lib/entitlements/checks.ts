import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntitlementResult, FeatureKey, Plan } from './types'
import { getCompanyPlan } from './plans'
import {
  getActivePermitCount,
  getCompanyUserCounts,
  getMonthlyPermitUsage,
  getStorageUsage,
} from './usage'

const UPGRADE_HINT =
  'Upgrade to Pro to increase your available capacity.'

function limitError(
  plan: Plan,
  usage: number,
  limit: number | null,
  subject: string
): EntitlementResult {
  return {
    ok: false,
    error: `You've reached the ${plan.name} plan limit (${subject}). ${UPGRADE_HINT}`,
    usage,
    limit,
    planCode: plan.code,
  }
}

function okResult(
  usage: number,
  limit: number | null,
  planCode: string
): EntitlementResult {
  return { ok: true, usage, limit, planCode }
}

/**
 * Server-side check: may the company create a new permit this month?
 * Enforcement is authoritative here — never trust client input for the plan.
 */
export async function canCreatePermit(
  admin: SupabaseClient,
  companyId: number
): Promise<EntitlementResult> {
  const plan = await getCompanyPlan(admin, companyId)

  if (plan.max_monthly_permits == null) {
    return { ok: true, planCode: plan.code }
  }

  const usage = await getMonthlyPermitUsage(admin, companyId)

  if (usage >= plan.max_monthly_permits) {
    return limitError(
      plan,
      usage,
      plan.max_monthly_permits,
      `${plan.max_monthly_permits} permits this month`
    )
  }

  return okResult(usage, plan.max_monthly_permits, plan.code)
}

/**
 * Server-side check: may the permit transition to the active state
 * (approve-and-issue) given the company's active-permit allowance?
 */
export async function canActivatePermit(
  admin: SupabaseClient,
  companyId: number,
  excludePermitId?: number
): Promise<EntitlementResult> {
  const plan = await getCompanyPlan(admin, companyId)

  if (plan.max_active_permits == null) {
    return { ok: true, planCode: plan.code }
  }

  const usage = await getActivePermitCount(
    admin,
    companyId,
    excludePermitId
  )

  if (usage >= plan.max_active_permits) {
    return limitError(
      plan,
      usage,
      plan.max_active_permits,
      `${plan.max_active_permits} active permits`
    )
  }

  return okResult(usage, plan.max_active_permits, plan.code)
}

const ROLE_LIMIT_KEY: Record<
  string,
  'max_safety_managers' | 'max_safety_coordinators' | 'max_internal_staff' | 'max_contractor_admins'
> = {
  safety_manager: 'max_safety_managers',
  safety_coordinator: 'max_safety_coordinators',
  internal_staff: 'max_internal_staff',
  contractor_admin: 'max_contractor_admins',
}

const ROLE_LABEL: Record<string, string> = {
  safety_manager: 'Safety Managers',
  safety_coordinator: 'Safety Coordinators',
  internal_staff: 'Internal Staff',
  contractor_admin: 'Contractor Admins',
}

/**
 * Server-side check: may the company add a user with the given role?
 * Enforces the per-role allowance (except Contractor Admins, which are
 * UNLIMITED on every plan) and the total-user allowance. A NULL per-role
 * limit means unlimited for that role. Contractor Admins belong to contractor
 * orgs (company_id NULL), so they are not company users; the total-user limit
 * only counts company-attributable roles (SM/SC/IS).
 */
export async function canCreateUser(
  admin: SupabaseClient,
  companyId: number,
  role: string,
  excludeUserId?: string
): Promise<EntitlementResult> {
  const plan = await getCompanyPlan(admin, companyId)
  const limitKey = ROLE_LIMIT_KEY[role]

  const counts = await getCompanyUserCounts(
    admin,
    companyId,
    excludeUserId
  )

  // Per-role allowance: skip when the role is unlimited (NULL limit).
  if (limitKey) {
    const roleLimit = plan[limitKey]
    const roleUsage =
      role === 'safety_manager'
        ? counts.safety_manager
        : role === 'safety_coordinator'
          ? counts.safety_coordinator
          : role === 'internal_staff'
            ? counts.internal_staff
            : counts.contractor_admins

    if (roleLimit != null && roleUsage >= roleLimit) {
      return limitError(
        plan,
        roleUsage,
        roleLimit,
        `${roleLimit} ${ROLE_LABEL[role] ?? role}`
      )
    }
  }

  if (counts.total >= plan.max_total_users) {
    return limitError(
      plan,
      counts.total,
      plan.max_total_users,
      `${plan.max_total_users} total users`
    )
  }

  return { ok: true, usage: counts.total, limit: plan.max_total_users, planCode: plan.code }
}

/**
 * Server-side check: may the company add another site?
 * The MVP has no sites entity (areas are not sites); this returns OK with
 * usage 0 and documents that real multi-site management is a future feature.
 */
export async function canAddSite(
  admin: SupabaseClient,
  companyId: number
): Promise<EntitlementResult> {
  const plan = await getCompanyPlan(admin, companyId)
  return { ok: true, usage: 0, limit: plan.max_sites, planCode: plan.code }
}

/**
 * Server-side check: does the company's plan permit attachment uploads at all?
 *
 * Free companies have max_storage_bytes = 0, so attachments are blocked for
 * EVERYONE using that company's PTWs — including authorized contractors. The
 * plan belongs to the PTW-owning company, never to the individual user.
 */
export function planAllowsAttachments(plan: Plan): boolean {
  return (plan.max_storage_bytes ?? 0) > 0
}

/**
 * Server-side check: may the company upload an attachment of the given size
 * (current usage + new file size <= plan storage limit)?
 *
 * The plan is resolved from the PTW-owning company's subscription (the caller
 * passes companyId from the permit). A Free company (0-byte allowance) is
 * always rejected — usage 0 + any size > 0.
 */
export async function canUploadAttachment(
  admin: SupabaseClient,
  companyId: number,
  sizeBytes: number
): Promise<EntitlementResult> {
  const plan = await getCompanyPlan(admin, companyId)

  if (!planAllowsAttachments(plan)) {
    return {
      ok: false,
      error:
        'Attachments are available on Pro. This company is currently using the Free plan. Contact the company\u2019s Safety Manager to upgrade.',
      usage: 0,
      limit: 0,
      planCode: plan.code,
    }
  }

  const usage = await getStorageUsage(admin, companyId)

  if (usage + sizeBytes > plan.max_storage_bytes) {
    return {
      ok: false,
      error: `This company has reached its ${plan.name} attachment storage limit (${formatStorageLimit(plan.max_storage_bytes)}). Free up space or contact support.`,
      usage,
      limit: plan.max_storage_bytes,
      planCode: plan.code,
    }
  }

  return okResult(usage, plan.max_storage_bytes, plan.code)
}

function formatStorageLimit(value: number | null): string {
  if (value == null) return 'Unlimited'
  const gb = value / (1024 * 1024 * 1024)
  if (gb >= 1) {
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`
  }
  const mb = value / (1024 * 1024)
  return `${mb.toFixed(0)} MB`
}

/**
 * Feature gating helper. Core safety functionality is available on every
 * plan; these flags gate optional capabilities (advanced reports, advanced
 * analytics, ...) for future UI.
 */
export function canUseFeature(
  plan: Plan,
  feature: FeatureKey
): boolean {
  return Boolean(plan[feature])
}
