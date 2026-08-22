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
  // 3. Only Work Supervisor can send PTW to contractor
  // ---------------------------------------------------------

  if (profile.role !== 'work_supervisor') {
    return NextResponse.json(
      {
        error:
          'Only Work Supervisor can send a PTW to a contractor',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 4. Get permit
  // ---------------------------------------------------------

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select(`
        id,
        permit_no,
        company_id,
        requester_id,
        supervisor_id,
        contractor_id,
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
  // 5. Verify permit belongs to current user's company
  // ---------------------------------------------------------

  if (
    !profile.company_id ||
    permit.company_id !== profile.company_id
  ) {
    return NextResponse.json(
      {
        error:
          'You can only manage permits for your own company',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 6. Work Supervisor must be responsible for the permit
  // ---------------------------------------------------------

  if (
    permit.supervisor_id !== user.id &&
    permit.requester_id !== user.id
  ) {
    return NextResponse.json(
      {
        error:
          'You are not the Work Supervisor responsible for this permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 7. Contractor is required
  // ---------------------------------------------------------

  if (!permit.contractor_id) {
    return NextResponse.json(
      {
        error:
          'A contractor must be selected before sending the PTW',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Check company workflow configuration
  // ---------------------------------------------------------

  const { data: company, error: companyError } =
    await supabase
      .from('companies')
      .select(`
        id,
        allow_contractor_work_supervisor_ptw
      `)
      .eq('id', profile.company_id)
      .single()

  if (companyError || !company) {
    return NextResponse.json(
      { error: 'Company configuration not found' },
      { status: 404 }
    )
  }

  if (!company.allow_contractor_work_supervisor_ptw) {
    return NextResponse.json(
      {
        error:
          'Work Supervisor initiated contractor PTW is disabled for this company',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 9. Permit must still be a draft
  // ---------------------------------------------------------

  if (permit.status !== 'draft') {
    return NextResponse.json(
      {
        error:
          `Permit cannot be sent to contractor because its current status is ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 10. Set contractor workflow
  // ---------------------------------------------------------

  const { data: updatedPermit, error: updateError } =
    await supabase
      .from('permits')
      .update({
        initiation_mode:
          'contractor_work_supervisor',
        workflow_stage: 'contractor_completion',
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select(`
        id,
        permit_no,
        status,
        initiation_mode,
        workflow_stage,
        contractor_id,
        supervisor_id
      `)
      .single()

  if (updateError || !updatedPermit) {
    console.error(
      'Failed to send permit to contractor:',
      updateError
    )

    return NextResponse.json(
      {
        error:
          updateError?.message ??
          'Failed to send permit to contractor',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 11. Record audit history
  // ---------------------------------------------------------

  const { error: historyError } =
    await supabase
      .from('permit_approvals')
      .insert({
        permit_id: permit.id,
        action: 'submitted',
        performed_by: user.id,
        remarks:
          'PTW request sent to contractor for completion',
      })

  if (historyError) {
    console.error(
      'Failed to record contractor handoff history:',
      historyError
    )

    return NextResponse.json(
      {
        error:
          'PTW was sent to the contractor, but audit history could not be recorded. Please contact support.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}
