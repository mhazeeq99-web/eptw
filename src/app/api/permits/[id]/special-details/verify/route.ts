import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { VERIFY_ROLES } from '@/lib/safety-roles'

/**
 * POST /api/permits/[id]/special-details/verify
 *
 * Marks the specialised requirements (Hot Work / Confined Space / Work at
 * Height / Electrical Requirements) as verified by a Safety Manager /
 * Safety Coordinator. This is a real verification action — the flag is only
 * set here, never derived from the requirements being filled in.
 */
export async function POST(
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
          `Specialised requirements can only be verified while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  const { data: updated, error: updateError } =
    await supabase
      .from('permits')
      .update({
        special_verified_by: user.id,
        special_verified_at: now,
      })
      .eq('id', permit.id)
      .select('id, special_verified_by, special_verified_at')
      .single()

  if (updateError || !updated) {
    console.error(
      'Failed to verify specialised requirements:',
      updateError
    )
    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to verify specialised requirements',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    special_verified_by: updated.special_verified_by,
    special_verified_at: updated.special_verified_at,
  })
}
