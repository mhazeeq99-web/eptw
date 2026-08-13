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
  // 2. Read request body
  // ---------------------------------------------------------

  let body: {
    action?: string
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

  const action = body.action

  const remarks =
    typeof body.remarks === 'string'
      ? body.remarks.trim()
      : ''

  // ---------------------------------------------------------
  // 3. Validate action
  // ---------------------------------------------------------

  if (action !== 'approved' && action !== 'rejected') {
    return NextResponse.json(
      {
        error:
          'Action must be either approved or rejected',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 4. Rejection requires remarks
  // ---------------------------------------------------------

  if (action === 'rejected' && !remarks) {
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
  // 6. Verify assigned supervisor
  // ---------------------------------------------------------

  if (permit.supervisor_id !== user.id) {
    return NextResponse.json(
      {
        error:
          'You are not the assigned supervisor for this permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 7. Verify permit status
  // ---------------------------------------------------------

  if (permit.status !== 'pending_approval') {
    return NextResponse.json(
      {
        error:
          `Permit cannot be reviewed because its current status is ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Determine new status
  // ---------------------------------------------------------

  const newStatus =
    action === 'approved'
      ? 'approved'
      : 'rejected'

  // ---------------------------------------------------------
  // 9. Update permit
  // ---------------------------------------------------------

  const {
    data: updatedPermit,
    error: updateError,
  } = await supabase
    .from('permits')
    .update({
      status: newStatus,
    })
    .eq('id', id)
    .eq('status', 'pending_approval')
    .eq('supervisor_id', user.id)
    .select(`
      id,
      permit_no,
      status
    `)
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
  // 10. Record approval history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action,
        performed_by: user.id,
        remarks:
          remarks ||
          'Permit approved by assigned supervisor',
      })

  if (historyError) {
    console.error(
      'Failed to create approval history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          'Permit status was updated, but approval history could not be recorded.',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 11. Return success
  // ---------------------------------------------------------

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}