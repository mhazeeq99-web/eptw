import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canCreateUser } from '@/lib/entitlements'
import { sendInvitationEmail } from '@/lib/email'
import {
  getAppAuthRedirectUrl,
  getAppBaseUrl,
  extractInviteToken,
} from '@/lib/app-url'

type CreateUserBody = {
  full_name?: string
  email?: string
  employee_no?: string
  phone?: string
  department?: string
  position?: string
  role?: 'safety_coordinator' | 'internal_staff'
}

const MANAGER_ROLES = ['safety_manager']

const ASSIGNABLE_ROLES = [
  'safety_coordinator',
  'internal_staff',
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
          invitation_sent_at,
          created_at
        `)
        .eq('company_id', profile.company_id)
        .in('role', [
          'safety_manager',
          'safety_coordinator',
          'internal_staff',
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

    // `invitation_sent_at` stays set forever, so on its own it cannot tell an
    // invitation that is still pending from one that was already accepted.
    // Enrich every row with the Auth acceptance signal so the page can show the
    // Resend Invitation action only while it is actually usable (the resend
    // endpoint rejects accounts that are already active).
    // null = unknown (Auth lookup unavailable) — the UI then keeps the previous
    // behaviour rather than hiding the action.
    const acceptedByUserId = new Map<string, boolean>()

    try {
      const admin = createAdminClient()
      const perPage = 200

      for (let page = 1; page <= 10; page++) {
        const { data: authPage, error: authError } =
          await admin.auth.admin.listUsers({ page, perPage })

        if (authError) throw authError

        const authUsers = authPage?.users ?? []

        for (const authUser of authUsers) {
          acceptedByUserId.set(
            authUser.id,
            Boolean(
              authUser.email_confirmed_at ||
                (authUser as { confirmed_at?: string | null })
                  .confirmed_at ||
                authUser.last_sign_in_at
            )
          )
        }

        if (authUsers.length < perPage) break
      }
    } catch (authLookupError) {
      console.warn(
        'Could not read Auth users for invitation state:',
        authLookupError
      )
    }

    const usersWithInvitationState = (users ?? []).map((user) => ({
      ...user,
      invitation_accepted: acceptedByUserId.has(user.id)
        ? acceptedByUserId.get(user.id)
        : null,
    }))

    return NextResponse.json({
      users: usersWithInvitationState,
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

    // Entitlement check: per-role + total user limits for the company
    // (server-side; the plan is resolved from the database).
    const userCheck = await canCreateUser(
      createAdminClient(),
      profile.company_id,
      role
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

    const admin = createAdminClient()

    // Create the Auth account WITHOUT a password and WITHOUT pre-confirming
    // the email, so the invited user must set their own password via the
    // secure Supabase Auth invitation link (never an admin-known password).
    const {
      data: authData,
      error: createAuthError,
    } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
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

    // The invited user must be redirected back to THIS app to set a password.
    // Supabase's default Site URL (localhost:3000) is not where ePTW runs, so
    // an explicit redirect target is required or the invite lands on the wrong
    // host and the staff member cannot complete registration.
    const appRedirectUrl = getAppAuthRedirectUrl(request)

    // Generate the secure invitation (password-setup) link via Supabase Auth.
    let inviteLink: string | null = null
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: appRedirectUrl,
        },
      })

    if (inviteError || !inviteData?.properties?.action_link) {
      console.error(
        'Failed to generate invitation link:',
        inviteError
      )
    } else {
      inviteLink = inviteData.properties.action_link
    }

    // Create profile; mark the account as INVITED via invitation_sent_at.
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
          invitation_sent_at: new Date().toISOString(),
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
          invitation_sent_at,
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

    // Deliver the invitation via the Resend email service (best-effort). A
    // failed email NEVER fails user creation — the account exists and the
    // Safety Manager can resend the invitation from the company users page.
    //
    // Spam hygiene: the EMAIL links to the app's branded /invite page
    // (https://<app>/invite?token=...) instead of the raw Supabase URL, so no
    // third-party verification link appears in the message body. The raw link
    // is still returned in the API response for the manager's Copy Invitation
    // Link action.
    let emailSent = false

    // Branded URL for email + copy actions (spam hygiene): points at the
    // app's /invite page instead of the raw Supabase verification URL.
    let brandedInviteUrl: string | null = null
    if (inviteLink) {
      const token = extractInviteToken(inviteLink)
      brandedInviteUrl = token
        ? `${getAppBaseUrl(request)}/invite?token=${encodeURIComponent(token)}`
        : inviteLink

      // Company name is used for the branded email; never blocks the request.
      let companyName: string | null = null
      try {
        const { data: company } = await admin
          .from('companies')
          .select('name')
          .eq('id', profile.company_id ?? -1)
          .maybeSingle()
        companyName = company?.name ?? null
      } catch {
        // Company name is cosmetic — continue without it.
      }

      const result = await sendInvitationEmail({
        to: email,
        fullName,
        role,
        companyName,
        inviteLink: brandedInviteUrl,
      })

      if (result.ok) {
        emailSent = true
      } else {
        console.warn(
          `Invitation email not delivered for ${email}: ${result.error ?? 'unknown error'}`
        )
      }
    }

    return NextResponse.json(
      {
        success: true,
        user: newProfile,
        invitation_sent: Boolean(inviteLink),
        email_sent: emailSent,
        // Branded link (app /invite page). Lets the Safety Manager share
        // registration directly when the email cannot be delivered.
        invite_link: brandedInviteUrl,
        message: emailSent
          ? 'User created and invitation email sent.'
          : 'User created. The invitation email could not be sent — copy the invitation link below to share it with the user.',
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