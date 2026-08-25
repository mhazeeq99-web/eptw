import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { VERIFY_ROLES } from '@/lib/safety-roles'

/**
 * Records an individual worker's acknowledgement of the required briefing.
 * Reuses the existing permit_workers row — no separate worker master DB.
 */
export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; workerId: string }>
  }
) {
  const { id, workerId } = await params

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

  // Worker acknowledgement is recorded by the authorised safety verifier
  // attesting that the listed worker acknowledged the required briefing.
  // (Workers are not user accounts; acknowledged_by/acknowledged_at capture
  // who recorded it. No sixth role is introduced.)

  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `Worker acknowledgement can only be recorded while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  const workerIdNumber = Number(workerId)

  if (!Number.isInteger(workerIdNumber) || workerIdNumber <= 0) {
    return NextResponse.json(
      { error: 'Invalid worker id' },
      { status: 400 }
    )
  }

  let body: {
    acknowledged?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const acknowledged = body.acknowledged === true

  const now = new Date().toISOString()

  const { data: worker, error: workerError } =
    await supabase
      .from('permit_workers')
      .update({
        acknowledged,
        acknowledged_by: acknowledged ? user.id : null,
        acknowledged_at: acknowledged ? now : null,
      })
      .eq('id', workerIdNumber)
      .eq('permit_id', permit.id)
      .select(`
        id,
        full_name,
        briefed,
        acknowledged,
        acknowledged_by,
        acknowledged_at
      `)
      .single()

  if (workerError || !worker) {
    return NextResponse.json(
      {
        error:
          workerError?.message ||
          'Worker not found for this permit',
      },
      { status: workerError ? 500 : 404 }
    )
  }

  return NextResponse.json({
    success: true,
    worker,
  })
}
