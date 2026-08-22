import type { SupabaseClient } from '@supabase/supabase-js'

const ADMIN_ROLES = [
  'safety_manager',
  'admin',
  'platform_admin',
]

/**
 * Resolves the calling user's profile and verifies they are allowed to
 * administer company configuration (areas, equipment, permit types,
 * safety controls). Returns the profile when authorized.
 */
export async function requireAdminProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<
  | {
      ok: true
      profile: {
        id: string
        role: string
        company_id: number | null
        is_active: boolean
      }
    }
  | { ok: false; status: number; error: string }
> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, company_id, is_active')
    .eq('id', userId)
    .single()

  if (error || !profile) {
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

  if (!ADMIN_ROLES.includes(profile.role)) {
    return {
      ok: false,
      status: 403,
      error:
        'Only company administrators can manage this configuration',
    }
  }

  if (
    profile.role !== 'platform_admin' &&
    !profile.company_id
  ) {
    return {
      ok: false,
      status: 403,
      error: 'Your account is not assigned to a company',
    }
  }

  return { ok: true, profile }
}
