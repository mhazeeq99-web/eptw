import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type CreateUserBody = {
  full_name?: string
  email?: string
  employee_no?: string
  phone?: string
  department?: string
  position?: string
  role?:
    | 'safety_coordinator'
    | 'work_supervisor'
    | 'permit_issuer'
    | 'safety'
    | 'supervisor'
    | 'requester'
}

const MANAGER_ROLES = ['safety_manager', 'admin']

const ASSIGNABLE_ROLES = [
  'safety_coordinator',
  'work_supervisor',
  'permit_issuer',
  'safety',
  'supervisor',
  'requester',
]

// ADD THIS GET FUNCTION
export async function GET() {
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

    const { data: users, error: usersError } =
      await supabase
        .from('profiles')
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
          created_at
        `)
        .eq('company_id', profile.company_id)
        .in('role', [
          'safety_manager',
          'safety_coordinator',
          'work_supervisor',
          'permit_issuer',
          'safety',
          'supervisor',
          'requester',
        ])
        .order('created_at', {
          ascending: true,
        })

    if (usersError) {
      console.error(
        'Failed to load company users:',
        usersError
      )

      return NextResponse.json(
        { error: 'Failed to load company users' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      users: users ?? [],
    })
  } catch (error) {
    console.error(
      'Get company users error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// EXISTING POST FUNCTION (keep this as is)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Verify current user
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

    // Get current user's profile
    const { data: profile, error: profileError } =
      await supabase
        .from('profiles')
        .select(`
          id,
          role,
          company_id
        `)
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 403 }
      )
    }

    // Only Safety Manager / Admin can create company users
    if (!MANAGER_ROLES.includes(profile.role)) {
      return NextResponse.json(
        {
          error:
            'Only Safety Manager or Admin can create company users',
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

    const body =
      (await request.json()) as CreateUserBody

    const fullName = body.full_name?.trim()
    const email = body.email?.trim().toLowerCase()
    const role = body.role

    if (!fullName || !email || !role) {
      return NextResponse.json(
        {
          error:
            'Full name, email and role are required',
        },
        { status: 400 }
      )
    }

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid user role' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Create Auth account
    const {
      data: authData,
      error: createAuthError,
    } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })

    if (createAuthError || !authData.user) {
      console.error(
        'Failed to create Auth user:',
        createAuthError
      )

      return NextResponse.json(
        {
          error:
            createAuthError?.message ??
            'Failed to create user account',
        },
        { status: 400 }
      )
    }

    const newUserId = authData.user.id

    // Create profile
    const { data: newProfile, error: insertError } =
      await admin
        .from('profiles')
        .insert({
          id: newUserId,
          full_name: fullName,
          employee_no:
            body.employee_no?.trim() || null,
          email,
          phone:
            body.phone?.trim() || null,
          role,
          department:
            body.department?.trim() || null,
          position:
            body.position?.trim() || null,
          is_active: true,
          company_id: profile.company_id,
        })
        .select(`
          id,
          full_name,
          email,
          employee_no,
          phone,
          role,
          department,
          position,
          is_active,
          company_id
        `)
        .single()

    if (insertError) {
      console.error(
        'Failed to create profile:',
        insertError
      )

      // Roll back Auth user if profile creation fails
      await admin.auth.admin.deleteUser(newUserId)

      return NextResponse.json(
        {
          error:
            'Failed to create user profile',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        user: newProfile,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error(
      'Create company user error:',
      error
    )

    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}