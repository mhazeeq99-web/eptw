import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const { id } = await params

  const supabase = await createClient()

  // ---------------------------------------------------------
  // 1. Authentication
  // ---------------------------------------------------------

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // ---------------------------------------------------------
  // 2. Get current user's profile
  // ---------------------------------------------------------

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
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  if (!profile.is_active) {
    return NextResponse.json(
      { error: 'Your account is inactive' },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 3. Get permit
  // ---------------------------------------------------------

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select(`
        id,
        permit_no,
        requester_id,
        company_id,
        contractor_id,
        work_title,
        planned_start,
        planned_end,
        status,
        initiation_mode,
        workflow_stage
      `)
      .eq('id', id)
      .single()

  if (permitError || !permit) {
    return NextResponse.json(
      { error: 'Permit not found' },
      { status: 404 }
    )
  }

  // ---------------------------------------------------------
  // 4. Permit must be a draft
  // ---------------------------------------------------------

  if (permit.status !== 'draft') {
    return NextResponse.json(
      {
        error:
          `Permit cannot be submitted because its current status is ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 5. Validate work title
  // ---------------------------------------------------------

  if (!permit.work_title?.trim()) {
    return NextResponse.json(
      {
        error: 'Work title is required',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Validate planned dates
  // ---------------------------------------------------------

  if (
    permit.planned_start &&
    permit.planned_end &&
    new Date(permit.planned_end) <=
      new Date(permit.planned_start)
  ) {
    return NextResponse.json(
      {
        error:
          'Planned end time must be later than planned start time',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 7. Determine who is submitting
  // ---------------------------------------------------------

  const isContractorCompletion =
    permit.initiation_mode ===
      'contractor_work_supervisor' &&
    permit.workflow_stage ===
      'contractor_completion'

  const isContractorDirect =
    permit.initiation_mode ===
      'contractor_direct'

  // ---------------------------------------------------------
  // 8. Contractor submission
  // ---------------------------------------------------------

  if (
    isContractorCompletion ||
    isContractorDirect
  ) {
    // Contractor must have a contractor company assigned.
    if (!permit.contractor_id) {
      return NextResponse.json(
        {
          error:
            'This permit does not have a contractor assigned',
        },
        { status: 400 }
      )
    }

    // Verify contractor user membership.
    const {
      data: contractorUser,
      error: contractorUserError,
    } = await supabase
      .from('contractor_users')
      .select(`
        contractor_id,
        is_active
      `)
      .eq('user_id', user.id)
      .eq('contractor_id', permit.contractor_id)
      .eq('is_active', true)
      .maybeSingle()

    if (
      contractorUserError ||
      !contractorUser
    ) {
      return NextResponse.json(
        {
          error:
            'You are not an authorized user of the contractor assigned to this permit',
        },
        { status: 403 }
      )
    }

    // Verify contractor is authorized for this company.
    const {
      data: relationship,
      error: relationshipError,
    } = await supabase
      .from('contractor_companies')
      .select(`
        id,
        contractor_id,
        company_id,
        is_active
      `)
      .eq(
        'contractor_id',
        permit.contractor_id
      )
      .eq('company_id', permit.company_id)
      .eq('is_active', true)
      .maybeSingle()

    if (
      relationshipError ||
      !relationship
    ) {
      return NextResponse.json(
        {
          error:
            'This contractor is no longer authorized for this company',
        },
        { status: 403 }
      )
    }

    // Contractor submission moves directly to
    // safety approval.
    const {
      data: updatedPermit,
      error: updateError,
    } = await supabase
      .from('permits')
      .update({
        status: 'pending_approval',
        workflow_stage: 'safety_approval',
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select(`
        id,
        permit_no,
        status,
        initiation_mode,
        workflow_stage,
        submitted_by,
        submitted_at
      `)
      .single()

    if (updateError || !updatedPermit) {
      console.error(
        'Failed to submit contractor permit:',
        updateError
      )

      return NextResponse.json(
        {
          error:
            updateError?.message ??
            'Failed to submit permit',
        },
        { status: 500 }
      )
    }

    // Record contractor submission.
    const { error: historyError } =
      await supabase
        .from('permit_approvals')
        .insert({
          permit_id: permit.id,
          action: 'submitted',
          performed_by: user.id,
          remarks:
            'Contractor submitted permit for safety approval',
        })

    if (historyError) {
      console.error(
        'Failed to create contractor submission history:',
        historyError
      )
    }

    return NextResponse.json({
      success: true,
      permit: updatedPermit,
    })
  }

  // ---------------------------------------------------------
  // 9. Internal PTW submission
  // ---------------------------------------------------------

  if (
    permit.initiation_mode === 'internal'
  ) {
    if (permit.requester_id !== user.id) {
      return NextResponse.json(
        {
          error:
            'You are not the requester of this permit',
        },
        { status: 403 }
      )
    }

    if (
      !profile.company_id ||
      profile.company_id !== permit.company_id
    ) {
      return NextResponse.json(
        {
          error:
            'You can only submit permits for your own company',
        },
        { status: 403 }
      )
    }

    const {
      data: updatedPermit,
      error: updateError,
    } = await supabase
      .from('permits')
      .update({
        status: 'pending_approval',
        workflow_stage: 'safety_approval',
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select(`
        id,
        permit_no,
        status,
        initiation_mode,
        workflow_stage,
        submitted_by,
        submitted_at
      `)
      .single()

    if (updateError || !updatedPermit) {
      console.error(
        'Failed to submit internal permit:',
        updateError
      )

      return NextResponse.json(
        {
          error:
            updateError?.message ??
            'Failed to submit permit',
        },
        { status: 500 }
      )
    }

    const { error: historyError } =
      await supabase
        .from('permit_approvals')
        .insert({
          permit_id: permit.id,
          action: 'submitted',
          performed_by: user.id,
          remarks:
            'Internal permit submitted for safety approval',
        })

    if (historyError) {
      console.error(
        'Failed to create submission history:',
        historyError
      )
    }

    return NextResponse.json({
      success: true,
      permit: updatedPermit,
    })
  }

  // ---------------------------------------------------------
  // 10. Unknown workflow
  // ---------------------------------------------------------

  return NextResponse.json(
    {
      error:
        'Permit workflow is not configured correctly',
    },
    { status: 400 }
  )
}
