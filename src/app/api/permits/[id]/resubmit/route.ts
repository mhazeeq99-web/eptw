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
  // 2. Get permit
  // ---------------------------------------------------------

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select(`
        id,
        permit_no,
        requester_id,
        supervisor_id,
        permit_type_id,
        work_title,
        work_description,
        work_location,
        planned_start,
        planned_end,
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
  // 3. Only requester can resubmit
  // ---------------------------------------------------------

  if (permit.requester_id !== user.id) {
    return NextResponse.json(
      {
        error:
          'Only the permit requester can resubmit this permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 4. Permit must be rejected
  // ---------------------------------------------------------

  if (permit.status !== 'rejected') {
    return NextResponse.json(
      {
        error:
          `Only rejected permits can be resubmitted. Current status: ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 5. A supervisor must already be assigned
  // ---------------------------------------------------------

  if (!permit.supervisor_id) {
    return NextResponse.json(
      {
        error:
          'This permit has no assigned supervisor. Please contact an administrator.',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Verify assigned supervisor is still active
  // ---------------------------------------------------------

  const {
    data: supervisor,
    error: supervisorError,
  } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      role,
      is_active
    `)
    .eq('id', permit.supervisor_id)
    .single()

  if (supervisorError || !supervisor) {
    return NextResponse.json(
      {
        error:
          'The assigned supervisor could not be found.',
      },
      { status: 400 }
    )
  }

  if (!supervisor.is_active) {
    return NextResponse.json(
      {
        error:
          'The assigned supervisor is inactive. Please contact an administrator.',
      },
      { status: 400 }
    )
  }

  if (
    supervisor.role !== 'supervisor' &&
    supervisor.role !== 'admin'
  ) {
    return NextResponse.json(
      {
        error:
          'The assigned reviewer no longer has supervisor permission.',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Validate required fields
  // ---------------------------------------------------------

  if (!permit.permit_type_id) {
    return NextResponse.json(
      {
        error:
          'Permit type is required before resubmission.',
      },
      { status: 400 }
    )
  }

  if (!permit.work_title?.trim()) {
    return NextResponse.json(
      {
        error:
          'Work title is required before resubmission.',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Validate planned dates
  // ---------------------------------------------------------

  if (
    permit.planned_start &&
    permit.planned_end &&
    new Date(permit.planned_end) <=
      new Date(permit.planned_start)
  ) {
    return NextResponse.json(
      {
        error:
          'Planned end time must be later than planned start time.',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 9. Move rejected permit back to approval
  // ---------------------------------------------------------

  const {
    data: updatedPermit,
    error: updateError,
  } = await supabase
    .from('permits')
    .update({
      status: 'pending_approval',
    })
    .eq('id', id)
    .eq('requester_id', user.id)
    .eq('status', 'rejected')
    .select(`
      id,
      permit_no,
      status,
      supervisor_id
    `)
    .single()

  if (updateError || !updatedPermit) {
    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to resubmit permit.',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 10. Record resubmission history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'resubmitted',
        performed_by: user.id,
        remarks:
          `Permit resubmitted to ${supervisor.full_name} for review.`,
      })

  if (historyError) {
    console.error(
      'Failed to record resubmission history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          `Permit was moved to pending approval, but audit history failed: ${historyError.message}`,
        code: historyError.code,
        details: historyError.details,
        hint: historyError.hint,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}