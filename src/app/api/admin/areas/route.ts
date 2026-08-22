import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminProfile } from '@/lib/admin-auth'

export async function GET() {
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

  const admin = await requireAdminProfile(
    supabase,
    user.id
  )

  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.error },
      { status: admin.status }
    )
  }

  const companyId =
    admin.profile.role === 'platform_admin'
      ? null
      : admin.profile.company_id

  let query = supabase
    .from('areas')
    .select('id, company_id, name, code, is_active, created_at')
    .order('name')

  if (companyId !== null) {
    query = query.eq('company_id', companyId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to load areas:', error)
    return NextResponse.json(
      { error: 'Failed to load areas' },
      { status: 500 }
    )
  }

  return NextResponse.json({ areas: data ?? [] })
}

export async function POST(request: Request) {
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

  const admin = await requireAdminProfile(
    supabase,
    user.id
  )

  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.error },
      { status: admin.status }
    )
  }

  if (
    admin.profile.role !== 'platform_admin' &&
    !admin.profile.company_id
  ) {
    return NextResponse.json(
      { error: 'You are not assigned to a company' },
      { status: 400 }
    )
  }

  let body: {
    name?: string
    code?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const name =
    typeof body.name === 'string'
      ? body.name.trim()
      : ''

  if (!name) {
    return NextResponse.json(
      { error: 'Area name is required' },
      { status: 400 }
    )
  }

  const { data: area, error: insertError } =
    await supabase
      .from('areas')
      .insert({
        company_id: admin.profile.company_id,
        name,
        code:
          typeof body.code === 'string' && body.code.trim()
            ? body.code.trim()
            : null,
        is_active: true,
      })
      .select('id, company_id, name, code, is_active')
      .single()

  if (insertError || !area) {
    console.error('Failed to create area:', insertError)
    return NextResponse.json(
      {
        error:
          insertError?.message || 'Unable to create area',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { success: true, area },
    { status: 201 }
  )
}
