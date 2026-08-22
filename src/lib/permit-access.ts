import type { SupabaseClient, User } from '@supabase/supabase-js'

export type PermitAccess = {
  permit: {
    id: number
    company_id: number | null
    contractor_id: number | null
    requester_id: string
    permit_type_id: number | null
    status: string
    workflow_stage: string | null
  }
  profile: {
    id: string
    role: string
    company_id: number | null
    is_active: boolean
  }
}

export type PermitAccessResult =
  | { ok: true; data: PermitAccess }
  | { ok: false; status: number; error: string }

/**
 * Shared authorization gate for permit-scoped operations.
 *
 * - Validates the user's profile exists and is active.
 * - Optionally restricts the action to a set of roles.
 * - Verifies the permit belongs to the user's company, or — for contractor
 *   users — that the user belongs to the contractor assigned to the permit
 *   and that the contractor is authorized for the permit's company.
 * - Platform admin may access any permit.
 */
export async function requirePermitAccess(
  supabase: SupabaseClient,
  user: User,
  permitId: number | string,
  options: { roles?: string[] } = {}
): Promise<PermitAccessResult> {
  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select(`
        id,
        role,
        company_id,
        is_active
      `)
      .eq('id', user.id)
      .single()

  if (profileError || !profile) {
    return {
      ok: false,
      status: 404,
      error: 'User profile not found',
    }
  }

  if (!profile.is_active) {
    return {
      ok: false,
      status: 403,
      error: 'Your account is inactive',
    }
  }

  if (
    options.roles &&
    !options.roles.includes(profile.role)
  ) {
    return {
      ok: false,
      status: 403,
      error: 'You are not authorized to perform this action',
    }
  }

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select(`
        id,
        company_id,
        contractor_id,
        requester_id,
        permit_type_id,
        status,
        workflow_stage
      `)
      .eq('id', permitId)
      .single()

  if (permitError || !permit) {
    return {
      ok: false,
      status: 404,
      error: 'Permit not found',
    }
  }

  const isPlatformAdmin = profile.role === 'platform_admin'

  const isCompanyUser =
    profile.company_id != null &&
    profile.company_id === permit.company_id

  let isAuthorizedContractorUser = false

  if (
    !isPlatformAdmin &&
    !isCompanyUser &&
    permit.contractor_id != null
  ) {
    const { data: membership } = await supabase
      .from('contractor_users')
      .select(`
        contractor_id,
        is_active
      `)
      .eq('user_id', user.id)
      .eq('contractor_id', permit.contractor_id)
      .eq('is_active', true)
      .maybeSingle()

    if (membership) {
      const { data: relationship } = await supabase
        .from('contractor_companies')
        .select('id')
        .eq('contractor_id', permit.contractor_id)
        .eq('company_id', permit.company_id)
        .eq('is_active', true)
        .maybeSingle()

      isAuthorizedContractorUser = !!relationship
    }
  }

  if (
    !isPlatformAdmin &&
    !isCompanyUser &&
    !isAuthorizedContractorUser
  ) {
    return {
      ok: false,
      status: 403,
      error:
        'You do not have access to this permit',
    }
  }

  return {
    ok: true,
    data: {
      permit: {
        id: permit.id,
        company_id: permit.company_id,
        contractor_id: permit.contractor_id,
        requester_id: permit.requester_id,
        permit_type_id: permit.permit_type_id,
        status: permit.status,
        workflow_stage: permit.workflow_stage,
      },
      profile: {
        id: profile.id,
        role: profile.role,
        company_id: profile.company_id,
        is_active: profile.is_active,
      },
    },
  }
}
