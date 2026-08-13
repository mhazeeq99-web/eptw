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
  // 2. Check current user's role
  // ---------------------------------------------------------

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  if (profile.role !== 'admin') {
    return NextResponse.json(
      {
        error:
          'Only administrators can assign permit reviewers',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 3. Read request body
  // ---------------------------------------------------------

  const body = await request.json()

  const supervisorId =
    typeof body.supervisor_id === 'string' &&
    body.supervisor_id.length > 0
      ? body.supervisor_id
      : null

  if (!supervisorId) {
    return NextResponse.json(
      {
        error: 'Supervisor is required',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 4. Verify supervisor exists and is active
  // ---------------------------------------------------------

  const { data: supervisor, error: supervisorError } =
    await supabase
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', supervisorId)
      .single()

  if (supervisorError || !supervisor) {
    return NextResponse.json(
      { error: 'Supervisor not found' },
      { status: 404 }
    )
  }

  if (!supervisor.is_active) {
    return NextResponse.json(
      { error: 'Selected supervisor is inactive' },
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
          'Selected user does not have supervisor permission',
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
      .select('id, permit_no, status')
      .eq('id', id)
      .single()

  if (permitError || !permit) {
    return NextResponse.json(
      { error: 'Permit not found' },
      { status: 404 }
    )
  }

  if (
    permit.status !== 'submitted' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `Permit cannot be assigned while its status is ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Assign supervisor and move to PENDING_APPROVAL
  // ---------------------------------------------------------

  const { data: updatedPermit, error: updateError } =
    await supabase
      .from('permits')
      .update({
        supervisor_id: supervisor.id,
        status: 'pending_approval',
      })
      .eq('id', id)
      .select(`
        id,
        permit_no,
        status,
        supervisor_id
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
  // 7. Record assignment in audit history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'submitted',
        performed_by: user.id,
        remarks:
          `Supervisor assigned: ${supervisor.full_name}`,
      })

  if (historyError) {
    console.error(
      'Failed to record assignment history:',
      historyError
    )
  }

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}