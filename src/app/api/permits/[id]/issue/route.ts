import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyPermitEvent } from '@/lib/notifications'

// DEPRECATED (legacy supervisor workflow)
// The commercial workflow approves via the Safety Coordinator / Safety
// Manager (approve-and-issue). This route is retained only for permits
// already in the legacy state; it is not reachable from the current UI.

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const { id } = await params

  const supabase = await createClient()

  // ---------------------------------------------------------
  // 1. Authentication
  // ---------------------------------------------------------

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // ---------------------------------------------------------
  // 2. Verify current user's role
  // ---------------------------------------------------------

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  if (!profile.is_active) {
    return NextResponse.json(
      { error: 'Your account is inactive' },
      { status: 403 }
    )
  }

  if (
    profile.role !== 'permit_issuer' &&
    profile.role !== 'admin'
  ) {
    return NextResponse.json(
      {
        error:
          'Only permit issuers or administrators can issue permits',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 3. Get permit
  // ---------------------------------------------------------

  const {
    data: permit,
    error: permitError,
  } = await supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      company_id,
      requester_id,
      status,
      supervisor_id
    `)
    .eq('id', id)
    .single()

  if (permitError || !permit) {
    return NextResponse.json(
      { error: 'Permit not found' },
      { status: 404 }
    )
  }

  // ---------------------------------------------------------
  // 4. Permit must be approved
  // ---------------------------------------------------------

  if (permit.status !== 'approved') {
    return NextResponse.json(
      {
        error:
          `Only approved permits can be issued. Current status: ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 5. Update permit to ISSUED
  // ---------------------------------------------------------

  const {
    data: updatedPermit,
    error: updateError,
  } = await supabase
    .from('permits')
    .update({
      status: 'issued',
    })
    .eq('id', id)
    .eq('status', 'approved')
    .select(`
      id,
      permit_no,
      status
    `)
    .single()

  if (updateError || !updatedPermit) {
    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to issue permit',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 6. Record issuance history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'issued',
        performed_by: user.id,
        remarks:
          'Permit issued for work execution',
      })

  if (historyError) {
    console.error(
      'Failed to create issuance history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          'Permit was issued, but audit history could not be recorded. Please contact support.',
      },
      { status: 500 }
    )
  }

  await notifyPermitEvent(supabase, {
    permit: {
      id: permit.id,
      permit_no: permit.permit_no,
      company_id: permit.company_id,
      requester_id: permit.requester_id,
    },
    event: 'permit_issued',
    actorId: user.id,
  })

  // ---------------------------------------------------------
  // 7. Return success
  // ---------------------------------------------------------

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}