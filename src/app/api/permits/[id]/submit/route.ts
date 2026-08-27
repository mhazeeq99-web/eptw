import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyPermitEvent } from '@/lib/notifications'
import { performPermitTransition } from '@/lib/permit-transition'
import { validatePermitSubmission } from '@/lib/permit-submission'

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
  // 5. Submission validation (distinct from approval/readiness).
  //    Checks only what the requester/contractor must supply to hand the
  //    permit to the Safety Officer. JHA verification, site verification,
  //    worker briefing, etc. are NOT required here — they are evaluated later
  //    by the approval engine.
  // ---------------------------------------------------------

  const submission = await validatePermitSubmission(
    supabase,
    permit.id
  )

  if (!submission.ok) {
    return NextResponse.json(
      {
        success: false,
        errors: submission.errors,
      },
      { status: 422 }
    )
  }

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
    const transition = await performPermitTransition(
      supabase,
      permit.id,
      'draft',
      'pending_approval',
      {
        workflow_stage: 'safety_approval',
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      }
    )

    if (!transition.ok) {
      console.error(
        'Failed to submit contractor permit:',
        transition.error
      )
      return NextResponse.json(
        {
          error:
            transition.error ?? 'Failed to submit permit',
        },
        { status: 500 }
      )
    }

    const updatedPermit = {
      id: permit.id,
      permit_no: permit.permit_no,
      status: 'pending_approval',
      initiation_mode: permit.initiation_mode,
      workflow_stage: 'safety_approval',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
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

      return NextResponse.json(
        {
          error:
            'Permit was submitted, but audit history could not be recorded. Please contact support.',
        },
        { status: 500 }
      )
    }

    await notifyPermitEvent(supabase, {
      permit: {
        id: permit.id,
        permit_no: permit.permit_no,
        company_id: permit.company_id,
        requester_id: permit.requester_id,
      },
      event: 'permit_submitted',
      actorId: user.id,
    })

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

    const transition = await performPermitTransition(
      supabase,
      permit.id,
      'draft',
      'pending_approval',
      {
        workflow_stage: 'safety_approval',
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      }
    )

    if (!transition.ok) {
      console.error(
        'Failed to submit internal permit:',
        transition.error
      )
      return NextResponse.json(
        {
          error:
            transition.error ?? 'Failed to submit permit',
        },
        { status: 500 }
      )
    }

    const updatedPermit = {
      id: permit.id,
      permit_no: permit.permit_no,
      status: 'pending_approval',
      initiation_mode: permit.initiation_mode,
      workflow_stage: 'safety_approval',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
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

      return NextResponse.json(
        {
          error:
            'Permit was submitted, but audit history could not be recorded. Please contact support.',
        },
        { status: 500 }
      )
    }

    await notifyPermitEvent(supabase, {
      permit: {
        id: permit.id,
        permit_no: permit.permit_no,
        company_id: permit.company_id,
        requester_id: permit.requester_id,
      },
      event: 'permit_submitted',
      actorId: user.id,
    })

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
