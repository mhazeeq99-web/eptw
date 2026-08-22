import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = ['safety_manager', 'admin']

const MANAGEABLE_ROLES = [
  'safety_coordinator',
  'work_supervisor',
  'permit_issuer',
  'safety',
  'supervisor',
  'requester',
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
