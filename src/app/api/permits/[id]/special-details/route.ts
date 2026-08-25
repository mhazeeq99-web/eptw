import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { normalizeSpecialDetails } from '@/lib/specialised-permit'

/**
 * PATCH /api/permits/[id]/special-details
 *
 * Updates the permit-type-specific details (HOT / CSE / WAH / ELEC) stored
 * in permits.special_details. The payload is validated against the permit's
 * current type code; irrelevant or unknown fields are dropped.
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
    id
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
          `Specialised details can only be updated while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    special_details?: Record<string, unknown> | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const { data: permitType } = await supabase
    .from('permit_types')
    .select('code')
    .eq('id', permit.permit_type_id ?? -1)
    .maybeSingle()

  const code = (permitType?.code as string | null) ?? null

  const specialDetails = normalizeSpecialDetails(
    code,
    body.special_details
  )

  const { data: updated, error: updateError } =
    await supabase
      .from('permits')
      .update({ special_details: specialDetails })
      .eq('id', permit.id)
      .select('id, special_details')
      .single()

  if (updateError || !updated) {
    console.error(
      'Failed to update specialised details:',
      updateError
    )
    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to update specialised details',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    special_details: updated.special_details,
  })
}
