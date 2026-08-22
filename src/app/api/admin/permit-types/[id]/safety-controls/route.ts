import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminProfile } from '@/lib/admin-auth'

export async function GET(
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

  // Verify the permit type belongs to the caller's company.
  const typeQuery = supabase
    .from('permit_types')
    .select('id, company_id')
    .eq('id', permitTypeId)
    .single()

  const { data: permitType, error: typeError } =
    await typeQuery

  if (typeError || !permitType) {
    return NextResponse.json(
      { error: 'Permit type not found' },
      { status: 404 }
    )
  }

  if (
    admin.profile.role !== 'platform_admin' &&
    permitType.company_id !== admin.profile.company_id
  ) {
    return NextResponse.json(
      { error: 'Permit type does not belong to your company' },
      { status: 403 }
    )
  }

  const { data: mappings, error: mappingsError } =
    await supabase
      .from('permit_type_safety_controls')
      .select(`
        id,
        permit_type_id,
        safety_control_id,
        is_required,
        safety_control:safety_controls (
          id,
          code,
          name,
          description,
          category
        )
      `)
      .eq('permit_type_id', permitTypeId)
      .order('safety_control_id')

  if (mappingsError) {
    console.error('Failed to load control mappings:', mappingsError)
    return NextResponse.json(
      { error: 'Failed to load control mappings' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    mappings: mappings ?? [],
  })
}

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
    safety_control_id?: number
    is_required?: boolean
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
      { error: 'A valid safety control is required' },
      { status: 400 }
    )
  }

  if (typeof body.is_required !== 'boolean') {
    return NextResponse.json(
      { error: 'is_required must be a boolean' },
      { status: 400 }
    )
  }

  // Verify the permit type belongs to the caller's company.
  const { data: permitType, error: typeError } =
    await supabase
      .from('permit_types')
      .select('id, company_id')
      .eq('id', permitTypeId)
      .single()

  if (typeError || !permitType) {
    return NextResponse.json(
      { error: 'Permit type not found' },
      { status: 404 }
    )
  }

  if (
    admin.profile.role !== 'platform_admin' &&
    permitType.company_id !== admin.profile.company_id
  ) {
    return NextResponse.json(
      { error: 'Permit type does not belong to your company' },
      { status: 403 }
    )
  }

  // Upsert the mapping row.
  const { data: mapping, error: upsertError } =
    await supabase
      .from('permit_type_safety_controls')
      .upsert(
        {
          permit_type_id: permitTypeId,
          safety_control_id: safetyControlId,
          is_required: body.is_required,
        },
        {
          onConflict: 'permit_type_id,safety_control_id',
          ignoreDuplicates: false,
        }
      )
      .select(`
        id,
        permit_type_id,
        safety_control_id,
        is_required
      `)
      .single()

  if (upsertError || !mapping) {
    console.error('Failed to update control mapping:', upsertError)
    return NextResponse.json(
      {
        error:
          upsertError?.message || 'Unable to update control mapping',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, mapping })
}
