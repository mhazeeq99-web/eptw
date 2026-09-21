/**
 * Link lifetime policy (shared by server and client).
 *
 * Supabase enforces a hard ceiling on email-link tokens (Authentication →
 * "Email OTP Expiration"), but that single setting cannot express different
 * lifetimes for an invitation and a password reset. These are the app-level
 * lifetimes: an emailed link carries a signed issue time, and the landing page
 * refuses to continue once the link is older than its policy window.
 *
 * Keep these values in step with Supabase's Email OTP Expiration — a link that
 * the app still considers valid will still be rejected by Supabase once its
 * hard ceiling passes.
 */
export type LinkKind = 'invite' | 'recovery'

/** Staff invitations stay valid for one day. */
export const INVITE_LINK_TTL_SECONDS = 24 * 60 * 60

/** Password-reset links are short-lived: one hour. */
export const RESET_LINK_TTL_SECONDS = 60 * 60

export function linkTtlSeconds(kind: LinkKind): number {
  return kind === 'invite' ? INVITE_LINK_TTL_SECONDS : RESET_LINK_TTL_SECONDS
}

/** Human label used in the UI and in the emails, e.g. "24 hours". */
export function linkTtlLabel(kind: LinkKind): string {
  return kind === 'invite' ? '24 hours' : '60 minutes'
}

/**
 * True when a link issued at `issuedAt` (epoch seconds) is past its window.
 * `null`/`undefined` means the link predates signed timestamps — callers then
 * fall back to Supabase's own expiry rather than treating it as expired.
 */
export function isLinkExpired(
  issuedAt: number | null | undefined,
  kind: LinkKind,
  nowMs: number = Date.now()
): boolean {
  if (issuedAt === null || issuedAt === undefined) return false
  if (!Number.isFinite(issuedAt)) return true
  const ageSeconds = nowMs / 1000 - issuedAt
  return ageSeconds > linkTtlSeconds(kind)
}

/** Epoch seconds at which a link issued at `issuedAt` stops working. */
export function linkExpiresAt(
  issuedAt: number | null | undefined,
  kind: LinkKind
): number | null {
  if (issuedAt === null || issuedAt === undefined || !Number.isFinite(issuedAt)) {
    return null
  }
  return issuedAt + linkTtlSeconds(kind)
}
