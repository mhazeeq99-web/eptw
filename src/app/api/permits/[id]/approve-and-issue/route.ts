import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyPermitEvent } from '@/lib/notifications'

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
        permit_type_id,
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
  // 7. Enforce verified mandatory safety controls
  // ---------------------------------------------------------

  const {
    data: safetyControls,
    error: safetyControlsError,
  } = await supabase
    .from('permit_safety_controls')
    .select(`
      id,
      is_required,
      status,
      safety_control:safety_controls (
        code,
        name
      )
    `)
    .eq('permit_id', permit.id)
    .eq('is_required', true)

  if (safetyControlsError) {
    return NextResponse.json(
      {
        error:
          'Unable to verify permit safety controls',
      },
      { status: 500 }
    )
  }

  if (!safetyControls || safetyControls.length === 0) {
    return NextResponse.json(
      {
        error:
          'Permit cannot be approved because no safety controls are configured for this permit.',
      },
      { status: 400 }
    )
  }

  const incompleteControls = (
    safetyControls as unknown as Array<{
      status: string
      safety_control: {
        code: string
        name: string
      } | null
    }>
  ).filter((control) => control.status !== 'verified')

  if (incompleteControls.length > 0) {
    return NextResponse.json(
      {
        error:
          'Permit cannot be approved because required safety controls are not verified.',
        incomplete_controls: incompleteControls.map(
          (control) => ({
            code: control.safety_control?.code ?? null,
            name:
              control.safety_control?.name ??
              'Safety Control',
            status: control.status,
          })
        ),
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7b. Enforce JHA / LOTO / gas-test requirements when the
  //     permit type requires them.
  // ---------------------------------------------------------

  const {
    data: permitType,
    error: permitTypeError,
  } = await supabase
    .from('permit_types')
    .select(`
      id,
      requires_jha,
      requires_loto,
      requires_gas_test
    `)
    .eq('id', permit.permit_type_id ?? -1)
    .single()

  if (permitTypeError || !permitType) {
    return NextResponse.json(
      {
        error:
          'Permit type could not be resolved for approval checks',
      },
      { status: 500 }
    )
  }

  if (permitType.requires_jha) {
    const { data: jha } = await supabase
      .from('jhas')
      .select('id')
      .eq('permit_id', permit.id)
      .eq('status', 'verified')
      .maybeSingle()

    if (!jha) {
      return NextResponse.json(
        {
          error:
            'This permit type requires a verified JHA/JSA before approval.',
        },
        { status: 400 }
      )
    }
  }

  if (permitType.requires_loto) {
    const { data: loto } = await supabase
      .from('loto_isolation_points')
      .select('id')
      .eq('permit_id', permit.id)
      .eq('status', 'verified')
      .limit(1)
      .maybeSingle()

    if (!loto) {
      return NextResponse.json(
        {
          error:
            'This permit type requires verified LOTO isolation before approval.',
        },
        { status: 400 }
      )
    }
  }

  if (permitType.requires_gas_test) {
    const { data: gasTest } = await supabase
      .from('gas_tests')
      .select('id')
      .eq('permit_id', permit.id)
      .eq('status', 'verified')
      .limit(1)
      .maybeSingle()

    if (!gasTest) {
      return NextResponse.json(
        {
          error:
            'This permit type requires a verified gas test before approval.',
        },
        { status: 400 }
      )
    }
  }

  // ---------------------------------------------------------
  // 8. Approve and issue in one transaction-like update
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
  // 8. Record audit history (approved + issued separately —
  //     both are existing approval_action enum values).
  // ---------------------------------------------------------

  const { error: approveHistoryError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'approved',
        performed_by: user.id,
        remarks:
          'Permit approved by Safety Coordinator / Safety Manager',
      })

  if (approveHistoryError) {
    console.error(
      'Failed to create approval history:',
      approveHistoryError
    )

    return NextResponse.json(
      {
        error:
          'Permit was approved and issued, but audit history could not be recorded.',
      },
      { status: 500 }
    )
  }

  const { error: issueHistoryError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'issued',
        performed_by: user.id,
        remarks:
          'Permit issued. Work may commence.',
      })

  if (issueHistoryError) {
    console.error(
      'Failed to create issuance history:',
      issueHistoryError
    )

    return NextResponse.json(
      {
        error:
          'Permit was approved and issued, but issuance history could not be recorded.',
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
    event: 'permit_approved',
    actorId: user.id,
  })

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}
