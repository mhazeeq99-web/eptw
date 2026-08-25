/**
 * Malaysia timezone constants + display helpers.
 *
 * Timestamps are stored in PostgreSQL as timestamptz (correctly, in UTC).
 * This module only standardises the INTERPRETATION/DISPLAY for Malaysian
 * users using Asia/Kuala_Lumpur (+08:00, no DST). Storage is unchanged.
 */
export const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur'

export function formatDateTimeMY(
  value: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: MALAYSIA_TIME_ZONE,
    ...opts,
  }).format(date)
}

export function formatDateMY(
  value: string | null | undefined
): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeZone: MALAYSIA_TIME_ZONE,
  }).format(date)
}
