import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Searches customer companies for the Create Permit company selector.
 * - Contractor Admin: returns only customer companies that authorize this
 *   contractor (active authorization relationship).
 * - Internal/customer users: returns their own company.
 * - Platform Admin: returns no operational companies (cannot create PTW).
 * Server-side context only; the client never supplies the customer company id
 * as authorization. RLS remains authoritative.
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
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

  if (profile.role === 'platform_admin') {
    // Platform Admin is not an operational permit user.
    return NextResponse.json({ companies: [] })
  }

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  let query = supabase
    .from('companies')
    .select('id, name, code, ssm_registration_no')
    .eq('is_active', true)
    .order('name')

  if (profile.role === 'contractor_admin' && !profile.company_id) {
    // Contractor: only customer companies that authorize this contractor.
    const { data: membership } = await supabase
      .from('contractor_users')
      .select('contractor_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ companies: [] })
    }

    const { data: authorized } = await supabase
      .from('contractor_companies')
      .select('company_id')
      .eq('contractor_id', membership.contractor_id)
      .eq('is_active', true)

    const ids = (authorized ?? []).map((row) => row.company_id)
    if (ids.length === 0) {
      return NextResponse.json({ companies: [] })
    }
    query = query.in('id', ids)
  } else if (profile.company_id) {
    // Internal / safety company user: only their own company.
    query = query.eq('id', profile.company_id)
  } else {
    return NextResponse.json({ companies: [] })
  }

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,code.ilike.%${q}%,ssm_registration_no.ilike.%${q}%`
    )
  }

  const { data, error } = await query.limit(20)

  if (error) {
    console.error('Failed to search companies:', error)
    return NextResponse.json(
      { error: 'Failed to search companies' },
      { status: 500 }
    )
  }

  return NextResponse.json({ companies: data ?? [] })
}
