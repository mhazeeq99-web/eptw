import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'

const VERIFY_ROLES = [
  'admin',
  'permit_issuer',
  'safety',
  'safety_manager',
  'safety_coordinator',
  'work_supervisor',
  'supervisor',
]

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; lotoId: string }>
  }
) {
  const { id, lotoId } = await params

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

  let body: {
    status?: 'verified' | 'rejected'
  } = {}

  try {
    body = await request.json()
  } catch {
    // Body is optional.
  }

  const nextStatus = body.status ?? 'verified'

  if (nextStatus !== 'verified' && nextStatus !== 'rejected') {
    return NextResponse.json(
      { error: 'Invalid LOTO status' },
      { status: 400 }
    )
  }

  const lotoIdNumber = Number(lotoId)

  if (!Number.isInteger(lotoIdNumber) || lotoIdNumber <= 0) {
    return NextResponse.json(
      { error: 'Invalid LOTO id' },
      { status: 400 }
    )
  }

  const { data: loto, error: lotoError } =
    await supabase
      .from('loto_isolation_points')
      .select('id, permit_id, status')
      .eq('id', lotoIdNumber)
      .eq('permit_id', permit.id)
      .single()

  if (lotoError || !loto) {
    return NextResponse.json(
      { error: 'LOTO isolation point not found for this permit' },
      { status: 404 }
    )
  }

  if (loto.status !== 'pending') {
    return NextResponse.json(
      {
        error:
          `LOTO point cannot be verified while its status is ${loto.status}`,
      },
      { status: 400 }
    )
  }

  const { data: updatedLoto, error: updateError } =
    await supabase
      .from('loto_isolation_points')
      .update({
        status: nextStatus,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', loto.id)
      .eq('permit_id', permit.id)
      .eq('status', 'pending')
      .select(`
        id,
        permit_id,
        description,
        status,
        verified_by,
        verified_at
      `)
      .single()

  if (updateError || !updatedLoto) {
    console.error(
      'Failed to update LOTO status:',
      updateError
    )

    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to update LOTO status',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    loto: updatedLoto,
  })
}
