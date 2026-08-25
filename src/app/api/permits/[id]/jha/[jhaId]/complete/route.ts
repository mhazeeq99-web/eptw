import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'

/**
 * Marks a JHA as COMPLETED (requester-side step between pending and
 * verification). Verification still happens via the verify route and is the
 * state the approval gate requires.
 */
export async function POST(
  _request: Request,
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
          `JHA can only be completed while the permit status is draft or pending approval (current: ${permit.status})`,
      },
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

  const { data: updatedJha, error: updateError } =
    await supabase
      .from('jhas')
      .update({ status: 'completed' })
      .eq('id', jhaIdNumber)
      .eq('permit_id', permit.id)
      .eq('status', 'pending')
      .select('id, permit_id, status')
      .single()

  if (updateError || !updatedJha) {
    return NextResponse.json(
      {
        error:
          'JHA cannot be completed in its current state',
      },
      { status: 400 }
    )
  }

  return NextResponse.json({
    success: true,
    jha: updatedJha,
  })
}
