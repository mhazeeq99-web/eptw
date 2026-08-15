import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  // 2. Get current user's profile
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
  // 3. Safety Coordinator OR Safety Manager
  // ---------------------------------------------------------

  if (
    profile.role !== 'safety_coordinator' &&
    profile.role !== 'safety_manager'
  ) {
    return NextResponse.json(
      {
        error:
          'Only Safety Coordinator or Safety Manager can approve and issue a permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 4. Get permit
  // ---------------------------------------------------------

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select(`
        id,
        permit_no,
        company_id,
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
  // 5. Verify company
  // ---------------------------------------------------------

  if (
    !profile.company_id ||
    permit.company_id !== profile.company_id
  ) {
    return NextResponse.json(
      {
        error:
          'You can only approve permits for your own company',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 6. Permit must be awaiting safety approval
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
  // 7. Approve and issue in one transaction-like update
  // ---------------------------------------------------------

  const {
    data: updatedPermit,
    error: updateError,
  } = await supabase
    .from('permits')
    .update({
      status: 'active',
      workflow_stage: 'active',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      actual_start: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending_approval')
    .eq('workflow_stage', 'safety_approval')
    .select(`
      id,
      permit_no,
      status,
      workflow_stage,
      approved_by,
      approved_at,
      actual_start
    `)
    .single()

  if (updateError || !updatedPermit) {
    console.error(
      'Failed to approve and issue permit:',
      updateError
    )

    return NextResponse.json(
      {
        error:
          updateError?.message ??
          'Failed to approve and issue permit',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 8. Record audit history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'approved_and_issued',
        performed_by: user.id,
        remarks:
          'Permit approved and issued. Work may commence.',
      })

  if (historyError) {
    console.error(
      'Failed to create approval history:',
      historyError
    )
  }

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}
