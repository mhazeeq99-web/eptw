import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

/**
 * PATCH /api/admin/users/{id}
 *
 * Platform-admin only. Toggles `profiles.is_active` for any platform user:
 * disable if currently active, enable if disabled. Role changes are
 * intentionally NOT supported (no role-escalation path) — the request body
 * is ignored and only `is_active` is ever written.
 */
export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } =
      await supabase
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 403 }
      )
    }

    if (profile.role !== 'platform_admin') {
      return NextResponse.json(
        {
          error:
            'Only platform administrators can manage users',
        },
        { status: 403 }
      )
    }

    if (!profile.is_active) {
      return NextResponse.json(
        { error: 'Your account is inactive' },
        { status: 403 }
      )
    }

    const { id: targetUserId } = await context.params

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Platform RLS grants platform-wide read of profiles.
    const { data: targetUser, error: targetError } =
      await supabase
        .from('profiles')
        .select('id, is_active')
        .eq('id', targetUserId)
        .single()

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Admins cannot disable/enable their own account through this route.
    if (targetUser.id === user.id) {
      return NextResponse.json(
        { error: 'You cannot modify your own account here' },
        { status: 400 }
      )
    }

    // Toggle server-side from the current DB state (disable if active,
    // enable if disabled) rather than trusting a client-sent value.
    const nextActive = !targetUser.is_active

    // RLS only lets a user update their own profile row, so the
    // service-role client is required for the platform-wide update.
    const admin = createAdminClient()

    const { data: updatedUser, error: updateError } =
      await admin
        .from('profiles')
        .update({ is_active: nextActive })
        .eq('id', targetUserId)
        .select('id, full_name, email, role, is_active')
        .single()

    if (updateError || !updatedUser) {
      console.error(
        'Failed to update platform user status:',
        updateError
      )

      return NextResponse.json(
        { error: 'Failed to update user status' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error) {
    console.error(
      'Update platform user error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
