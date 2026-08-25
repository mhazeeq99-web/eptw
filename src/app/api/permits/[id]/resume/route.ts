import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyPermitEvent } from '@/lib/notifications'
import { getPermitSafetyReadiness } from '@/lib/safety-readiness'
import { performPermitTransition } from '@/lib/permit-transition'
import {
  ensureResumeChecklist,
  getPermitValidity,
  INTRINSICALLY_APPLICABLE_KEYS,
  type PermitTypeConfig,
} from '@/lib/permit-lifecycle'

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
  // 2. Verify user's role
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
    profile.role !== 'safety_manager' &&
    profile.role !== 'safety_coordinator'
  ) {
    return NextResponse.json(
      {
        error:
          'Only Safety Manager or Safety Coordinator can resume permits',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 3. Read request body
  // ---------------------------------------------------------

  let body: {
    remarks?: string
    checklist?: Array<{
      item_key?: string
      status?: string
      remarks?: string | null
    }>
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
          'A reason is required when resuming a permit',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 4. Get permit
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
      permit_type_id,
      valid_from,
      valid_until,
      planned_end
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
  // 5. Permit must be SUSPENDED
  // ---------------------------------------------------------

  if (permit.status !== 'suspended') {
    return NextResponse.json(
      {
        error:
          `Only suspended permits can be resumed. Current status: ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Validity gate: an expired permit cannot resume active work.
  // ---------------------------------------------------------

  const validity = getPermitValidity(
    {
      status: 'active', // evaluate against the would-be active window
      valid_from: permit.valid_from ?? null,
      valid_until: permit.valid_until ?? null,
      planned_start: null,
      planned_end: permit.planned_end ?? null,
    },
    120
  )

  if (validity.state === 'expired') {
    return NextResponse.json(
      {
        error:
          'Resume blocked: Permit has expired and cannot be resumed for continued work.',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Revalidation checklist (Phase F): every applicable item must
  //    be completed by the authorised safety role before resuming.
  //    Intrinsically-applicable safety items can never be marked N/A.
  // ---------------------------------------------------------

  const { data: permitType } = await supabase
    .from('permit_types')
    .select(`
      code,
      requires_jha,
      requires_loto,
      requires_gas_test,
      requires_site_verification,
      requires_worker_briefing,
      requires_emergency_arrangements
    `)
    .eq('id', permit.permit_type_id ?? -1)
    .maybeSingle()

  const type = permitType as PermitTypeConfig | null

  const { count: workerCount } = await supabase
    .from('permit_workers')
    .select('id', { count: 'exact', head: true })
    .eq('permit_id', permit.id)

  await ensureResumeChecklist(
    supabase,
    permit.id,
    type,
    workerCount ?? 0
  )

  const { data: checklistRows } = await supabase
    .from('permit_resume_checklists')
    .select('item_key, label, status')
    .eq('permit_id', permit.id)

  // Apply submitted checklist updates (verified by the acting user). An
  // intrinsically-applicable item may only be marked completed — never N/A.
  const submitted = Array.isArray(body.checklist)
    ? body.checklist
    : []

  const nowIso = new Date().toISOString()

  for (const item of submitted) {
    if (
      !item.item_key ||
      (item.status !== 'completed' &&
        item.status !== 'not_applicable')
    ) {
      continue
    }
    if (
      item.status === 'not_applicable' &&
      INTRINSICALLY_APPLICABLE_KEYS.has(item.item_key)
    ) {
      return NextResponse.json(
        {
          error:
            `Resume blocked: '${item.item_key}' is an applicable safety condition and cannot be marked not applicable.`,
        },
        { status: 400 }
      )
    }
    await supabase
      .from('permit_resume_checklists')
      .update({
        status: item.status,
        verified_by: user.id,
        verified_at: nowIso,
        remarks:
          typeof item.remarks === 'string' && item.remarks.trim()
            ? item.remarks.trim()
            : null,
        updated_at: nowIso,
      })
      .eq('permit_id', permit.id)
      .eq('item_key', item.item_key)
  }

  const { data: finalRows } = await supabase
    .from('permit_resume_checklists')
    .select('item_key, label, status')
    .eq('permit_id', permit.id)

  const incomplete = (finalRows ?? []).filter(
    (item) => item.status === 'applicable'
  )

  if (incomplete.length > 0) {
    const first = incomplete[0]
    return NextResponse.json(
      {
        error: `Resume blocked: ${first.label}.`,
        incomplete: incomplete.map((item) => item.item_key),
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7b. Re-run the CENTRAL readiness engine on the CURRENT permit state.
  //     Resume is NOT merely "SUSPENDED -> ACTIVE": if any current safety
  //     requirement is now failed (gas test FAIL, PPE unverified, site
  //     verification failed, JHA unverified, required controls unverified,
  //     etc.), resume MUST be rejected and the permit stays SUSPENDED.
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
          'Resume blocked: current safety requirements are not satisfied.',
        blocking_reasons: readiness.blocking_reasons,
        readiness: readiness.items,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Change status to ACTIVE (controlled DB transition)
  // ---------------------------------------------------------

  const transition = await performPermitTransition(
    supabase,
    permit.id,
    'suspended',
    'active',
    { suspension_reason: null }
  )

  if (!transition.ok) {
    return NextResponse.json(
      {
        error:
          transition.error ?? 'Unable to resume permit',
      },
      { status: 500 }
    )
  }

  const updatedPermit = {
    id: permit.id,
    permit_no: permit.permit_no,
    status: 'active',
  }

  // ---------------------------------------------------------
  // 9. Record resume history (exactly one audit record)
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'resumed',
        performed_by: user.id,
        remarks,
      })

  if (historyError) {
    console.error(
      'Failed to create resume history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          'Permit was resumed, but audit history could not be recorded. Please contact support.',
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
    event: 'permit_resumed',
    actorId: user.id,
  })

  // ---------------------------------------------------------
  // 10. Return success
  // ---------------------------------------------------------

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}
