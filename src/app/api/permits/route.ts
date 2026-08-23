import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncPermitSafetyControls } from '@/lib/safety-controls'

export async function POST(request: Request) {
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
  // 2. Get current profile
  // ---------------------------------------------------------

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
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
  // 3. Read request body
  // ---------------------------------------------------------

  let body: {
    company_id?: number
    permit_type_id?: number
    work_title?: string
    work_description?: string | null
    work_location?: string | null
    area_id?: number | null
    equipment_id?: number | null
    planned_start?: string | null
    planned_end?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const companyId = Number(body.company_id)
  const permitTypeId = Number(body.permit_type_id)

  if (!Number.isInteger(companyId) || companyId <= 0) {
    return NextResponse.json(
      { error: 'A valid company is required' },
      { status: 400 }
    )
  }

  if (
    !Number.isInteger(permitTypeId) ||
    permitTypeId <= 0
  ) {
    return NextResponse.json(
      { error: 'A valid permit type is required' },
      { status: 400 }
    )
  }

  const workTitle =
    typeof body.work_title === 'string'
      ? body.work_title.trim()
      : ''

  if (!workTitle) {
    return NextResponse.json(
      { error: 'Work title is required' },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 4. Determine contractor / company relationship
  // ---------------------------------------------------------

  let contractorId: number | null = null

  if (profile.role === 'platform_admin') {
    // Platform admin may create a permit for any company.
    // No contractor is automatically assigned.
    contractorId = null
  } else if (profile.company_id) {
    // Internal company user.
    if (companyId !== profile.company_id) {
      return NextResponse.json(
        {
          error:
            'You can only create permits for your own company',
        },
        { status: 403 }
      )
    }
  } else if (profile.role === 'requester') {
    // External contractor user.
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
      .eq('is_active', true)
      .single()

    if (
      contractorUserError ||
      !contractorUser
    ) {
      return NextResponse.json(
        {
          error:
            'Your contractor account is not configured',
        },
        { status: 403 }
      )
    }

    contractorId =
      contractorUser.contractor_id

    // Verify contractor is authorized for
    // the selected customer company.
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
        contractorId
      )
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle()

    if (
      relationshipError ||
      !relationship
    ) {
      return NextResponse.json(
        {
          error:
            'Your contractor company is not authorized to submit permits for this company',
        },
        { status: 403 }
      )
    }
  } else {
    return NextResponse.json(
      {
        error:
          'Your account is not configured to create permits',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 5. Verify permit type belongs to selected company
  // ---------------------------------------------------------

  const {
    data: permitType,
    error: permitTypeError,
  } = await supabase
    .from('permit_types')
    .select('id, company_id, is_active')
    .eq('id', permitTypeId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single()

  if (
    permitTypeError ||
    !permitType
  ) {
    return NextResponse.json(
      {
        error:
          'Selected permit type is not available for this company',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Validate optional area
  // ---------------------------------------------------------

  const areaId =
    body.area_id == null
      ? null
      : Number(body.area_id)

  if (areaId !== null) {
    const {
      data: area,
      error: areaError,
    } = await supabase
      .from('areas')
      .select('id, company_id, is_active')
      .eq('id', areaId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single()

    if (areaError || !area) {
      return NextResponse.json(
        {
          error:
            'Selected area is not available for this company',
        },
        { status: 400 }
      )
    }
  }

  // ---------------------------------------------------------
  // 7. Validate optional equipment
  // ---------------------------------------------------------

  const equipmentId =
    body.equipment_id == null
      ? null
      : Number(body.equipment_id)

  if (equipmentId !== null) {
    const {
      data: equipment,
      error: equipmentError,
    } = await supabase
      .from('equipment')
      .select(`
        id,
        company_id,
        area_id,
        is_active
      `)
      .eq('id', equipmentId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single()

    if (
      equipmentError ||
      !equipment
    ) {
      return NextResponse.json(
        {
          error:
            'Selected equipment is not available for this company',
        },
        { status: 400 }
      )
    }

    if (
      areaId !== null &&
      equipment.area_id !== null &&
      equipment.area_id !== areaId
    ) {
      return NextResponse.json(
        {
          error:
            'Selected equipment does not belong to the selected area',
        },
        { status: 400 }
      )
    }
  }

  // ---------------------------------------------------------
  // 8. Create permit
  // ---------------------------------------------------------

  const {
    data: contractorAuth,
    error: contractorAuthError,
  } = await supabase.rpc(
    'is_contractor_authorized_for_company',
    {
      target_company_id: companyId,
    }
  )

  const {
    data: permit,
    error: permitError,
  } = await supabase
    .from('permits')
    .insert({
      company_id: companyId,
      permit_type_id: permitTypeId,
      requester_id: user.id,
      contractor_id: contractorId,
      work_title: workTitle,
      work_description:
        body.work_description?.trim() || null,
      work_location:
        body.work_location?.trim() || null,
      area_id: areaId,
      equipment_id: equipmentId,
      planned_start:
        body.planned_start || null,
      planned_end:
        body.planned_end || null,
      status: 'draft',
      // The workflow dispatcher in the submit route branches on this
      // field: internal users submit through safety review, contractor
      // users submit directly.
      initiation_mode: contractorId
        ? 'contractor_direct'
        : 'internal',
    })
    .select(`
      id,
      permit_no,
      status,
      initiation_mode
    `)
    .single()

  if (permitError || !permit) {
    console.error(
      `FAILED PERMIT CREATE code=${permitError?.code ?? ''} message=${permitError?.message ?? ''} details=${permitError?.details ?? ''} hint=${permitError?.hint ?? ''}`
    )

    return NextResponse.json(
      {
        error:
          permitError?.message ||
          'Unable to create permit',
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 8b. Synchronize required safety controls for this permit
  // ---------------------------------------------------------

  const syncResult = await syncPermitSafetyControls(
    supabase,
    permit.id
  )

  if (syncResult.error) {
    console.error(
      'Failed to synchronize safety controls:',
      syncResult.error
    )

    return NextResponse.json(
      {
        error:
          'Permit was created, but safety requirements could not be synchronized. Please contact support.',
      },
      { status: 500 }
    )
  }

  if (!syncResult.applied) {
    console.warn(
      'sync_permit_safety_controls RPC not found; relying on database trigger for permit',
      permit.id
    )
  }

  // ---------------------------------------------------------
  // 9. Return success
  // ---------------------------------------------------------

  return NextResponse.json(
    {
      success: true,
      permit,
    },
    { status: 201 }
  )
}