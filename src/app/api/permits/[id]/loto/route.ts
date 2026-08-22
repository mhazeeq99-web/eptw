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

  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `LOTO points can only be added while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    description?: string
    tag_number?: string | null
    isolation_point?: string | null
    lock_number?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const description =
    typeof body.description === 'string'
      ? body.description.trim()
      : ''

  if (!description) {
    return NextResponse.json(
      {
        error:
          'Isolation point description is required',
      },
      { status: 400 }
    )
  }

  const { data: loto, error: insertError } =
    await supabase
      .from('loto_isolation_points')
      .insert({
        permit_id: permit.id,
        description,
        tag_number:
          typeof body.tag_number === 'string'
            ? body.tag_number.trim() || null
            : null,
        isolation_point:
          typeof body.isolation_point === 'string'
            ? body.isolation_point.trim() || null
            : null,
        lock_number:
          typeof body.lock_number === 'string'
            ? body.lock_number.trim() || null
            : null,
        status: 'pending',
        created_by: user.id,
      })
      .select(`
        id,
        permit_id,
        tag_number,
        description,
        isolation_point,
        lock_number,
        status,
        created_by,
        created_at
      `)
      .single()

  if (insertError) {
    console.error(
      'Failed to create LOTO isolation point:',
      insertError
    )

    return NextResponse.json(
      {
        error:
          insertError?.message ||
          'Unable to create LOTO isolation point',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      loto,
    },
    { status: 201 }
  )
}
