import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyPermitEvent } from '@/lib/notifications'
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
          'Only Safety Manager or Safety Coordinator can suspend permits',
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
  // 4. Suspension reason is required
  // ---------------------------------------------------------

  if (!remarks) {
    return NextResponse.json(
      {
        error:
          'A reason is required when suspending a permit',
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
  // 6. Permit must be ACTIVE
  // ---------------------------------------------------------

  if (permit.status !== 'active') {
    return NextResponse.json(
      {
        error:
          `Only active permits can be suspended. Current status: ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Change status to SUSPENDED (controlled DB transition)
  // ---------------------------------------------------------

  const transition = await performPermitTransition(
    supabase,
    permit.id,
    'active',
    'suspended',
    {
      suspension_reason: remarks,
      suspended_by: user.id,
      suspended_at: new Date().toISOString(),
    }
  )

  if (!transition.ok) {
    return NextResponse.json(
      {
        error:
          transition.error ?? 'Unable to suspend permit',
      },
      { status: 500 }
    )
  }

  const updatedPermit = {
    id: permit.id,
    permit_no: permit.permit_no,
    status: 'suspended',
    suspension_reason: remarks,
    suspended_by: user.id,
    suspended_at: new Date().toISOString(),
  }

  // ---------------------------------------------------------
  // 8. Record suspension history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'suspended',
        performed_by: user.id,
        remarks,
      })

  if (historyError) {
    console.error(
      'Failed to create suspension history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          'Permit was suspended, but audit history could not be recorded. Please contact support.',
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
    event: 'permit_suspended',
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