import { formatDateTimeMY } from '@/lib/dates'

export type ExpiryState = 'none' | 'expiring_soon' | 'expired'

/**
 * Unified expiry-state calculation. The authoritative permit expiry is
 * `valid_until` once a permit has been approved/issued; for pre-approval
 * permits (no valid_until) planned_end is only a pre-approval reference and
 * is not treated as the active expiry.
 *
 * This is the SAME clock used across dashboard, permit list, reports, detail
 * page and status badges (mirrors src/lib/permit-lifecycle.getPermitValidity).
 */
export function getExpiryState(
  status: string,
  validUntil: string | null,
  plannedEnd: string | null = null,
  warningMinutes = 120
): ExpiryState {
  // Only ACTIVE permits have a validity state, and only once a validity
  // window (valid_until) has been established at approval.
  if (status !== 'active') return 'none'
  const end = validUntil ?? (status === 'active' ? plannedEnd : null)
  if (!end) return 'none'

  const endMs = new Date(end).getTime()
  if (Number.isNaN(endMs)) return 'none'
  const now = Date.now()

  if (endMs <= now) return 'expired'
  if (endMs - now < warningMinutes * 60 * 1000) return 'expiring_soon'
  return 'none'
}

export function StatusBadge({
  status,
  expiry,
}: {
  status: string
  expiry?: ExpiryState
}) {
  const styles: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    pending_approval:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    issued: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    active: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    suspended:
      'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    completed: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
    closed: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    expired: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    // Safety-document / verification statuses (JHA, LOTO, gas tests). Without
    // these keys "pending" and "verified" both fell through to the neutral
    // fallback, so verified safety records looked identical to unverified
    // ones (DESIGN.md §57 — safety state must be visually obvious).
    pending:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    verified:
      'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
          styles[status] ?? 'bg-muted text-muted-foreground'
        }`}
      >
        {status.replaceAll('_', ' ')}
      </span>

      {expiry === 'expiring_soon' && (
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Expiring Soon
        </span>
      )}

      {expiry === 'expired' && (
        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-red-700 dark:bg-red-950 dark:text-red-300">
          Expired
        </span>
      )}
    </span>
  )
}

export function formatDate(value?: string | null) {
  return formatDateTimeMY(value ?? null)
}
