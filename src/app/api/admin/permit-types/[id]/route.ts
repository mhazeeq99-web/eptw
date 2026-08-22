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

  const permitTypeId = Number(id)

  if (!Number.isInteger(permitTypeId) || permitTypeId <= 0) {
    return NextResponse.json(
      { error: 'Invalid permit type id' },
      { status: 400 }
    )
  }

  let body: {
    is_active?: boolean
    requires_jha?: boolean
    requires_gas_test?: boolean
    requires_loto?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const updatePayload: Record<string, unknown> = {}

  if (typeof body.is_active === 'boolean') {
    updatePayload.is_active = body.is_active
  }

  if (typeof body.requires_jha === 'boolean') {
    updatePayload.requires_jha = body.requires_jha
  }

  if (typeof body.requires_gas_test === 'boolean') {
    updatePayload.requires_gas_test = body.requires_gas_test
  }

  if (typeof body.requires_loto === 'boolean') {
    updatePayload.requires_loto = body.requires_loto
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('permit_types')
    .update(updatePayload)
    .eq('id', permitTypeId)

  if (admin.profile.role !== 'platform_admin') {
    query = query.eq('company_id', admin.profile.company_id)
  }

  const { data: permitType, error: updateError } = await query
    .select(`
      id,
      company_id,
      name,
      code,
      requires_jha,
      requires_gas_test,
      requires_loto,
      is_active
    `)
    .single()

  if (updateError || !permitType) {
    console.error('Failed to update permit type:', updateError)
    return NextResponse.json(
      {
        error:
          updateError?.message || 'Unable to update permit type',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, permit_type: permitType })
}
