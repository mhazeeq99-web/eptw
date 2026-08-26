import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/companies/[id]/suspend
 *
 * Suspends or reactivates a company (flips `companies.is_active` only — no
 * data is ever deleted).
 *
 * Guards:
 *   - Caller must be an active Platform Admin (profile queried server-side).
 *   - `action` must be "suspend" or "reactivate".
 *   - Suspending requires a non-empty `reason`; reactivation does not.
 *
 * The write goes through the service-role client: `companies` has no RLS
 * UPDATE policy (only a SELECT policy), matching the established pattern in
 * `/api/company/users/[id]`. Authorization is enforced here in the route.
 */
export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const { id } = await params
  const companyId = Number(id)

  if (!Number.isInteger(companyId) || companyId <= 0) {
    return NextResponse.json(
      { error: 'Invalid company id' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  // ---------------------------------------------------------
  // 1. Authentication
  // ---------------------------------------------------------

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // ---------------------------------------------------------
  // 2. Platform Admin check (query profile)
  // ---------------------------------------------------------

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active')
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

  if (profile.role !== 'platform_admin') {
    return NextResponse.json(
      { error: 'Only Platform Admins can manage companies' },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 3. Read + validate request body
  // ---------------------------------------------------------

  let body: {
    action?: string
    reason?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const action =
    body.action === 'reactivate'
      ? 'reactivate'
      : body.action === 'suspend'
        ? 'suspend'
        : null

  if (!action) {
    return NextResponse.json(
      { error: 'action must be "suspend" or "reactivate"' },
      { status: 400 }
    )
  }

  const reason =
    typeof body.reason === 'string' ? body.reason.trim() : ''

  if (action === 'suspend' && !reason) {
    return NextResponse.json(
      { error: 'A reason is required when suspending a company' },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 4. Load the company
  // ---------------------------------------------------------

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, is_active')
    .eq('id', companyId)
    .single()

  if (companyError || !company) {
    return NextResponse.json(
      { error: 'Company not found' },
      { status: 404 }
    )
  }

  const nextActive = action === 'reactivate'

  if (company.is_active === nextActive) {
    return NextResponse.json(
      {
        error: company.is_active
          ? 'Company is already active'
          : 'Company is already suspended',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 5. Flip is_active (no data deleted)
  // ---------------------------------------------------------

  const admin = createAdminClient()

  const { data: updated, error: updateError } = await admin
    .from('companies')
    .update({ is_active: nextActive })
    .eq('id', companyId)
    .select('id, name, code, is_active')
    .single()

  if (updateError || !updated) {
    console.error('Failed to update company status:', updateError)

    return NextResponse.json(
      { error: 'Failed to update company status' },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 6. Record to console (no audit table exists)
  // ---------------------------------------------------------

  console.log(
    `[platform-admin] ${action === 'suspend' ? 'Suspended' : 'Reactivated'} ` +
      `company ${updated.id} (${updated.name}) by ${user.id} ` +
      (action === 'suspend'
        ? `— reason: "${reason}" `
        : '') +
      `at ${new Date().toISOString()}`
  )

  return NextResponse.json({
    success: true,
    company: updated,
  })
}
