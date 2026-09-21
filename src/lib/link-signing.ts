import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import {
  isLinkExpired,
  linkTtlSeconds,
  type LinkKind,
} from './link-policy'

/**
 * Signed, expiring email links (server-only).
 *
 * Emailed links carry the issue time plus an HMAC over `kind:token:issuedAt`,
 * so the landing page can tell an untouched link from a tampered or stale one
 * without a database round-trip and without storing per-request state:
 *
 *   /invite?token=<hash>&iat=<epoch seconds>&sig=<hmac>
 *   /reset-password?token=<hash>&iat=<epoch seconds>&sig=<hmac>
 *
 * The signature is keyed with the service-role key (already server-only, so no
 * new secret to deploy). Links issued before this feature existed have no
 * iat/sig and are treated as legacy: they still work, bounded by Supabase's own
 * token expiry.
 */

function signingSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!secret) {
    // No secret available: signing is impossible. Callers degrade to legacy
    // (unsigned) links rather than breaking the flow.
    return ''
  }

  return secret
}

function payload(kind: LinkKind, token: string, issuedAt: number): string {
  return `${kind}:${token}:${issuedAt}`
}

export function signLink(
  kind: LinkKind,
  token: string,
  issuedAt: number
): string | null {
  const secret = signingSecret()
  if (!secret) return null

  return createHmac('sha256', secret)
    .update(payload(kind, token, issuedAt))
    .digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')

  if (bufferA.length !== bufferB.length) return false

  return timingSafeEqual(bufferA, bufferB)
}

export type SignedLinkCheck = {
  /** The link may be used (signature valid and within its window). */
  ok: boolean
  /** The link was correctly signed but is past its policy window. */
  expired: boolean
  /** The iat/sig pair is missing, or was tampered with / signed elsewhere. */
  invalid: boolean
  /** True when the link predates signed timestamps (rely on Supabase expiry). */
  legacy: boolean
}

/**
 * Validates the `iat`/`sig` pair for a link. Never throws.
 *
 * Note: this is the *policy* layer. Supabase's own token expiry remains the
 * hard security boundary — a caller who bypassed this page would still be
 * stopped by Supabase once its Email OTP Expiration passes.
 */
export function checkSignedLink(
  kind: LinkKind,
  token: string,
  issuedAtRaw: string | null | undefined,
  signatureRaw: string | null | undefined,
  nowMs: number = Date.now()
): SignedLinkCheck {
  const legacy = !issuedAtRaw || !signatureRaw

  if (legacy) {
    return { ok: true, expired: false, invalid: false, legacy: true }
  }

  const issuedAt = Number(issuedAtRaw)

  if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
    return { ok: false, expired: false, invalid: true, legacy: false }
  }

  const expected = signLink(kind, token, issuedAt)

  if (!expected || !safeEqual(expected, signatureRaw as string)) {
    return { ok: false, expired: false, invalid: true, legacy: false }
  }

  if (isLinkExpired(issuedAt, kind, nowMs)) {
    return { ok: false, expired: true, invalid: false, legacy: false }
  }

  return { ok: true, expired: false, invalid: false, legacy: false }
}

/**
 * Builds an expiring, signed link on the app's own domain.
 * Falls back to an unsigned link when no signing secret is configured.
 */
export function buildExpiringLink(
  baseUrl: string,
  path: string,
  token: string,
  kind: LinkKind,
  nowMs: number = Date.now()
): string {
  const issuedAt = Math.floor(nowMs / 1000)
  const signature = signLink(kind, token, issuedAt)
  const base = `${baseUrl.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`

  if (!signature) return base

  return `${base}&iat=${issuedAt}&sig=${signature}`
}

export { linkTtlSeconds, isLinkExpired }
export type { LinkKind }
