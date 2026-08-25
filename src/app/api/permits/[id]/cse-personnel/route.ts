import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import {
  validateCsePersonnel,
  type CseResponsibility,
} from '@/lib/specialised-permit'

/**
 * PATCH /api/permits/[id]/cse-personnel
 *
 * Replaces the permit's CSE personnel responsibilities (Entry Supervisor /
 * Standby Attendant / Authorised Entrant). Assignments reference permit
 * workers by ID. Validation enforces:
 *   - workers exist and belong to this permit
 *   - valid responsibilities
 *   - no duplicate (worker, responsibility) pairs
 *   - company separation-of-duty policy (configurable on the company)
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
          `CSE personnel can only be assigned while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    assignments?: Array<{
      worker_id?: number
      responsibility?: string
    }>
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const rawAssignments = Array.isArray(body.assignments)
    ? body.assignments.map((item) => ({
        worker_id: Number(item.worker_id),
        responsibility: item.responsibility as
          | CseResponsibility
          | undefined,
      }))
    : []

  const personnelCheck = await validateCsePersonnel(
    supabase,
    permit.id,
    rawAssignments.filter(
      (item): item is {
        worker_id: number
        responsibility: CseResponsibility
      } =>
        Number.isInteger(item.worker_id) &&
        item.worker_id > 0 &&
        item.responsibility !== undefined
    )
  )

  if (!personnelCheck.ok) {
    return NextResponse.json(
      { error: personnelCheck.error },
      { status: 400 }
    )
  }

  const { error: deleteError } = await supabase
    .from('permit_cse_personnel')
    .delete()
    .eq('permit_id', permit.id)

  if (deleteError) {
    console.error(
      'Failed to replace CSE personnel:',
      deleteError
    )
    return NextResponse.json(
      {
        error:
          deleteError?.message ||
          'Unable to update CSE personnel',
      },
      { status: 500 }
    )
  }

  let inserted: Array<{
    id: number
    permit_id: number
    worker_id: number
    responsibility: string
  }> = []

  if (personnelCheck.assignments.length > 0) {
    const { data, error: insertError } = await supabase
      .from('permit_cse_personnel')
      .insert(
        personnelCheck.assignments.map((assignment) => ({
          permit_id: permit.id,
          worker_id: assignment.worker_id,
          responsibility: assignment.responsibility,
          created_by: user.id,
        }))
      )
      .select(`
        id,
        permit_id,
        worker_id,
        responsibility
      `)

    if (insertError) {
      console.error(
        'Failed to save CSE personnel:',
        insertError
      )
      return NextResponse.json(
        {
          error:
            insertError?.message ||
            'Unable to save CSE personnel',
        },
        { status: 500 }
      )
    }

    inserted = data ?? []
  }

  return NextResponse.json({
    success: true,
    assignments: inserted,
  })
}
