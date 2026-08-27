import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminProfile } from '@/lib/admin-auth'
import { deriveUniqueCode } from '@/lib/permit-codes'

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
    .from('permit_types')
    .select(`
      id,
      company_id,
      name,
      code,
      requires_jha,
      requires_gas_test,
      requires_loto,
      requires_site_verification,
      requires_worker_briefing,
      requires_emergency_arrangements,
      is_active,
      is_system,
      created_at
    `)
    .order('name')

  if (companyId !== null) {
    query = query.eq('company_id', companyId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to load permit types:', error)
    return NextResponse.json(
      { error: 'Failed to load permit types' },
      { status: 500 }
    )
  }

  return NextResponse.json({ permit_types: data ?? [] })
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
    code?: string | null
    requires_jha?: boolean
    requires_gas_test?: boolean
    requires_loto?: boolean
    requires_site_verification?: boolean
    requires_worker_briefing?: boolean
    requires_emergency_arrangements?: boolean
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
      { error: 'Permit type name is required' },
      { status: 400 }
    )
  }

  // Derive a code from the name so the user never has to think of one.
  // Respects the (company_id, code) uniqueness constraint by appending a
  // suffix on collision. An explicit code is still honoured if provided
  // (e.g. system seeding), otherwise the name is used.
  const companyId = admin.profile.company_id
  const existingCodes = new Set<string>()

  let codeQuery = supabase.from('permit_types').select('code')
  if (companyId != null) {
    codeQuery = codeQuery.eq('company_id', companyId)
  }
  const { data: existingRows } = await codeQuery
  for (const row of existingRows ?? []) {
    if (row.code) existingCodes.add(row.code)
  }

  const explicitCode =
    typeof body.code === 'string' && body.code.trim()
      ? body.code.trim().toUpperCase()
      : ''
  const code = explicitCode
    ? deriveUniqueCode(explicitCode, existingCodes)
    : deriveUniqueCode(name, existingCodes)

  const { data: permitType, error: insertError } =
    await supabase
      .from('permit_types')
      .insert({
        company_id: admin.profile.company_id,
        name,
        code,
        requires_jha: body.requires_jha === true,
        requires_gas_test: body.requires_gas_test === true,
        requires_loto: body.requires_loto === true,
        requires_site_verification:
          body.requires_site_verification !== false,
        requires_worker_briefing:
          body.requires_worker_briefing === true,
        requires_emergency_arrangements:
          body.requires_emergency_arrangements === true,
        is_active: true,
      })
      .select(`
        id,
        company_id,
        name,
        code,
        requires_jha,
        requires_gas_test,
        requires_loto,
        requires_site_verification,
        requires_worker_briefing,
        requires_emergency_arrangements,
        is_active
      `)
      .single()

  if (insertError || !permitType) {
    console.error('Failed to create permit type:', insertError)
    return NextResponse.json(
      {
        error:
          insertError?.message || 'Unable to create permit type',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { success: true, permit_type: permitType },
    { status: 201 }
  )
}
