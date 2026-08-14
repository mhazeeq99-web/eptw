import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string
      controlId: string
    }>
  }
) {
  const { id, controlId } = await params

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
  // 2. Verify authorized role
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
      { status: 403 }
    )
  }

  const allowedRoles = [
    'admin',
    'permit_issuer',
    'safety',
    'supervisor',
  ]

  if (!allowedRoles.includes(profile.role)) {
    return NextResponse.json(
      {
        error:
          'You are not authorized to verify safety controls',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 3. Read remarks
  // ---------------------------------------------------------

  let body: {
    remarks?: string
  } = {}

  try {
    body = await request.json()
  } catch {
    // Remarks are optional.
  }

  const remarks =
    typeof body.remarks === 'string'
      ? body.remarks.trim() || null
      : null

  // ---------------------------------------------------------
  // 4. Validate IDs
  // ---------------------------------------------------------

  const permitId = Number(id)
  const safetyControlId = Number(controlId)

  if (
    !Number.isInteger(permitId) ||
    !Number.isInteger(safetyControlId)
  ) {
    return NextResponse.json(
      { error: 'Invalid permit or safety control ID' },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 5. Get permit safety control
  // ---------------------------------------------------------

  const {
    data: permitSafetyControl,
    error: controlError,
  } = await supabase
    .from('permit_safety_controls')
    .select(`
      id,
      permit_id,
      safety_control_id,
      is_required,
      status,
      remarks
    `)
    .eq('id', safetyControlId)
    .eq('permit_id', permitId)
    .single()

  if (controlError || !permitSafetyControl) {
    return NextResponse.json(
      { error: 'Safety control not found for this permit' },
      { status: 404 }
    )
  }

  // ---------------------------------------------------------
  // 6. Only required controls can be verified
  // ---------------------------------------------------------

  if (!permitSafetyControl.is_required) {
    return NextResponse.json(
      {
        error:
          'Only required safety controls can be verified',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Only pending controls can be verified
  // ---------------------------------------------------------

  if (permitSafetyControl.status !== 'pending') {
    return NextResponse.json(
      {
        error:
          `Safety control cannot be verified while its status is ${permitSafetyControl.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Verify safety control
  // ---------------------------------------------------------

  const { data: updatedControl, error: updateError } =
    await supabase
      .from('permit_safety_controls')
      .update({
        status: 'verified',
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        remarks:
          remarks ?? permitSafetyControl.remarks,
      })
      .eq('id', permitSafetyControl.id)
      .eq('permit_id', permitId)
      .eq('status', 'pending')
      .select(`
        id,
        permit_id,
        safety_control_id,
        is_required,
        status,
        verified_by,
        verified_at,
        remarks,
        updated_at
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
  // 9. Return success
  // ---------------------------------------------------------

  return NextResponse.json({
    success: true,
    safety_control: updatedControl,
  })
}
