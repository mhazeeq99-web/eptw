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
 * their own company; platform admins may read any company; contractor admins
 * may read companies they are actively authorized for (contractor_companies).
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

  // A company user may only query their own company. Contractor admins
  // (company_id is NULL) may query the plan of a company they are actively
  // authorized for — the same relationship that lets them raise permits for
  // that company. Attachment access itself is still governed by the
  // PTW-owning company's plan at upload time; this only drives UI gating.
  let isAuthorized =
    isPlatformAdmin ||
    (profile.company_id != null &&
      profile.company_id === rawCompanyId)

  if (
    !isAuthorized &&
    profile.role === 'contractor_admin'
  ) {
    const { data: membership } = await supabase
      .from('contractor_users')
      .select('contractor_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membership) {
      const { data: relationship } = await supabase
        .from('contractor_companies')
        .select('id')
        .eq('contractor_id', membership.contractor_id)
        .eq('company_id', rawCompanyId)
        .eq('is_active', true)
        .maybeSingle()

      isAuthorized = !!relationship
    }
  }

  if (!isAuthorized) {
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
