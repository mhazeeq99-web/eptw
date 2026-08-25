import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Searches registered contractor companies by name / code / SSM, returning
 * identifier-level info plus whether the caller's own customer company already
 * authorizes each contractor. Used by the customer Safety Manager to find and
 * authorize a registered contractor.
 *
 * The server derives the customer company from the authenticated profile;
 * the client only supplies a search query. Company isolation / RLS remain
 * authoritative.
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

  if (
    profile.role !== 'safety_manager' &&
    profile.role !== 'safety_coordinator' &&
    profile.role !== 'platform_admin'
  ) {
    return NextResponse.json(
      { error: 'Not authorized to search contractors' },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const q = url.searchParams.get('q') ?? ''

  const { data, error } = await supabase.rpc('search_contractors', {
    p_query: q,
  })

  if (error) {
    console.error('Failed to search contractors:', error)
    return NextResponse.json(
      { error: 'Failed to search contractors' },
      { status: 500 }
    )
  }

  return NextResponse.json({ contractors: data ?? [] })
}
