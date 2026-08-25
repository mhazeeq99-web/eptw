import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { VERIFY_ROLES } from '@/lib/safety-roles'

/**
 * Marks the permit's selected PPE items as verified/available (or unverifies
 * them). Only REQUIRED PPE gates approval; recommended PPE never blocks, but
 * the verification state is still recorded per selected item.
 */
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

  // PPE availability verification is a safety-verification action: only
  // Safety Manager or Safety Coordinator may confirm required PPE as
  // verified/available.
  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `PPE verification can only be recorded while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    verified?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const verified = body.verified === true
  const now = new Date().toISOString()

  const { data: updated, error: updateError } =
    await supabase
      .from('permit_ppe')
      .update({
        verified,
        verified_by: verified ? user.id : null,
        verified_at: verified ? now : null,
      })
      .eq('permit_id', permit.id)
      .eq('is_selected', true)
      .select(`
        permit_id,
        ppe_item_id,
        is_selected,
        verified,
        verified_by,
        verified_at
      `)

  if (updateError) {
    console.error(
      'Failed to update PPE verification:',
      updateError
    )
    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to update PPE verification',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    ppe: updated ?? [],
  })
}
