import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'

export async function PATCH(
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
    id
  )

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  const permit = access.data.permit

  // JHA may only be edited while the permit is being prepared.
  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `JHA can only be edited while the permit status is draft or pending approval (current: ${permit.status})`,
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

  // Only the requester (or platform admin) may edit the JHA.
  if (
    permit.requester_id !== user.id &&
    access.data.profile.role !== 'platform_admin'
  ) {
    return NextResponse.json(
      {
        error:
          'Only the permit requester can edit this JHA',
      },
      { status: 403 }
    )
  }

  // Load the JHA and confirm it belongs to this permit.
  const { data: existing, error: existingError } =
    await supabase
      .from('jhas')
      .select('id, permit_id, created_by')
      .eq('id', jhaIdNumber)
      .eq('permit_id', permit.id)
      .single()

  if (existingError || !existing) {
    return NextResponse.json(
      { error: 'JHA not found for this permit' },
      { status: 404 }
    )
  }

  let body: {
    title?: string
    description?: string | null
    hazards?: Array<{
      hazard: string
      hazard_category?: string | null
      consequence?: string | null
      existing_controls?: string | null
      control_types?: string[]
      likelihood?: number | null
      severity?: number | null
      additional_controls?: string | null
      residual_likelihood?: number | null
      residual_severity?: number | null
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

  const title =
    typeof body.title === 'string'
      ? body.title.trim()
      : ''

  if (!title) {
    return NextResponse.json(
      { error: 'JHA title is required' },
      { status: 400 }
    )
  }

  // Normalize the structured hazard rows.
  const hazards = (Array.isArray(body.hazards) ? body.hazards : [])
    .map((hazard) => ({
      hazard:
        typeof hazard.hazard === 'string'
          ? hazard.hazard.trim()
          : '',
      hazard_category:
        typeof hazard.hazard_category === 'string' &&
        hazard.hazard_category.trim()
          ? hazard.hazard_category.trim()
          : null,
      consequence:
        typeof hazard.consequence === 'string' &&
        hazard.consequence.trim()
          ? hazard.consequence.trim()
          : null,
      existing_controls:
        typeof hazard.existing_controls === 'string' &&
        hazard.existing_controls.trim()
          ? hazard.existing_controls.trim()
          : null,
      control_types: Array.isArray(hazard.control_types)
        ? hazard.control_types
            .filter((item): item is string =>
              typeof item === 'string'
            )
            .slice(0, 5)
        : [],
      likelihood: normalizeRisk(hazard.likelihood),
      severity: normalizeRisk(hazard.severity),
      additional_controls:
        typeof hazard.additional_controls === 'string' &&
        hazard.additional_controls.trim()
          ? hazard.additional_controls.trim()
          : null,
      residual_likelihood: normalizeRisk(
        hazard.residual_likelihood
      ),
      residual_severity: normalizeRisk(
        hazard.residual_severity
      ),
    }))
    .filter((hazard) => hazard.hazard.length > 0)

  if (hazards.length === 0) {
    return NextResponse.json(
      {
        error:
          'Add at least one hazard with a description.',
      },
      { status: 400 }
    )
  }

  // 1. Update the JHA title / description.
  const { data: updated, error: updateError } =
    await supabase
      .from('jhas')
      .update({
        title,
        description:
          typeof body.description === 'string' &&
          body.description.trim()
            ? body.description.trim()
            : null,
      })
      .eq('id', existing.id)
      .eq('permit_id', permit.id)
      .select(`
        id,
        permit_id,
        title,
        description,
        hazards_controls,
        status,
        created_by,
        created_at
      `)
      .single()

  if (updateError || !updated) {
    console.error('Failed to update JHA:', updateError)
    return NextResponse.json(
      {
        error:
          updateError?.message || 'Unable to update JHA',
      },
      { status: 500 }
    )
  }

  // 2. Replace the structured hazard rows.
  const { error: deleteError } = await supabase
    .from('jha_hazards')
    .delete()
    .eq('jha_id', existing.id)

  if (deleteError) {
    console.error('Failed to clear JHA hazards:', deleteError)
    return NextResponse.json(
      {
        error:
          'JHA was updated, but its hazards could not be replaced. Please contact support.',
      },
      { status: 500 }
    )
  }

  const { error: insertError } = await supabase
    .from('jha_hazards')
    .insert(
      hazards.map((hazard, index) => ({
        jha_id: existing.id,
        hazard: hazard.hazard,
        hazard_category: hazard.hazard_category,
        consequence: hazard.consequence,
        existing_controls: hazard.existing_controls,
        control_types: hazard.control_types,
        likelihood: hazard.likelihood,
        severity: hazard.severity,
        risk_rating:
          hazard.likelihood != null && hazard.severity != null
            ? hazard.likelihood * hazard.severity
            : null,
        additional_controls: hazard.additional_controls,
        residual_likelihood: hazard.residual_likelihood,
        residual_severity: hazard.residual_severity,
        residual_risk:
          hazard.residual_likelihood != null &&
          hazard.residual_severity != null
            ? hazard.residual_likelihood *
              hazard.residual_severity
            : null,
        sort_order: index,
      }))
    )

  if (insertError) {
    console.error('Failed to save JHA hazards:', insertError)
    return NextResponse.json(
      {
        error:
          'JHA was updated, but its hazards could not be saved. Please contact support.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    jha: updated,
  })
}

function normalizeRisk(
  value: unknown
): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return null
  }
  return n
}
