import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Platform Admin company search for the Platform Configuration page.
 * Returns only identifier-level company info (name, code) so Platform Admin
 * can pick a company before viewing its configuration. Platform Admin only;
 * the selected company is validated server-side by the consumer routes.
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
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!profile.is_active || profile.role !== 'platform_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  let query = supabase
    .from('companies')
    .select('id, name, code')
    .order('name')

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`)
  }

  const { data, error } = await query.limit(25)

  if (error) {
    console.error('Failed to search companies:', error)
    return NextResponse.json(
      { error: 'Failed to search companies' },
      { status: 500 }
    )
  }

  return NextResponse.json({ companies: data ?? [] })
}
