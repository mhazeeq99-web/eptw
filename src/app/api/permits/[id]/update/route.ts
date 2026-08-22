import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncPermitSafetyControls } from '@/lib/safety-controls'

export async function PATCH(
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
  // 2. Get request body
  // ---------------------------------------------------------

  let body: {
    permit_type_id?: number
    work_title?: string
    work_description?: string | null
    work_location?: string | null
    area_id?: number | null
    equipment_id?: number | null
    contractor_id?: number | null
    planned_start?: string | null
    planned_end?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 3. Get existing permit
  // ---------------------------------------------------------

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select(`
        id,
        permit_no,
        requester_id,
        permit_type_id,
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
  // 4. Only requester can edit
  // ---------------------------------------------------------

  if (permit.requester_id !== user.id) {
    return NextResponse.json(
      {
        error:
          'Only the permit requester can edit this permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 5. Only DRAFT or REJECTED permits can be edited
  // ---------------------------------------------------------

  if (
    permit.status !== 'draft' &&
    permit.status !== 'rejected'
  ) {
    return NextResponse.json(
      {
        error:
          `Permit cannot be edited while its status is ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Validate required fields
  // ---------------------------------------------------------

  if (
    !body.permit_type_id ||
    !Number.isInteger(body.permit_type_id)
  ) {
    return NextResponse.json(
      {
        error: 'Permit type is required',
      },
      { status: 400 }
    )
  }

  if (
    typeof body.work_title !== 'string' ||
    !body.work_title.trim()
  ) {
    return NextResponse.json(
      {
        error: 'Work title is required',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Validate permit type and safety requirements
  // ---------------------------------------------------------

  const {
    data: permitType,
    error: permitTypeError,
  } = await supabase
    .from('permit_types')
    .select(`
      id,
      name,
      requires_jha,
      requires_gas_test,
      requires_loto
    `)
    .eq('id', body.permit_type_id)
    .eq('is_active', true)
    .single()

  if (permitTypeError || !permitType) {
    return NextResponse.json(
      {
        error:
          'Selected permit type was not found or is inactive',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Validate planned dates
  // ---------------------------------------------------------

  if (
    body.planned_start &&
    body.planned_end &&
    new Date(body.planned_end) <=
      new Date(body.planned_start)
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
  // 9. Update permit
  // ---------------------------------------------------------

  const { data: updatedPermit, error: updateError } =
    await supabase
      .from('permits')
      .update({
        permit_type_id: body.permit_type_id,
        work_title: body.work_title.trim(),
        work_description:
          body.work_description?.trim() || null,
        work_location:
          body.work_location?.trim() || null,
        area_id: body.area_id ?? null,
        equipment_id: body.equipment_id ?? null,
        contractor_id: body.contractor_id ?? null,
        planned_start: body.planned_start || null,
        planned_end: body.planned_end || null,
      })
      .eq('id', id)
      .eq('requester_id', user.id)
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
  // 10. Record revision in audit history
  // ---------------------------------------------------------

  if (permit.status === 'rejected') {
    const { error: historyError } =
      await supabase
        .from('permit_approvals')
        .insert({
          permit_id: permit.id,
          action: 'revised',
          performed_by: user.id,
          remarks:
            'Permit revised after rejection',
        })

    if (historyError) {
      console.error(
        'Failed to record revision history:',
        historyError
      )

      return NextResponse.json(
        {
          error:
            'Permit was updated, but revision history could not be recorded. Please contact support.',
        },
        { status: 500 }
      )
    }
  }

  // ---------------------------------------------------------
  // 10b. Resynchronize required safety controls when the
  //      permit type changes
  // ---------------------------------------------------------

  if (
    permit.permit_type_id &&
    Number(body.permit_type_id) !== permit.permit_type_id
  ) {
    const syncResult = await syncPermitSafetyControls(
      supabase,
      permit.id
    )

    if (syncResult.error) {
      console.error(
        'Failed to resynchronize safety controls:',
        syncResult.error
      )

      return NextResponse.json(
        {
          error:
            'Permit was updated, but safety requirements could not be synchronized. Please contact support.',
        },
        { status: 500 }
      )
    }

    if (!syncResult.applied) {
      console.warn(
        'sync_permit_safety_controls RPC not found; safety controls were not resynchronized for permit',
        permit.id
      )
    }
  }

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}