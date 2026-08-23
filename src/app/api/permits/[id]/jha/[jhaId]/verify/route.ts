import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'

const VERIFY_ROLES = [
  'safety_manager',
  'safety_coordinator',
]

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; jhaId: string }>
  }
) {
  const { id, jhaId } = await params

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
    remarks?: string | null
  } = {}

  try {
    body = await request.json()
  } catch {
    // Body is optional.
  }

  const nextStatus = body.status ?? 'verified'

  if (nextStatus !== 'verified' && nextStatus !== 'rejected') {
    return NextResponse.json(
      { error: 'Invalid JHA status' },
      { status: 400 }
    )
  }

  const jhaIdNumber = Number(jhaId)

  if (!Number.isInteger(jhaIdNumber) || jhaIdNumber <= 0) {
    return NextResponse.json(
      { error: 'Invalid JHA id' },
      { status: 400 }
    )
  }

  const { data: jha, error: jhaError } =
    await supabase
      .from('jhas')
      .select('id, permit_id, status')
      .eq('id', jhaIdNumber)
      .eq('permit_id', permit.id)
      .single()

  if (jhaError || !jha) {
    return NextResponse.json(
      { error: 'JHA not found for this permit' },
      { status: 404 }
    )
  }

  if (jha.status !== 'pending') {
    return NextResponse.json(
      {
        error:
          `JHA cannot be verified while its status is ${jha.status}`,
      },
      { status: 400 }
    )
  }

  const { data: updatedJha, error: updateError } =
    await supabase
      .from('jhas')
      .update({
        status: nextStatus,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', jha.id)
      .eq('permit_id', permit.id)
      .eq('status', 'pending')
      .select(`
        id,
        permit_id,
        title,
        status,
        verified_by,
        verified_at
      `)
      .single()

  if (updateError || !updatedJha) {
    console.error(
      'Failed to update JHA status:',
      updateError
    )

    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to update JHA status',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    jha: updatedJha,
  })
}
