import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/permits/[id]/safety-controls
 *
 * Returns the active safety-control catalogue that an authorised safety
 * verifier (SM/SC) may add to this permit, excluding controls already present
 * on the permit. Used by the "Add safety control" picker during verification.
 */
export async function GET(
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

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', user.id)
      .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 403 }
    )
  }

  if (
    profile.role !== 'safety_manager' &&
    profile.role !== 'safety_coordinator'
  ) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403 }
    )
  }

  const permitId = Number(id)
  if (!Number.isInteger(permitId) || permitId <= 0) {
    return NextResponse.json(
      { error: 'Invalid permit id' },
      { status: 400 }
    )
  }

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select('id, company_id')
      .eq('id', permitId)
      .single()

  if (permitError || !permit) {
    return NextResponse.json(
      { error: 'Permit not found' },
      { status: 404 }
    )
  }

  if (
    !profile.company_id ||
    permit.company_id !== profile.company_id
  ) {
    return NextResponse.json(
      { error: 'Not authorized for this permit' },
      { status: 403 }
    )
  }

  // Controls already on the permit (required + recommended).
  const [requiredRes, recommendedRes] = await Promise.all([
    supabase
      .from('permit_safety_controls')
      .select('safety_control_id')
      .eq('permit_id', permitId),
    supabase
      .from('permit_recommended_controls')
      .select('safety_control_id')
      .eq('permit_id', permitId),
  ])

  const present = new Set<number>()
  for (const row of requiredRes.data ?? []) {
    present.add(row.safety_control_id)
  }
  for (const row of recommendedRes.data ?? []) {
    present.add(row.safety_control_id)
  }

  const { data: catalogue, error: catError } =
    await supabase
      .from('safety_controls')
      .select('id, code, name, description, category')
      .eq('is_active', true)
      .order('name')

  if (catError) {
    return NextResponse.json(
      { error: 'Failed to load safety controls' },
      { status: 500 }
    )
  }

  const available = (catalogue ?? []).filter(
    (item) => !present.has(item.id)
  )

  return NextResponse.json({
    safety_controls: available,
  })
}

/**
 * POST /api/permits/[id]/safety-controls
 *
 * Lets an authorised safety verifier (SM/SC) add a safety control to a permit
 * during the safety verification stage, so they are never stuck when the
 * contractor left controls unticked or the permit has none configured. The
 * added control is created as a REQUIRED control with status 'pending' — the
 * same state as a synced required control — and the safety verifier then
 * verifies it via the existing verify route. This keeps the readiness gate
 * consistent (every required control must end up verified).
 */
export async function POST(
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

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', user.id)
      .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 403 }
    )
  }

  const allowedRoles = [
    'safety_manager',
    'safety_coordinator',
  ]
  if (!allowedRoles.includes(profile.role)) {
    return NextResponse.json(
      {
        error:
          'Only safety managers and safety coordinators can add safety controls',
      },
      { status: 403 }
    )
  }

  const permitId = Number(id)
  if (!Number.isInteger(permitId) || permitId <= 0) {
    return NextResponse.json(
      { error: 'Invalid permit id' },
      { status: 400 }
    )
  }

  // Permit must belong to the verifier's company.
  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select('id, company_id, status')
      .eq('id', permitId)
      .single()

  if (permitError || !permit) {
    return NextResponse.json(
      { error: 'Permit not found' },
      { status: 404 }
    )
  }

  if (
    !profile.company_id ||
    permit.company_id !== profile.company_id
  ) {
    return NextResponse.json(
      {
        error:
          'You can only add safety controls to permits in your own company',
      },
      { status: 403 }
    )
  }

  // Safety controls may only be added while the permit is being reviewed
  // (draft or pending approval), not after it is active/closed.
  if (permit.status !== 'draft' && permit.status !== 'pending_approval') {
    return NextResponse.json(
      {
        error:
          `Safety controls can only be added while the permit is a draft or pending approval (current status: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    safety_control_id?: number
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const safetyControlId = Number(body.safety_control_id)
  if (!Number.isInteger(safetyControlId) || safetyControlId <= 0) {
    return NextResponse.json(
      { error: 'safety_control_id is required' },
      { status: 400 }
    )
  }

  // The control must exist and be active in the catalogue.
  const { data: control, error: controlError } =
    await supabase
      .from('safety_controls')
      .select('id, name, is_active')
      .eq('id', safetyControlId)
      .maybeSingle()

  if (controlError || !control) {
    return NextResponse.json(
      { error: 'Safety control not found' },
      { status: 404 }
    )
  }

  if (!control.is_active) {
    return NextResponse.json(
      { error: 'This safety control is deactivated and cannot be added' },
      { status: 400 }
    )
  }

  // Guard against adding the same control twice.
  const { data: existing } = await supabase
    .from('permit_safety_controls')
    .select('id')
    .eq('permit_id', permitId)
    .eq('safety_control_id', safetyControlId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'This safety control is already on the permit' },
      { status: 400 }
    )
  }

  // Insert as a REQUIRED, pending control. Service role write follows the
  // established privileged-write pattern (permit_safety_controls has no
  // INSERT RLS policy for authenticated users).
  const { data: inserted, error: insertError } =
    await createAdminClient()
      .from('permit_safety_controls')
      .insert({
        permit_id: permitId,
        safety_control_id: safetyControlId,
        is_required: true,
        status: 'pending',
      })
      .select(`
        id,
        permit_id,
        safety_control_id,
        is_required,
        status,
        safety_control:safety_controls (
          id,
          code,
          name,
          description,
          category
        )
      `)
      .single()

  if (insertError || !inserted) {
    console.error(
      'Failed to add safety control to permit:',
      insertError
    )
    return NextResponse.json(
      {
        error:
          insertError?.message ||
          'Unable to add the safety control to the permit',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      permit_safety_control: inserted,
    },
    { status: 201 }
  )
}
