import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyPermitEvent } from '@/lib/notifications'
import { ensureCompletionChecklist } from '@/lib/permit-lifecycle'
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
          'Only Safety Manager or Safety Coordinator can complete permits',
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
      completed?: boolean
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
          'A completion remark is required',
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
      status
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
  // 5. Permit must be ACTIVE
  // ---------------------------------------------------------

  if (permit.status !== 'active') {
    return NextResponse.json(
      {
        error:
          `Only active permits can be completed. Current status: ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Completion checklist (Phase F): required items must be
  //    completed before the work can be marked finished.
  // ---------------------------------------------------------

  await ensureCompletionChecklist(supabase, permit.id)

  const submitted = Array.isArray(body.checklist)
    ? body.checklist
    : []

  const submittedMap = new Map<string, boolean>()
  for (const item of submitted) {
    if (item.item_key) {
      submittedMap.set(item.item_key, item.completed === true)
    }
  }

  for (const [key, completed] of submittedMap) {
    await supabase
      .from('permit_completion_checklists')
      .update({
        completed,
        updated_at: new Date().toISOString(),
      })
      .eq('permit_id', permit.id)
      .eq('item_key', key)
  }

  const { data: checklistRows } = await supabase
    .from('permit_completion_checklists')
    .select('item_key, label, is_required, completed')
    .eq('permit_id', permit.id)

  const missingRequired = (checklistRows ?? []).filter(
    (item) => item.is_required && !item.completed
  )

  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        error: `Completion blocked: ${missingRequired[0].label} has not been completed.`,
        incomplete: missingRequired.map((item) => item.item_key),
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Change status to COMPLETED (controlled DB transition; records
  //    Completed By/At)
  // ---------------------------------------------------------

  const transition = await performPermitTransition(
    supabase,
    permit.id,
    'active',
    'completed',
    {
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    }
  )

  if (!transition.ok) {
    return NextResponse.json(
      {
        error:
          transition.error ?? 'Unable to complete permit',
      },
      { status: 500 }
    )
  }

  const updatedPermit = {
    id: permit.id,
    permit_no: permit.permit_no,
    status: 'completed',
    completed_by: user.id,
    completed_at: new Date().toISOString(),
  }

  // ---------------------------------------------------------
  // 8. Record completion history (exactly one audit record)
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'completed',
        performed_by: user.id,
        remarks,
      })

  if (historyError) {
    console.error(
      'Failed to create completion history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          'Permit was completed, but audit history could not be recorded. Please contact support.',
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
    event: 'permit_completed',
    actorId: user.id,
  })

  // ---------------------------------------------------------
  // 9. Return success
  // ---------------------------------------------------------

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}
