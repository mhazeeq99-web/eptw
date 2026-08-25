import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyPermitEvent } from '@/lib/notifications'
import { performPermitTransition } from '@/lib/permit-transition'

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
  // 2. Current user's profile
  // ---------------------------------------------------------

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select(`
        id,
        role,
        company_id,
        is_active
      `)
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

  // ---------------------------------------------------------
  // 3. Safety roles only
  // ---------------------------------------------------------

  if (
    profile.role !== 'safety_coordinator' &&
    profile.role !== 'safety_manager'
  ) {
    return NextResponse.json(
      {
        error:
          'Only Safety Coordinator or Safety Manager can reject a permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 4. Read remarks (required)
  // ---------------------------------------------------------

  let body: {
    remarks?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const remarks =
    typeof body.remarks === 'string'
      ? body.remarks.trim()
      : ''

  if (!remarks) {
    return NextResponse.json(
      {
        error:
          'Please provide a reason when rejecting a permit',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 5. Get permit
  // ---------------------------------------------------------

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select(`
        id,
        permit_no,
        company_id,
        requester_id,
        status,
        workflow_stage
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
  // 6. Verify company ownership
  // ---------------------------------------------------------

  if (
    profile.role !== 'platform_admin' &&
    (!profile.company_id ||
      permit.company_id !== profile.company_id)
  ) {
    return NextResponse.json(
      {
        error:
          'You can only reject permits for your own company',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 7. Permit must be awaiting safety approval
  // ---------------------------------------------------------

  if (
    permit.status !== 'pending_approval' ||
    permit.workflow_stage !== 'safety_approval'
  ) {
    return NextResponse.json(
      {
        error:
          'This permit is not awaiting safety approval',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Reject the permit (controlled DB transition)
  // ---------------------------------------------------------

  const transition = await performPermitTransition(
    supabase,
    permit.id,
    'pending_approval',
    'rejected',
    { rejection_reason: remarks }
  )

  if (!transition.ok) {
    console.error(
      'Failed to reject permit:',
      transition.error
    )
    return NextResponse.json(
      {
        error:
          transition.error ?? 'Unable to reject permit',
      },
      { status: 500 }
    )
  }

  const updatedPermit = {
    id: permit.id,
    permit_no: permit.permit_no,
    status: 'rejected',
    rejection_reason: remarks,
  }

  // ---------------------------------------------------------
  // 9. Record audit history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'rejected',
        performed_by: user.id,
        remarks,
      })

  if (historyError) {
    console.error(
      'Failed to create rejection history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          'Permit was rejected, but audit history could not be recorded. Please contact support.',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 10. Notify the requester
  // ---------------------------------------------------------

  await notifyPermitEvent(supabase, {
    permit: {
      id: permit.id,
      permit_no: permit.permit_no,
      company_id: permit.company_id,
      requester_id: permit.requester_id,
    },
    event: 'permit_rejected',
    actorId: user.id,
  })

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}
