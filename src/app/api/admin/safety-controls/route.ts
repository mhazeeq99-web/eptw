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

  const { data, error } = await supabase
    .from('safety_controls')
    .select(`
      id,
      code,
      name,
      description,
      category,
      is_active,
      is_system,
      created_at
    `)
    .order('name')

  if (error) {
    console.error('Failed to load safety controls:', error)
    return NextResponse.json(
      { error: 'Failed to load safety controls' },
      { status: 500 }
    )
  }

  return NextResponse.json({ safety_controls: data ?? [] })
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

  let body: {
    code?: string
    name?: string
    description?: string | null
    category?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const code =
    typeof body.code === 'string'
      ? body.code.trim().toUpperCase()
      : ''

  const name =
    typeof body.name === 'string'
      ? body.name.trim()
      : ''

  if (!code || !name) {
    return NextResponse.json(
      { error: 'Code and name are required' },
      { status: 400 }
    )
  }

  const { data: control, error: insertError } =
    await supabase
      .from('safety_controls')
      .insert({
        code,
        name,
        description:
          typeof body.description === 'string' &&
          body.description.trim()
            ? body.description.trim()
            : null,
        category:
          typeof body.category === 'string' &&
          body.category.trim()
            ? body.category.trim()
            : null,
        is_active: true,
      })
      .select(`
        id,
        code,
        name,
        description,
        category,
        is_active
      `)
      .single()

  if (insertError || !control) {
    console.error('Failed to create safety control:', insertError)
    return NextResponse.json(
      {
        error:
          insertError?.message || 'Unable to create safety control',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { success: true, safety_control: control },
    { status: 201 }
  )
}
