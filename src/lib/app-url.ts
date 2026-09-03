type HeaderSource = {
  get(name: string): string | null
}

/**
 * Resolves the app origin/base URL that Supabase Auth links (invite /
 * password reset) should redirect back to.
 *
 * Supabase's own project Site URL is frequently NOT the host this Next.js app
 * runs on (localhost:3000 default vs. a dev port or a Vercel deployment), so
 * every generated auth link must carry an explicit redirect target or the
 * invited user lands on the wrong host and cannot complete registration.
 *
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL when set (recommended for production).
 *   2. The host of the incoming request/headers (the caller is on the app).
 */
export function getAppBaseUrl(
  source?: HeaderSource | Request | null
): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  const headers: HeaderSource | null =
    source instanceof Request ? source.headers : (source ?? null)

  const host = headers?.get('x-forwarded-host') ?? headers?.get('host')
  if (host) {
    const forwarded = headers?.get('x-forwarded-proto')
    const proto = forwarded ?? (host.includes('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }

  if (source instanceof Request) {
    try {
      return new URL(source.url).origin
    } catch {
      // fall through
    }
  }

  return 'http://localhost:3000'
}

/**
 * Full URL pointing at the app's /update-password page, where the user sets
 * their password after following an invite / recovery link.
 */
export function getAppAuthRedirectUrl(
  source?: HeaderSource | Request | null,
  path = '/update-password'
): string {
  return `${getAppBaseUrl(source)}${path}`
}

/**
 * Builds the Supabase-hosted verification URL for an invite token. This URL is
 * NEVER placed inside email content — emails link to the app's branded /invite
 * page instead, which keeps raw third-party verification links out of the
 * message body and out of spam scanners' sight. The token is only consumed
 * when the invited user clicks through from the app page.
 */
export function buildSupabaseVerifyUrl(
  token: string,
  source?: HeaderSource | Request | null
): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(
    /\/$/,
    ''
  )

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  const params = new URLSearchParams({
    token,
    type: 'invite',
    redirect_to: getAppAuthRedirectUrl(source, '/update-password'),
  })

  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`
}

/** Extracts the raw invite token from a Supabase generateLink action link. */
export function extractInviteToken(actionLink: string): string | null {
  try {
    return new URL(actionLink).searchParams.get('token')
  } catch {
    return null
  }
}
