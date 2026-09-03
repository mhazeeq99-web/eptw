/**
 * Resolves the app URL that Supabase Auth links (invite / password reset)
 * should redirect back to.
 *
 * Supabase's own project Site URL is frequently NOT the host this Next.js app
 * runs on (localhost:3000 default vs. a dev port or a Vercel deployment), so
 * every generated auth link must carry an explicit redirect target or the
 * invited user lands on the wrong host and cannot complete registration.
 *
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL when set (recommended for production).
 *   2. The origin of the incoming request (the caller is already on the app).
 *
 * Returns a full URL pointing at the app's /update-password page, where the
 * user sets their password after following an invite / recovery link.
 */
export function getAppAuthRedirectUrl(
  request: Request,
  path = '/update-password'
): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) {
    return `${configured.replace(/\/$/, '')}${path}`
  }

  let origin = ''
  try {
    origin = new URL(request.url).origin
  } catch {
    origin = ''
  }

  const forwarded = request.headers.get('x-forwarded-proto')
  const host = request.headers.get('x-forwarded-host') ??
    request.headers.get('host')

  if (host) {
    const proto = forwarded ?? (host.includes('localhost') ? 'http' : 'https')
    return `${proto}://${host}${path}`
  }

  return origin ? `${origin}${path}` : `http://localhost:3000${path}`
}
