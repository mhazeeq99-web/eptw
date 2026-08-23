export type ExpiryState = 'none' | 'expiring_soon' | 'expired'

export function getExpiryState(
  status: string,
  plannedEnd: string | null
): ExpiryState {
  if (status !== 'active' || !plannedEnd) return 'none'

  const end = new Date(plannedEnd).getTime()
  const now = Date.now()

  if (end < now) return 'expired'

  // Within 24 hours of planned end.
  if (end - now < 24 * 60 * 60 * 1000) return 'expiring_soon'

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
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Expiring Soon
        </span>
      )}

      {expiry === 'expired' && (
        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:bg-red-950 dark:text-red-300">
          Expired
        </span>
      )}
    </span>
  )
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
