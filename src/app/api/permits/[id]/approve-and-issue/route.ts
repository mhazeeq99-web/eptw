import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyPermitEvent } from '@/lib/notifications'
import { canActivatePermit } from '@/lib/entitlements'
import { getPermitSafetyReadiness } from '@/lib/safety-readiness'
import { computeValidityWindow } from '@/lib/permit-lifecycle'
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
  // 7. Central safety-readiness gate (Phase D).
  //     Single source of truth shared with the permit detail page:
  //     required safety controls, JHA, LOTO, gas testing, required PPE
  //     selection + verification, site verification, worker briefing and
  //     emergency arrangements. This replaces the previously inline checks
  //     with the exact same blocking messages.
  // ---------------------------------------------------------

  const readiness = await getPermitSafetyReadiness(
    supabase,
    permit.id
  )

  if (!readiness.ready) {
    return NextResponse.json(
      {
        error:
          readiness.blocking_reasons[0] ??
          'Permit is not ready for safety approval',
        blocking_reasons: readiness.blocking_reasons,
        readiness: readiness.items,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7b. Entitlement check: active-permit limit for this company
  //     (server-side; the plan is resolved from the database).
  // ---------------------------------------------------------

  const activeCheck = await canActivatePermit(
    createAdminClient(),
    permit.company_id,
    permit.id
  )

  if (!activeCheck.ok) {
    return NextResponse.json(
      {
        error: activeCheck.error,
        usage: activeCheck.usage,
        limit: activeCheck.limit,
        plan: activeCheck.planCode,
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 8. Approve and issue in one transaction-like update.
  //     Sets the authoritative validity window (Phase F): valid_from =
  //     actual start; valid_until = min(planned_end, valid_from +
  //     max_validity_hours) when the permit type caps validity.
  // ---------------------------------------------------------

  const { data: permitTypeForValidity } = await supabase
    .from('permit_types')
    .select('max_validity_hours')
    .eq('id', permit.permit_type_id ?? -1)
    .maybeSingle()

  const { data: permitForDates } = await supabase
    .from('permits')
    .select('planned_end')
    .eq('id', permit.id)
    .maybeSingle()

  const now = new Date()
  const validity = computeValidityWindow(
    now,
    permitForDates?.planned_end ?? null,
    permitTypeForValidity?.max_validity_hours ?? null
  )

  // Controlled DB transition (Phase 1d): status changes go through the
  // SECURITY DEFINER RPC; raw REST cannot jump to ACTIVE.
  const transition = await performPermitTransition(
    supabase,
    permit.id,
    'pending_approval',
    'active',
    {
      workflow_stage: 'active',
      approved_by: user.id,
      approved_at: now.toISOString(),
      actual_start: now.toISOString(),
      valid_from: validity.valid_from,
      valid_until: validity.valid_until,
    }
  )

  if (!transition.ok) {
    console.error(
      'Failed to approve and issue permit:',
      transition.error
    )
    return NextResponse.json(
      {
        error:
          transition.error ??
          'Failed to approve and issue permit',
      },
      { status: 500 }
    )
  }

  const updatedPermit = {
    id: permit.id,
    permit_no: permit.permit_no,
    status: 'active',
    workflow_stage: 'active',
    approved_by: user.id,
    approved_at: now.toISOString(),
    actual_start: now.toISOString(),
    valid_from: validity.valid_from,
    valid_until: validity.valid_until,
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
