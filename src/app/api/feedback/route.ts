import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/**
 * POST /api/feedback
 * Any authenticated user submits a feedback entry (title + message).
 * The row is attributed to auth.uid(); the company_id is captured from the
 * caller's profile so Platform Admin can see which company it came from.
 */
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

  let body: { title?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const title =
    typeof body.title === 'string' ? body.title.trim() : ''
  const message =
    typeof body.message === 'string' ? body.message.trim() : ''

  if (!title) {
    return NextResponse.json(
      { error: 'Please provide a title.' },
      { status: 400 }
    )
  }
  if (!message) {
    return NextResponse.json(
      { error: 'Please provide a message.' },
      { status: 400 }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()

  const { error } = await supabase
    .from('feedback')
    .insert({
      user_id: user.id,
      company_id: profile?.company_id ?? null,
      title,
      message,
    })

  if (error) {
    console.error('Failed to submit feedback:', error)
    return NextResponse.json(
      { error: 'Unable to submit feedback.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}

/**
 * GET /api/feedback?page=1&page_size=20
 * Platform Administrators only. Returns a paginated list of all feedback,
 * newest first, joined with the submitting user's name/email.
 */
export async function GET(request: Request) {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'platform_admin') {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const rawPage = Number(url.searchParams.get('page') ?? '1')
  const rawPageSize = Number(
    url.searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE)
  )

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { count } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })

  const { data, error } = await supabase
    .from('feedback')
    .select(
      `
      id,
      title,
      message,
      created_at,
      user_id,
      company_id,
      profiles:user_id ( full_name, email )
    `
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('Failed to load feedback:', error)
    return NextResponse.json(
      { error: 'Unable to load feedback.' },
      { status: 500 }
    )
  }

  const total = count ?? 0
  return NextResponse.json({
    feedback: data ?? [],
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  })
}
