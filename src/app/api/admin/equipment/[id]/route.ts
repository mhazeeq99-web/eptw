import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminProfile } from '@/lib/admin-auth'

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

  const equipmentId = Number(id)

  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    return NextResponse.json(
      { error: 'Invalid equipment id' },
      { status: 400 }
    )
  }

  let body: {
    is_active?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json(
      { error: 'is_active must be a boolean' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('equipment')
    .update({ is_active: body.is_active })
    .eq('id', equipmentId)

  if (admin.profile.role !== 'platform_admin') {
    query = query.eq('company_id', admin.profile.company_id)
  }

  const { data: equipment, error: updateError } = await query
    .select('id, company_id, area_id, name, equipment_no, is_active')
    .single()

  if (updateError || !equipment) {
    console.error('Failed to update equipment:', updateError)
    return NextResponse.json(
      {
        error:
          updateError?.message || 'Unable to update equipment',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, equipment })
}
