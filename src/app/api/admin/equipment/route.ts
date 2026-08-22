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
    .from('equipment')
    .select(
      'id, company_id, area_id, name, equipment_no, is_active, created_at'
    )
    .order('name')

  if (companyId !== null) {
    query = query.eq('company_id', companyId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to load equipment:', error)
    return NextResponse.json(
      { error: 'Failed to load equipment' },
      { status: 500 }
    )
  }

  return NextResponse.json({ equipment: data ?? [] })
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
    name?: string
    equipment_no?: string | null
    area_id?: number | null
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
      { error: 'Equipment name is required' },
      { status: 400 }
    )
  }

  const areaId =
    body.area_id === null || body.area_id === undefined
      ? null
      : Number(body.area_id)

  const { data: equipment, error: insertError } =
    await supabase
      .from('equipment')
      .insert({
        company_id: admin.profile.company_id,
        area_id: areaId,
        name,
        equipment_no:
          typeof body.equipment_no === 'string' &&
          body.equipment_no.trim()
            ? body.equipment_no.trim()
            : null,
        is_active: true,
      })
      .select(
        'id, company_id, area_id, name, equipment_no, is_active'
      )
      .single()

  if (insertError || !equipment) {
    console.error('Failed to create equipment:', insertError)
    return NextResponse.json(
      {
        error:
          insertError?.message || 'Unable to create equipment',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { success: true, equipment },
    { status: 201 }
  )
}
