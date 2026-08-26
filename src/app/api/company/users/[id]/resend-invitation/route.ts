import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Resends the internal-staff invitation (password-setup link).
 * Server-side authorized:
 *   - authenticated requester
 *   - Safety Manager
 *   - requester and target user share the same company
 *   - target role is internal_staff
 *   - target account is still INVITED (invitation_sent_at set)
 * Never creates a duplicate Auth account or profile; the existing user id is
 * reused. Simple server-side rate limit prevents rapid repeated requests.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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
    .select('id, email, role, company_id, is_active, invitation_sent_at')
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

  if (target.role !== 'internal_staff') {
    return NextResponse.json(
      { error: 'Only internal staff invitations can be resent' },
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

  // Simple server-side rate limit: allow a resend at most every 60 seconds.
  const lastSent = new Date(target.invitation_sent_at).getTime()
  const now = Date.now()
  if (now - lastSent < 60_000) {
    return NextResponse.json(
      { error: 'Please wait a minute before resending the invitation.' },
      { status: 429 }
    )
  }

  const admin = createAdminClient()

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.generateLink({
      type: 'invite',
      email: target.email,
    })

  if (inviteError || !inviteData?.properties?.action_link) {
    console.error('Failed to regenerate invitation link:', inviteError)
    return NextResponse.json(
      { error: 'Unable to resend the invitation. Please try again.' },
      { status: 500 }
    )
  }

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
    `[audit] invitation_resent actor=${requester.id} target=${target.id} company=${requester.company_id}`
  )

  if (!process.env.SMTP_HOST) {
    console.info(
      'Invitation resent; SMTP not configured — the invitation email will not be delivered until SMTP is configured.'
    )
  }

  return NextResponse.json({
    success: true,
    message: 'Invitation resent successfully.',
  })
}
