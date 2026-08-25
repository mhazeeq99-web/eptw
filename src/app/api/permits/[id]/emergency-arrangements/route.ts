import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { VERIFY_ROLES } from '@/lib/safety-roles'

/**
 * Records the permit's emergency arrangements (PTW readiness only — no full
 * emergency-management module). When confirmed, the user + timestamp are
 * stored at permit level.
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

  // Emergency arrangements confirmation is a safety-verification action:
  // only Safety Manager or Safety Coordinator may confirm them.

  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `Emergency arrangements can only be recorded while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    status?: 'not_confirmed' | 'confirmed'
    emergency_contact?: string | null
    muster_point?: string | null
    emergency_procedure?: string | null
    first_aid_available?: boolean
    fire_response_available?: boolean
    rescue_required?: boolean
    rescue_available?: boolean
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

  const status =
    body.status === 'confirmed'
      ? 'confirmed'
      : 'not_confirmed'

  const now = new Date().toISOString()

  const payload = {
    status,
    emergency_contact:
      typeof body.emergency_contact === 'string' &&
      body.emergency_contact.trim()
        ? body.emergency_contact.trim()
        : null,
    muster_point:
      typeof body.muster_point === 'string' &&
      body.muster_point.trim()
        ? body.muster_point.trim()
        : null,
    emergency_procedure:
      typeof body.emergency_procedure === 'string' &&
      body.emergency_procedure.trim()
        ? body.emergency_procedure.trim()
        : null,
    first_aid_available: body.first_aid_available === true,
    fire_response_available:
      body.fire_response_available === true,
    rescue_required: body.rescue_required === true,
    rescue_available: body.rescue_available === true,
    remarks:
      typeof body.remarks === 'string' && body.remarks.trim()
        ? body.remarks.trim()
        : null,
    confirmed_by: status === 'confirmed' ? user.id : null,
    confirmed_at: status === 'confirmed' ? now : null,
    updated_at: now,
  }

  const { data: existing } = await supabase
    .from('permit_emergency_arrangements')
    .select('id')
    .eq('permit_id', permit.id)
    .maybeSingle()

  let result

  if (existing) {
    const { data, error } = await supabase
      .from('permit_emergency_arrangements')
      .update(payload)
      .eq('id', existing.id)
      .select(`
        id,
        permit_id,
        status,
        emergency_contact,
        muster_point,
        emergency_procedure,
        first_aid_available,
        fire_response_available,
        rescue_required,
        rescue_available,
        confirmed_by,
        confirmed_at,
        remarks
      `)
      .single()

    result = { data, error }
  } else {
    const { data, error } = await supabase
      .from('permit_emergency_arrangements')
      .insert({
        permit_id: permit.id,
        ...payload,
      })
      .select(`
        id,
        permit_id,
        status,
        emergency_contact,
        muster_point,
        emergency_procedure,
        first_aid_available,
        fire_response_available,
        rescue_required,
        rescue_available,
        confirmed_by,
        confirmed_at,
        remarks
      `)
      .single()

    result = { data, error }
  }

  if (result.error || !result.data) {
    console.error(
      'Failed to save emergency arrangements:',
      result.error
    )
    return NextResponse.json(
      {
        error:
          result.error?.message ||
          'Unable to save emergency arrangements',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    emergency_arrangements: result.data,
  })
}
