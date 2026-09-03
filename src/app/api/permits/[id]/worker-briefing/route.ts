import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { VERIFY_ROLES } from '@/lib/safety-roles'

/**
 * Marks the permit's worker briefing as BRIEFED and stores the covered
 * topics + the user who conducted the briefing. When the briefing is marked
 * briefed, every listed worker is flagged `briefed` (the acknowledgement
 * state is tracked separately per worker).
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

  // Worker briefing is a safety-verification action: only Safety Manager or
  // Safety Coordinator may mark the permit as briefed.

  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval' &&
    permit.status !== 'suspended'
  ) {
    return NextResponse.json(
      {
        error:
          `Worker briefing can only be recorded while the permit status is draft, pending approval or suspended (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    topics?: Array<{
      key: string
      label: string
      covered: boolean
    }>
    remarks?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const topics = Array.isArray(body.topics)
    ? body.topics
        .map((topic) => ({
          key:
            typeof topic.key === 'string'
              ? topic.key.trim()
              : '',
          label:
            typeof topic.label === 'string'
              ? topic.label.trim()
              : '',
          covered: topic.covered === true,
        }))
        .filter((topic) => topic.key.length > 0)
    : []

  const remarks =
    typeof body.remarks === 'string' && body.remarks.trim()
      ? body.remarks.trim()
      : null

  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('permit_worker_briefings')
    .select('id')
    .eq('permit_id', permit.id)
    .maybeSingle()

  let briefing

  if (existing) {
    const { data, error } = await supabase
      .from('permit_worker_briefings')
      .update({
        status: 'briefed',
        topics,
        remarks,
        briefed_by: user.id,
        briefed_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select(`
        id,
        permit_id,
        status,
        topics,
        briefed_by,
        briefed_at,
        remarks
      `)
      .single()

    briefing = { data, error }
  } else {
    const { data, error } = await supabase
      .from('permit_worker_briefings')
      .insert({
        permit_id: permit.id,
        status: 'briefed',
        topics,
        remarks,
        briefed_by: user.id,
        briefed_at: now,
      })
      .select(`
        id,
        permit_id,
        status,
        topics,
        briefed_by,
        briefed_at,
        remarks
      `)
      .single()

    briefing = { data, error }
  }

  if (briefing.error || !briefing.data) {
    console.error(
      'Failed to save worker briefing:',
      briefing.error
    )
    return NextResponse.json(
      {
        error:
          briefing.error?.message ||
          'Unable to save worker briefing',
      },
      { status: 500 }
    )
  }

  // Flag every listed worker as briefed (acknowledgement stays per-worker).
  const { error: workersError } = await supabase
    .from('permit_workers')
    .update({ briefed: true })
    .eq('permit_id', permit.id)

  if (workersError) {
    console.error(
      'Failed to mark workers as briefed:',
      workersError
    )
  }

  return NextResponse.json({
    success: true,
    worker_briefing: briefing.data,
  })
}
