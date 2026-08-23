import type { SupabaseClient, User } from '@supabase/supabase-js'

export type PermitScope = {
  profile: {
    id: string
    role: string
    company_id: number | null
  }
  companyId: number | null
  contractorId: number | null
  isPlatformAdmin: boolean
}

/**
 * Resolves how permit queries should be scoped for the current user:
 * - company users: their own company
 * - contractor users (requester without a company): their contractor
 * - platform admin: no scope (cross-company)
 */
export async function resolvePermitScope(
  supabase: SupabaseClient,
  user: User
): Promise<PermitScope | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  const isPlatformAdmin = profile.role === 'platform_admin'

  let contractorId: number | null = null

  if (
    profile.role === 'requester' &&
    !profile.company_id
  ) {
    const { data: membership } = await supabase
      .from('contractor_users')
      .select('contractor_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    contractorId = membership?.contractor_id ?? null
  }

  return {
    profile,
    companyId: isPlatformAdmin ? null : profile.company_id,
    contractorId: contractorId,
    isPlatformAdmin,
  }
}
