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
    profile.role !== 'permit_issuer' &&
    profile.role !== 'admin'
  ) {
    return NextResponse.json(
      {
        error:
          'Only permit issuers or administrators can close permits',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 3. Read request body
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

  // ---------------------------------------------------------
  // 4. Closing remark is required
  // ---------------------------------------------------------

  if (!remarks) {
    return NextResponse.json(
      {
        error:
          'A closing remark is required',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 5. Get permit
  // ---------------------------------------------------------

  const {
    data: permit,
    error: permitError,
  } = await supabase
    .from('permits')
    .select(`
      id,
      permit_no,
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
  // 6. Permit must be COMPLETED
  // ---------------------------------------------------------

  if (permit.status !== 'completed') {
    return NextResponse.json(
      {
        error:
          `Only completed permits can be closed. Current status: ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Change status to CLOSED
  // ---------------------------------------------------------

  const {
    data: updatedPermit,
    error: updateError,
  } = await supabase
    .from('permits')
    .update({
      status: 'closed',
    })
    .eq('id', id)
    .eq('status', 'completed')
    .select(`
      id,
      permit_no,
      status
    `)
    .single()

  if (updateError || !updatedPermit) {
    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to close permit',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 8. Record closing history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'closed',
        performed_by: user.id,
        remarks,
      })

  if (historyError) {
    console.error(
      'Failed to create closing history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          `Permit was closed, but audit history could not be recorded: ${historyError.message}`,
        code: historyError.code,
        details: historyError.details,
        hint: historyError.hint,
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