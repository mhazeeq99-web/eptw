import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitationEmail } from '@/lib/email'
import {
  getAppAuthRedirectUrl,
  getAppBaseUrl,
  extractInviteToken,
} from '@/lib/app-url'
import { buildExpiringLink } from '@/lib/link-signing'

/**
 * Resends the invitation (password-setup link) for an invited internal-staff
 * or safety-coordinator user.
 * Server-side authorized:
 *   - authenticated requester
 *   - Safety Manager
 *   - requester and target user share the same company
 *   - target role is internal_staff or safety_coordinator
 *   - target account is still INVITED (invitation_sent_at set)
 * Never creates a duplicate Auth account or profile; the existing user id is
 * reused.
 *
 * Body (optional): { send_email?: boolean }
 *   - send_email defaults to true (resend the invitation email).
 *   - When false, a fresh invite link is generated and returned WITHOUT
 *     sending an email (used by the "Copy Invitation Link" action so the
 *     Safety Manager can share registration directly when email is down).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: { send_email?: boolean } = {}
  try {
    const parsed = await request.json()
    if (parsed && typeof parsed === 'object') {
      body = parsed as { send_email?: boolean }
    }
  } catch {
    // No body / invalid JSON -> treat as a normal resend.
  }

  const sendEmailRequested = body.send_email !== false

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: requester, error: requesterError } = await supabase
    .from('profiles')
    .select('id, role, company_id, is_active')
    .eq('id', user.id)
    .single()

  if (requesterError || !requester) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  if (!requester.is_active) {
    return NextResponse.json(
      { error: 'Your account is inactive' },
      { status: 403 }
    )
  }

  if (requester.role !== 'safety_manager') {
    return NextResponse.json(
      { error: 'Only a Safety Manager can resend invitations' },
      { status: 403 }
    )
  }

  if (!requester.company_id) {
    return NextResponse.json(
      { error: 'You are not assigned to a company' },
      { status: 400 }
    )
  }

  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, company_id, is_active, invitation_sent_at')
    .eq('id', id)
    .single()

  if (targetError || !target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (target.company_id !== requester.company_id) {
    return NextResponse.json(
      { error: 'User does not belong to your company' },
      { status: 403 }
    )
  }

  if (target.role !== 'internal_staff' && target.role !== 'safety_coordinator') {
    return NextResponse.json(
      { error: 'Only internal staff and safety coordinator invitations can be resent' },
      { status: 400 }
    )
  }

  if (target.is_active === false) {
    return NextResponse.json(
      { error: 'This account is disabled and cannot be invited.' },
      { status: 400 }
    )
  }

  if (!target.invitation_sent_at) {
    // Already active (password set) — do not send another activation invite.
    return NextResponse.json(
      { error: 'This account is already active.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Explicit redirect target: Supabase's project Site URL is not this app's
  // host, so without it the invited user cannot complete registration.
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.generateLink({
      type: 'invite',
      email: target.email,
      options: {
        redirectTo: getAppAuthRedirectUrl(request),
      },
    })

  if (inviteError || !inviteData?.properties?.action_link) {
    console.error('Failed to regenerate invitation link:', inviteError)
    return NextResponse.json(
      { error: 'Unable to resend the invitation. Please try again.' },
      { status: 500 }
    )
  }

  const inviteLink = inviteData.properties.action_link

  // Spam hygiene: email and copied links point to the app's branded /invite
  // page (https://<app>/invite?token=...) rather than the raw Supabase URL,
  // keeping third-party verification links out of email content.
  const token = extractInviteToken(inviteLink)
  const brandedInviteUrl = token
    ? buildExpiringLink(getAppBaseUrl(request), '/invite', token, 'invite')
    : inviteLink

  // Update invitation_sent_at (same account, no duplicate). Audit event.
  const { error: updateError } = await admin
    .from('profiles')
    .update({ invitation_sent_at: new Date().toISOString() })
    .eq('id', target.id)

  if (updateError) {
    console.error('Failed to update invitation timestamp:', updateError)
  }

  // Audit: server log only — never records passwords, tokens or secrets.
  console.info(
    `[audit] invitation_${sendEmailRequested ? 'resent' : 'link_generated'} actor=${requester.id} target=${target.id} company=${requester.company_id}`
  )

  // Deliver the invitation email via Resend (best-effort) when requested. A
  // failure is logged but does NOT fail the resend — the invitation link is
  // refreshed regardless so the Safety Manager can retry or share it.
  let emailSent = false
  if (sendEmailRequested) {
    try {
      const { data: company } = await admin
        .from('companies')
        .select('name')
        .eq('id', requester.company_id ?? -1)
        .maybeSingle()

      const result = await sendInvitationEmail({
        to: target.email,
        fullName: target.full_name ?? null,
        role: target.role,
        companyName: company?.name ?? null,
        inviteLink: brandedInviteUrl,
      })

      emailSent = result.ok
      if (!result.ok) {
        console.warn(
          `Resent invitation email not delivered for ${target.email}: ${result.error ?? 'unknown error'}`
        )
      }
    } catch (error) {
      console.error(
        'Failed to send resend-invitation email:',
        error
      )
    }
  }

  return NextResponse.json({
    success: true,
    message: sendEmailRequested
      ? emailSent
        ? 'Invitation resent successfully.'
        : 'Invitation link refreshed. The email could not be sent — copy the link below to share it with the user.'
      : 'Invitation link generated.',
    email_sent: emailSent,
    invite_link: brandedInviteUrl,
  })
}
