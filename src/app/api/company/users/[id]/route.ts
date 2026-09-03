import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canCreateUser } from '@/lib/entitlements'

const MANAGER_ROLES = ['safety_manager']

const MANAGEABLE_ROLES = [
  'safety_coordinator',
  'internal_staff',
]

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

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
        .select('id, role, company_id')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 403 }
      )
    }

    if (!MANAGER_ROLES.includes(profile.role)) {
      return NextResponse.json(
        {
          error:
            'Only Safety Manager or Admin can manage company users',
        },
        { status: 403 }
      )
    }

    if (!profile.company_id) {
      return NextResponse.json(
        { error: 'User is not assigned to a company' },
        { status: 400 }
      )
    }

    const { id: targetUserId } = await context.params

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Get target user and verify they belong to the same company.
    const { data: targetUser, error: targetError } =
      await supabase
        .from('profiles')
        .select(
          'id, full_name, role, company_id, is_active'
        )
        .eq('id', targetUserId)
        .single()

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (
      targetUser.company_id !== profile.company_id
    ) {
      return NextResponse.json(
        { error: 'User does not belong to your company' },
        { status: 403 }
      )
    }

    // Managers cannot modify their own account through this route.
    if (targetUser.id === user.id) {
      return NextResponse.json(
        {
          error:
            'You cannot modify your own account here',
        },
        { status: 400 }
      )
    }

    // Only company-managed roles can be changed here.
    if (!MANAGEABLE_ROLES.includes(targetUser.role)) {
      return NextResponse.json(
        { error: 'This user cannot be managed here' },
        { status: 400 }
      )
    }

    const body = await request.json()

    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json(
        {
          error:
            'is_active must be a boolean',
        },
        { status: 400 }
      )
    }

    // Optional role change (validated against assignable roles).
    let nextRole: string | null = null

    if (body.role !== undefined && body.role !== null) {
      if (!MANAGEABLE_ROLES.includes(body.role)) {
        return NextResponse.json(
          { error: 'Invalid user role' },
          { status: 400 }
        )
      }

      nextRole = body.role
    }

    // Entitlement check: the target role's allowance must not be exceeded
    // by this role change (server-side; plan resolved from the database).
    if (nextRole) {
      const userCheck = await canCreateUser(
        createAdminClient(),
        profile.company_id,
        nextRole,
        targetUserId
      )

      if (!userCheck.ok) {
        return NextResponse.json(
          {
            error: userCheck.error,
            usage: userCheck.usage,
            limit: userCheck.limit,
            plan: userCheck.planCode,
          },
          { status: 403 }
        )
      }
    }

    const admin = createAdminClient()

    const updatePayload: Record<string, unknown> = {
      is_active: body.is_active,
    }

    if (nextRole) {
      updatePayload.role = nextRole
    }

    const { data: updatedUser, error: updateError } =
      await admin
        .from('profiles')
        .update(updatePayload)
        .eq('id', targetUserId)
        .eq('company_id', profile.company_id)
        .select(`
          id,
          full_name,
          email,
          employee_no,
          phone,
          department,
          position,
          role,
          is_active,
          company_id
        `)
        .single()

    if (updateError || !updatedUser) {
      console.error(
        'Failed to update company user:',
        updateError
      )

      return NextResponse.json(
        {
          error:
            'Failed to update user status',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error) {
    console.error(
      'Update company user error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/company/users/{id}
 *
 * PERMANENTLY removes a company-managed user (internal staff / safety
 * coordinator): deletes their Auth account (which cascades to their profile
 * and auth-side rows). Users who have permit/audit history (permits they
 * requested/acted on, approvals they performed, etc.) cannot be fully removed
 * because business records reference their profile — the API refuses with a
 * clear message and the Safety Manager should use Deactivate instead.
 */
export async function DELETE(
  _request: Request,
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
        .select('id, role, company_id')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 403 }
      )
    }

    if (!MANAGER_ROLES.includes(profile.role)) {
      return NextResponse.json(
        {
          error:
            'Only Safety Manager or Admin can remove company users',
        },
        { status: 403 }
      )
    }

    if (!profile.company_id) {
      return NextResponse.json(
        { error: 'User is not assigned to a company' },
        { status: 400 }
      )
    }

    const { id: targetUserId } = await context.params

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const { data: targetUser, error: targetError } =
      await supabase
        .from('profiles')
        .select(
          'id, full_name, role, company_id, is_active, invitation_sent_at'
        )
        .eq('id', targetUserId)
        .single()

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (
      targetUser.company_id !== profile.company_id
    ) {
      return NextResponse.json(
        { error: 'User does not belong to your company' },
        { status: 403 }
      )
    }

    if (targetUser.id === user.id) {
      return NextResponse.json(
        {
          error:
            'You cannot remove your own account here',
        },
        { status: 400 }
      )
    }

    if (!MANAGEABLE_ROLES.includes(targetUser.role)) {
      return NextResponse.json(
        { error: 'This user cannot be managed here' },
        { status: 400 }
      )
    }

    // Safety guard: an account may only be permanently REMOVED after it has
    // been DEACTIVATED first. This prevents accidental deletion of an active
    // user and gives the manager a deliberate two-step flow.
    if (targetUser.is_active) {
      return NextResponse.json(
        {
          error:
            'Deactivate the account first before removing it.',
        },
        { status: 409 }
      )
    }

    const admin = createAdminClient()

    // Business records that reference the profile must be clean before the
    // Auth user (and its profile, via ON DELETE CASCADE) can be removed.
    const { data: hasPermitHistory } = await admin
      .from('permits')
      .select('id', { count: 'exact', head: true })
      .or(
        [
          `requester_id.eq.${targetUserId}`,
          `submitted_by.eq.${targetUserId}`,
          `approved_by.eq.${targetUserId}`,
          `suspended_by.eq.${targetUserId}`,
          `completed_by.eq.${targetUserId}`,
          `closed_by.eq.${targetUserId}`,
          `cancelled_by.eq.${targetUserId}`,
          `permit_issuer_id.eq.${targetUserId}`,
          `safety_reviewer_id.eq.${targetUserId}`,
          `supervisor_id.eq.${targetUserId}`,
          `work_verified_by.eq.${targetUserId}`,
          `special_verified_by.eq.${targetUserId}`,
          `declaration_confirmed_by.eq.${targetUserId}`,
        ].join(',')
      )

    const { data: hasApprovals } = await admin
      .from('permit_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('performed_by', targetUserId)

    const { data: hasNotifications } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetUserId)

    const { data: hasFeedback } = await admin
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetUserId)

    const historyCount =
      (hasPermitHistory?.length ?? 0) +
      (hasApprovals?.length ?? 0) +
      (hasNotifications?.length ?? 0) +
      (hasFeedback?.length ?? 0)

    if (historyCount > 0) {
      return NextResponse.json(
        {
          error:
            'This account has activity records (permits, approvals, notifications or feedback) and cannot be fully removed. Use Deactivate to disable the account while keeping its records.',
        },
        { status: 409 }
      )
    }

    // Soft rows owned by the user (preferences cascade with the profile).
    const { error: prefsError } = await admin
      .from('notification_preferences')
      .delete()
      .eq('user_id', targetUserId)

    if (prefsError) {
      console.error(
        'Failed to clean notification preferences:',
        prefsError
      )
    }

    const { error: deleteError } =
      await admin.auth.admin.deleteUser(targetUserId)

    if (deleteError) {
      console.error(
        'Failed to delete Auth user:',
        deleteError
      )

      return NextResponse.json(
        {
          error:
            'The account could not be fully removed. It may have activity records. Use Deactivate to disable it instead.',
        },
        { status: 409 }
      )
    }

    console.info(
      `[audit] company_user_removed actor=${user.id} target=${targetUserId} company=${profile.company_id}`
    )

    return NextResponse.json({
      success: true,
      message: 'User removed permanently.',
    })
  } catch (error) {
    console.error(
      'Delete company user error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
