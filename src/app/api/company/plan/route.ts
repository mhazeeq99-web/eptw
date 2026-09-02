import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCompanyPlan, planAllowsAttachments } from '@/lib/entitlements'

/**
 * GET /api/company/plan?company_id=3
 *
 * Returns the subscription/entitlement summary for a company — used ONLY for
 * client-side UI gating (e.g. showing the locked "Attachments on Pro" state).
 * Server routes remain authoritative and always re-check entitlements.
 *
 * Callers must be authorized for the company: company users may only read
 * their own company; platform admins may read any company. Contractors are
 * not allowed to query arbitrary companies.
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

  const url = new URL(request.url)
  const rawCompanyId = Number(url.searchParams.get('company_id'))

  if (!Number.isInteger(rawCompanyId) || rawCompanyId <= 0) {
    return NextResponse.json(
      { error: 'A valid company_id is required' },
      { status: 400 }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) {
    return NextResponse.json(
      { error: 'User profile not found or inactive' },
      { status: 404 }
    )
  }

  const isPlatformAdmin = profile.role === 'platform_admin'

  // A company user may only query their own company. Contractors have no
  // company_id and may not query any company through this endpoint — their
  // attachment access is governed by the PTW-owning company at upload time.
  if (
    !isPlatformAdmin &&
    profile.company_id !== rawCompanyId
  ) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    )
  }

  const plan = await getCompanyPlan(
    createAdminClient(),
    rawCompanyId
  )

  return NextResponse.json({
    company_id: rawCompanyId,
    plan_code: plan.code,
    plan_name: plan.name,
    price_monthly: plan.price_monthly,
    price_annual: plan.price_annual,
    currency: plan.currency,
    max_storage_bytes: plan.max_storage_bytes,
    attachments_enabled: planAllowsAttachments(plan),
  })
}
