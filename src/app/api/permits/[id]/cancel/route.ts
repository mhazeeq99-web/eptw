import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyPermitEvent } from '@/lib/notifications'

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
  // 2. Verify user's profile
  // ---------------------------------------------------------

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
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
  // 4. Cancellation reason is required
  // ---------------------------------------------------------

  if (!remarks) {
    return NextResponse.json(
      {
        error:
          'A reason is required when cancelling a permit',
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
  // 6. Authorized roles
  // ---------------------------------------------------------

  const cancellableRoles = [
    'safety_manager',
    'safety_coordinator',
  ]

  const isRequester = permit.requester_id === user.id

  const isCompanyManager =
    profile.company_id != null &&
    profile.company_id === permit.company_id &&
    cancellableRoles.includes(profile.role)

  const isPlatformAdmin =
    profile.role === 'platform_admin'

  if (!isRequester && !isCompanyManager && !isPlatformAdmin) {
    return NextResponse.json(
      {
        error:
          'You are not authorized to cancel this permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 7. Permit must be in a pre-work status
  // ---------------------------------------------------------

  const cancellableStatuses = [
    'draft',
    'pending_approval',
    'rejected',
    'approved',
    'issued',
    'suspended',
  ]

  if (!cancellableStatuses.includes(permit.status)) {
    return NextResponse.json(
      {
        error:
          `Permit cannot be cancelled while its status is ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Change status to CANCELLED
  // ---------------------------------------------------------

  const { data: updatedPermit, error: updateError } =
    await supabase
      .from('permits')
      .update({
        status: 'cancelled',
        cancelled_by: user.id,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .in('status', cancellableStatuses)
      .select(`
        id,
        permit_no,
        status
      `)
      .single()

  if (updateError || !updatedPermit) {
    console.error(
      'Failed to cancel permit:',
      updateError
    )

    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to cancel permit',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 9. Record cancellation history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'cancelled',
        performed_by: user.id,
        remarks,
      })

  if (historyError) {
    console.error(
      'Failed to create cancellation history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          'Permit was cancelled, but audit history could not be recorded. Please contact support.',
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
    event: 'permit_cancelled',
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
