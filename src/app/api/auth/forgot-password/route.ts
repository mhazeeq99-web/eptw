import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPasswordResetEmail } from '@/lib/email'
import {
  getAppAuthRedirectUrl,
  getAppBaseUrl,
  extractInviteToken,
} from '@/lib/app-url'
import { buildExpiringLink } from '@/lib/link-signing'

/**
 * POST /api/auth/forgot-password
 *
 * Sends a branded password-reset email via Resend instead of Supabase's own
 * mailer. The email links to the app's in-app /reset-password page (never the
 * raw Supabase verify URL — same spam-hygiene + PKCE reasons as invitations).
 *
 * Security: always returns the same generic success message whether or not the
 * account exists (no user enumeration). When no matching profile is found the
 * email is simply not sent and the response is identical.
 */
export async function POST(request: Request) {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const email = typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Look up the profile by email WITHOUT revealing existence to the caller.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', email)
    .maybeSingle()

  // Always return the same success envelope.
  const genericResponse = () =>
    NextResponse.json({
      success: true,
      message:
        'If an account exists for this email, a password reset link has been sent.',
    })

  if (!profile) {
    return genericResponse()
  }

  // Generate the secure recovery link via Supabase Auth (server-side). The
  // explicit redirect target keeps the link on THIS app's host.
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
      options: {
        redirectTo: getAppAuthRedirectUrl(request, '/update-password'),
      },
    })

  if (linkError || !linkData?.properties?.action_link) {
    console.error('Failed to generate password-reset link:', linkError)
    return genericResponse()
  }

  const actionLink = linkData.properties.action_link
  const token = extractInviteToken(actionLink)

  // Branded in-app link (https://<app>/reset-password?token=...&iat=...&sig=...)
  // so no raw Supabase URL appears in the email body. The signed issue time
  // makes the link expire after RESET_LINK_TTL_SECONDS (60 minutes) even though
  // Supabase's own ceiling is a single global setting.
  const resetUrl = token
    ? buildExpiringLink(
        getAppBaseUrl(request),
        '/reset-password',
        token,
        'recovery'
      )
    : actionLink

  const result = await sendPasswordResetEmail({
    to: profile.email,
    recipientName: profile.full_name,
    resetUrl,
  })

  if (!result.ok) {
    console.warn(
      `Password-reset email not delivered for ${profile.email}: ${result.error ?? 'unknown error'}`
    )
  }

  return genericResponse()
}
