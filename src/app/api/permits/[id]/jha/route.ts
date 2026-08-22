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

  return NextResponse.json(
    {
      success: true,
      jha,
    },
    { status: 201 }
  )
}
