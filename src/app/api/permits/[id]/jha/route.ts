import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'

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

  // JHA records may only be added while the permit is being prepared
  // (draft) or awaiting safety approval.
  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `JHA can only be added while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    title?: string
    description?: string | null
    hazards_controls?: Array<{
      hazard: string
      control: string
    }> | null
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
    }> | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const title = typeof body.title === 'string'
    ? body.title.trim()
    : ''

  if (!title) {
    return NextResponse.json(
      { error: 'JHA title is required' },
      { status: 400 }
    )
  }

  // Normalize structured hazards (new UI) or legacy hazards_controls lines.
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

  const legacyHazards: Array<{
    hazard: string
    existing_controls: string | null
  }> = []

  if (hazards.length === 0 && Array.isArray(body.hazards_controls)) {
    for (const item of body.hazards_controls) {
      const hazard =
        typeof item.hazard === 'string'
          ? item.hazard.trim()
          : ''
      if (hazard) {
        legacyHazards.push({
          hazard,
          existing_controls:
            typeof item.control === 'string' &&
            item.control.trim()
              ? item.control.trim()
              : null,
        })
      }
    }
  }

  const { data: jha, error: insertError } =
    await supabase
      .from('jhas')
      .insert({
        permit_id: permit.id,
        title,
        description:
          typeof body.description === 'string'
            ? body.description.trim() || null
            : null,
        hazards_controls:
          Array.isArray(body.hazards_controls)
            ? body.hazards_controls
            : null,
        status: 'pending',
        created_by: user.id,
      })
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

  if (insertError) {
    console.error(
      'Failed to create JHA:',
      insertError
    )

    return NextResponse.json(
      {
        error:
          insertError?.message ||
          'Unable to create JHA',
      },
      { status: 500 }
    )
  }

  // Persist the structured hazard rows. Structured rows (new UI) and
  // legacy hazards_controls lines are normalized into one shape first so
  // the insert below never has to discriminate between the two.
  type HazardRow = {
    hazard: string
    hazard_category: string | null
    consequence: string | null
    existing_controls: string | null
    control_types: string[]
    likelihood: number | null
    severity: number | null
    additional_controls: string | null
    residual_likelihood: number | null
    residual_severity: number | null
  }

  const rowsToInsert: HazardRow[] = hazards.length > 0
    ? hazards.map((hazard) => ({
        hazard: hazard.hazard,
        hazard_category: hazard.hazard_category,
        consequence: hazard.consequence,
        existing_controls: hazard.existing_controls,
        control_types: hazard.control_types,
        likelihood: hazard.likelihood,
        severity: hazard.severity,
        additional_controls: hazard.additional_controls,
        residual_likelihood: hazard.residual_likelihood,
        residual_severity: hazard.residual_severity,
      }))
    : legacyHazards.map((hazard) => ({
        hazard: hazard.hazard,
        hazard_category: null,
        consequence: null,
        existing_controls: hazard.existing_controls,
        control_types: [],
        likelihood: null,
        severity: null,
        additional_controls: null,
        residual_likelihood: null,
        residual_severity: null,
      }))

  if (rowsToInsert.length > 0) {
    const { error: hazardsError } = await supabase
      .from('jha_hazards')
      .insert(
        rowsToInsert.map((hazard, index) => ({
          jha_id: jha.id,
          hazard: hazard.hazard,
          hazard_category: hazard.hazard_category,
          consequence: hazard.consequence,
          existing_controls: hazard.existing_controls,
          control_types: hazard.control_types,
          likelihood: hazard.likelihood,
          severity: hazard.severity,
          risk_rating:
            hazard.likelihood != null &&
            hazard.severity != null
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

    if (hazardsError) {
      console.error(
        'Failed to save JHA hazards:',
        hazardsError
      )
      return NextResponse.json(
        {
          error:
            'JHA was created, but the hazard analysis could not be saved. Please contact support.',
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json(
    {
      success: true,
      jha,
    },
    { status: 201 }
  )
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
