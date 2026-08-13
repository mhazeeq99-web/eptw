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
  // 1. Check authentication
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
        work_title,
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
  // 3. Make sure current user is the requester
  // ---------------------------------------------------------

  if (permit.requester_id !== user.id) {
    return NextResponse.json(
      {
        error:
          'You are not the requester of this permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 4. Permit must be in DRAFT status
  // ---------------------------------------------------------

  if (permit.status !== 'draft') {
    return NextResponse.json(
      {
        error:
          `Permit cannot be submitted because its current status is ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 5. Validate work title
  // ---------------------------------------------------------

  if (!permit.work_title?.trim()) {
    return NextResponse.json(
      {
        error: 'Work title is required',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Validate planned dates
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
          'Planned end time must be later than planned start time',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Change status: DRAFT → SUBMITTED
  // ---------------------------------------------------------

  const {
    data: updatedPermit,
    error: updateError,
  } = await supabase
    .from('permits')
    .update({
      status: 'submitted',
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id, permit_no, status')
    .single()

  if (updateError) {
    return NextResponse.json(
      {
        error: updateError.message,
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 8. Record submission in approval history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'submitted',
        performed_by: user.id,
        remarks: 'Permit submitted for review',
      })

  if (historyError) {
    console.error(
      'Failed to create approval history:',
      historyError
    )

    // Important:
    // The permit has already changed to SUBMITTED.
    // We return an error so we know the audit record failed.
    return NextResponse.json(
      {
        error:
          'Permit was submitted, but the approval history could not be recorded.',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 9. Return success
  // ---------------------------------------------------------

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}