import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ContractorWithAuth = {
  id: number
  company_name: string
  is_active: boolean | null
  authorized: boolean
  created_at?: string
}

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

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select('id, role, company_id, is_active')
      .eq('id', user.id)
      .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  if (!profile.is_active) {
    return NextResponse.json(
      { error: 'Your account is inactive' },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // Contractor user: return their own contractor and the
  // companies that authorize it.
  // ---------------------------------------------------------

  if (
    profile.role === 'contractor_admin' &&
    !profile.company_id
  ) {
    const { data: membership } = await supabase
      .from('contractor_users')
      .select(`
        contractor_id,
        is_active
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership) {
      return NextResponse.json({
        contractors: [],
      })
    }

    const { data: contractor } = await supabase
      .from('contractors')
      .select('id, company_name')
      .eq('id', membership.contractor_id)
      .single()

    const { data: relationships } = await supabase
      .from('contractor_companies')
      .select(`
        id,
        company_id,
        is_active,
        company:companies (
          id,
          name,
          code
        )
      `)
      .eq('contractor_id', membership.contractor_id)

    return NextResponse.json({
      contractors: contractor
        ? [
            {
              ...contractor,
              authorized: true,
              is_active: membership.is_active,
              companies: relationships ?? [],
            } as ContractorWithAuth & {
              companies: unknown[]
            },
          ]
        : [],
    })
  }

  // ---------------------------------------------------------
  // Company user / platform admin: list contractors and the
  // authorization status for the current company.
  // ---------------------------------------------------------

  if (
    profile.role !== 'platform_admin' &&
    !profile.company_id
  ) {
    return NextResponse.json(
      { error: 'Your account is not configured' },
      { status: 403 }
    )
  }

  const contractorQuery = supabase
    .from('contractors')
    .select('id, company_name, is_active, created_at')
    .order('company_name')

  const { data: contractors, error: contractorsError } =
    await contractorQuery

  if (contractorsError) {
    console.error(
      'Failed to load contractors:',
      contractorsError
    )

    return NextResponse.json(
      { error: 'Failed to load contractors' },
      { status: 500 }
    )
  }

  let authorizedContractorIds = new Set<number>()

  if (profile.company_id) {
    const { data: relationships } = await supabase
      .from('contractor_companies')
      .select('contractor_id')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)

    authorizedContractorIds = new Set(
      (relationships ?? []).map(
        (relationship) => relationship.contractor_id
      )
    )
  }

  const result: ContractorWithAuth[] = (contractors ?? []).map(
    (contractor) => ({
      ...contractor,
      authorized: authorizedContractorIds.has(contractor.id),
    })
  )

  return NextResponse.json({
    contractors: result,
    viewer_role: profile.role,
  })
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

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select('id, role, company_id, is_active')
      .eq('id', user.id)
      .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  if (!profile.is_active) {
    return NextResponse.json(
      { error: 'Your account is inactive' },
      { status: 403 }
    )
  }

  // Contractor companies are created through self-service registration
  // (register_contractor). Only Platform Admin may create a contractor here
  // (administrative seeding); a customer Safety Manager must instead search for
  // an existing registered contractor and authorize it for their company.
  if (profile.role !== 'platform_admin') {
    return NextResponse.json(
      {
        error:
          'Only Platform Admin can create contractor companies. To work with a contractor, search for and authorize an existing registered contractor company.',
      },
      { status: 403 }
    )
  }

  let body: {
    company_name?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const companyName =
    typeof body.company_name === 'string'
      ? body.company_name.trim()
      : ''

  if (!companyName) {
    return NextResponse.json(
      { error: 'Contractor company name is required' },
      { status: 400 }
    )
  }

  const { data: contractor, error: insertError } =
    await supabase
      .from('contractors')
      .insert({
        company_name: companyName,
      })
      .select(`
        id,
        company_name,
        is_active,
        created_at
      `)
      .single()

  if (insertError || !contractor) {
    console.error(
      'Failed to create contractor:',
      insertError
    )

    return NextResponse.json(
      {
        error:
          insertError?.message ||
          'Unable to create contractor',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      contractor,
    },
    { status: 201 }
  )
}
