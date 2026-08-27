import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRoleCounts } from './types'

/**
 * Statuses that count as an "active operational" permit for the active-permit
 * limit. Suspended permits are still live operational work, so they count;
 * drafts, pending/rejected/cancelled/completed/closed permits do not.
 */
export const ACTIVE_PERMIT_STATUSES = ['active', 'suspended']

/** Start of the current calendar month, UTC (created_at is stored in UTC). */
function startOfCurrentMonthUTC(): string {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString()
}

/**
 * Permits created by the company in the current calendar month that consume
 * the monthly allowance.
 *
 * A permit consumes the monthly allowance once it has genuinely entered the
 * operational permit workflow:
 *   - draft                            -> does NOT count (never submitted)
 *   - rejected                         -> does NOT count (never activated)
 *   - cancelled, valid_from IS NULL    -> does NOT count (cancelled before
 *                                          ever becoming operational, e.g.
 *                                          from draft/pending/approved/issued)
 *   - cancelled, valid_from IS NOT NULL-> counts (was activated then cancelled,
 *                                          e.g. suspended -> cancelled)
 *   - submitted / pending_approval / approved / issued / active / suspended /
 *     completed / closed               -> counts
 *
 * Abandoned or in-progress drafts therefore do not silently deplete the Free
 * monthly quota (draft-first Create flow), and drafts remain usable/editable
 * even after the limit is hit because they are excluded here.
 *
 * Deleted QA records no longer exist, and previous months are excluded.
 */
export async function getMonthlyPermitUsage(
  admin: SupabaseClient,
  companyId: number
): Promise<number> {
  const { count } = await admin
    .from('permits')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .not('status', 'in', '("draft","rejected")')
    .or(
      'and(status.neq.cancelled),and(status.eq.cancelled,valid_from.not.is.null)'
    )
    .gte('created_at', startOfCurrentMonthUTC())

  return count ?? 0
}

/**
 * Permits in an active operational state (active / suspended) for the
 * company. Optionally excludes one permit id (e.g. the permit being
 * approved).
 */
export async function getActivePermitCount(
  admin: SupabaseClient,
  companyId: number,
  excludePermitId?: number
): Promise<number> {
  let query = admin
    .from('permits')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ACTIVE_PERMIT_STATUSES)

  if (excludePermitId != null) {
    query = query.neq('id', excludePermitId)
  }

  const { count } = await query
  return count ?? 0
}

/**
 * Active company users per role. platform_admin is a platform-level role and
 * is never counted against company limits. contractor_admins belong to
 * contractor orgs (company_id IS NULL), so the company-side count is 0 in the
 * current schema; the limit is stored for when contractor capacity becomes
 * company-attributable.
 */
export async function getCompanyUserCounts(
  admin: SupabaseClient,
  companyId: number,
  excludeUserId?: string
): Promise<UserRoleCounts> {
  let query = admin
    .from('profiles')
    .select('role')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .neq('role', 'platform_admin')

  if (excludeUserId) {
    query = query.neq('id', excludeUserId)
  }

  const { data: profiles } = await query

  const counts: UserRoleCounts = {
    safety_manager: 0,
    safety_coordinator: 0,
    internal_staff: 0,
    contractor_admins: 0,
    total: 0,
  }

  for (const profile of profiles ?? []) {
    if (profile.role === 'safety_manager') {
      counts.safety_manager += 1
    } else if (profile.role === 'safety_coordinator') {
      counts.safety_coordinator += 1
    } else if (profile.role === 'internal_staff') {
      counts.internal_staff += 1
    } else if (profile.role === 'contractor_admin') {
      counts.contractor_admins += 1
    }
  }

  counts.total =
    counts.safety_manager +
    counts.safety_coordinator +
    counts.internal_staff +
    counts.contractor_admins

  return counts
}

/**
 * Total bytes of permit attachments owned by the company (per-company, not
 * per-user). Existing attachments stay visible regardless of plan changes.
 */
export async function getStorageUsage(
  admin: SupabaseClient,
  companyId: number
): Promise<number> {
  const { data } = await admin
    .from('permit_attachments')
    .select(
      'size_bytes, permits!permit_attachments_permit_id_fkey(company_id)'
    )
    .eq('permits.company_id', companyId)

  let total = 0
  for (const attachment of data ?? []) {
    total += Number(attachment.size_bytes ?? 0)
  }
  return total
}
