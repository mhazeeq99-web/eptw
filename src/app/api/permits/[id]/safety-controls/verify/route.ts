import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { VERIFY_ROLES } from '@/lib/safety-roles'

/**
 * PATCH /api/permits/[id]/safety-controls/verify
 *
 * Bulk-verifies all REQUIRED safety controls on the permit in one action.
 * Only Safety Manager / Safety Coordinator may do this, and only while the
 * permit is a draft or pending approval.
 */
export async function PATCH(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const access = await requirePermitAccess(
    supabase,
    user,
    id,
    { roles: VERIFY_ROLES }
  )

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  const permit = access.data.permit

  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `Safety controls can only be verified while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  const { data: updated, error: updateError } =
    await supabase
      .from('permit_safety_controls')
      .update({
        status: 'verified',
        verified_by: user.id,
        verified_at: now,
      })
      .eq('permit_id', permit.id)
      .eq('is_required', true)
      .eq('status', 'pending')
      .select(`
        id,
        permit_id,
        safety_control_id,
        is_required,
        status,
        verified_by,
        verified_at
      `)

  if (updateError) {
    console.error(
      'Failed to bulk-verify safety controls:',
      updateError
    )
    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to verify safety controls',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    safety_controls: updated ?? [],
  })
}
