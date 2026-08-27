import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncPermitSafetyControls } from '@/lib/safety-controls'
import { canCreatePermit } from '@/lib/entitlements'
import {
  normalizeSpecialDetails,
  validateCsePersonnel,
  type CseResponsibility,
} from '@/lib/specialised-permit'
import { performPermitTransition } from '@/lib/permit-transition'
import { notifyPermitEvent } from '@/lib/notifications'
import { validatePermitSubmission } from '@/lib/permit-submission'

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
    submit?: boolean
    work_title?: string
    work_description?: string | null
    work_location?: string | null
    work_method?: string | null
    area_id?: number | null
    equipment_id?: number | null
    planned_start?: string | null
    planned_end?: string | null
    worker_name?: string | null
    worker_id?: string | null
    staff_reference_name?: string | null
    ppe_other?: string | null
    ppe_item_ids?: number[]
    recommended_control_ids?: number[]
    workers?: Array<{
      full_name?: string
      id_number?: string | null
      nationality?: string | null
      induction_completed?: boolean
    }>
    special_details?: Record<string, unknown> | null
    cse_personnel?: Array<{
      worker_index?: number
      responsibility?: string
    }>
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

  const isSubmit = body.submit === true

  // A DRAFT permit may be incomplete. When submitting, the structured
  // submission validator (run after persistence below) reports exactly what
  // is missing and the permit stays a DRAFT — we do NOT hard-fail here so the
  // UI gets per-field errors.

  // ---------------------------------------------------------
  // 4. Determine contractor / company relationship
  // ---------------------------------------------------------

  let contractorId: number | null = null

  if (profile.role === 'platform_admin') {
    // Platform Admin is not an operational PTW user.
    return NextResponse.json(
      {
        error:
          'Platform Admin does not create operational permits',
      },
      { status: 403 }
    )
  } else if (profile.company_id) {
    // Internal company user (internal_staff / safety roles).
    if (companyId !== profile.company_id) {
      return NextResponse.json(
        {
          error:
            'You can only create permits for your own company',
        },
        { status: 403 }
      )
    }
  } else if (profile.role === 'contractor_admin') {
    // External contractor user (Contractor Admin).
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
  // 4b. Contractor PTW: worker details + customer staff reference
  // ---------------------------------------------------------

  const workerName =
    typeof body.worker_name === 'string'
      ? body.worker_name.trim()
      : ''

  const workerId =
    typeof body.worker_id === 'string'
      ? body.worker_id.trim()
      : ''

  const staffReferenceName =
    typeof body.staff_reference_name === 'string'
      ? body.staff_reference_name.trim()
      : ''

  const workMethod =
    typeof body.work_method === 'string'
      ? body.work_method.trim()
      : ''

  // Normalize the worker list. The new UI sends `workers`; the legacy
  // worker_name/worker_id fields are still accepted and mapped to the first
  // worker for backwards compatibility.
  let workers: Array<{
    full_name: string
    id_number: string
    nationality: string | null
    induction_completed: boolean
  }> = []

  if (Array.isArray(body.workers)) {
    workers = body.workers
      .map((worker) => ({
        full_name:
          typeof worker.full_name === 'string'
            ? worker.full_name.trim()
            : '',
        id_number:
          typeof worker.id_number === 'string'
            ? worker.id_number.trim()
            : '',
        nationality:
          typeof worker.nationality === 'string' &&
          worker.nationality.trim()
            ? worker.nationality.trim()
            : null,
        induction_completed: Boolean(
          worker.induction_completed
        ),
      }))
      .filter((worker) => worker.full_name.length > 0)
  }

  if (contractorId !== null) {
    if (workers.length === 0 && workerName) {
      // Legacy single-worker payload -> one worker row.
      workers = [
        {
          full_name: workerName,
          id_number: workerId,
          nationality: null,
          induction_completed: false,
        },
      ]
    }

    // Contractor worker/staff-reference requirements are enforced by the
    // structured submission validator (after persistence) so an invalid
    // submit returns per-field errors and keeps the permit as a DRAFT.
  }

  const firstWorker = workers[0] ?? null

  const ppeItemIds = Array.isArray(body.ppe_item_ids)
    ? body.ppe_item_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : []

  const recommendedControlIds = Array.isArray(body.recommended_control_ids)
    ? body.recommended_control_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : []

  const ppeOther =
    typeof body.ppe_other === 'string'
      ? body.ppe_other.trim()
      : ''

  // Phase E: CSE personnel assignments reference workers by their index in
  // the `workers` array (they do not have IDs yet at creation time).
  const csePersonnelRequests = Array.isArray(body.cse_personnel)
    ? body.cse_personnel
        .map((item) => ({
          worker_index: Number(item.worker_index),
          responsibility: item.responsibility as
            | CseResponsibility
            | undefined,
        }))
        .filter(
          (item) =>
            Number.isInteger(item.worker_index) &&
            item.worker_index >= 0 &&
            item.responsibility !== undefined
        )
    : []

  // ---------------------------------------------------------
  // 5. Verify permit type belongs to selected company
  // ---------------------------------------------------------

  const {
    data: permitType,
    error: permitTypeError,
  } = await supabase
    .from('permit_types')
    .select('id, company_id, code, is_active')
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

  // Phase E: specialised permit details (validated per permit-type code).
  const specialDetails = normalizeSpecialDetails(
    (permitType as { code?: string | null }).code ?? null,
    body.special_details
  )

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
  // 7b. Entitlement check: monthly permit limit for this company
  //     (server-side; the plan is resolved from the database, never
  //     from client input).
  // ---------------------------------------------------------

  const permitCheck = await canCreatePermit(
    createAdminClient(),
    companyId
  )

  if (!permitCheck.ok) {
    return NextResponse.json(
      {
        error: permitCheck.error,
        usage: permitCheck.usage,
        limit: permitCheck.limit,
        plan: permitCheck.planCode,
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 7c. Validate the planned work period (blocked at create/edit/submit).
  // ---------------------------------------------------------

  if (
    body.planned_start &&
    body.planned_end &&
    new Date(body.planned_end) <=
      new Date(body.planned_start)
  ) {
    return NextResponse.json(
      {
        error:
          'Planned End must be later than Planned Start.',
        field: 'planned_end',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 8. Create permit
  // ---------------------------------------------------------

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
      work_method: workMethod || null,
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
      // Contractor PTW details (null for internal permits).
      worker_name: firstWorker?.full_name ?? null,
      worker_id: firstWorker?.id_number ?? null,
      staff_reference_name: staffReferenceName || null,
      ppe_other: ppeOther || null,
      special_details: specialDetails,
    })
    .select(`
      id,
      permit_no,
      status,
      initiation_mode,
      company_id
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
  // 8a. Persist the worker list (multi-worker support).
  //      NRIC/passport stays inside the permit's RLS scope.
  // ---------------------------------------------------------

  if (workers.length > 0) {
    const { data: insertedWorkers, error: workersError } =
      await supabase
        .from('permit_workers')
        .insert(
          workers.map((worker) => ({
            permit_id: permit.id,
            full_name: worker.full_name,
            id_number: worker.id_number || null,
            nationality: worker.nationality,
            is_contractor: contractorId !== null,
            contractor_id: contractorId,
            induction_completed:
              worker.induction_completed,
            created_by: user.id,
          }))
        )
        .select('id')

    if (workersError) {
      console.error(
        'Failed to save permit workers:',
        workersError
      )

      return NextResponse.json(
        {
          error:
            'Permit was created, but the worker list could not be saved. Please contact support.',
        },
        { status: 500 }
      )
    }

    // Phase E: CSE personnel responsibilities reference workers by index in
    // the submitted workers array -> map to the newly created worker IDs.
    if (csePersonnelRequests.length > 0) {
      const insertedIds = (insertedWorkers ?? []).map(
        (worker) => worker.id
      )

      const mapped = csePersonnelRequests
        .map((item) => ({
          worker_id: insertedIds[item.worker_index],
          responsibility: item.responsibility,
        }))
        .filter(
          (item): item is {
            worker_id: number
            responsibility: CseResponsibility
          } =>
            Number.isInteger(item.worker_id) &&
            item.responsibility !== undefined
        )

      if (mapped.length !== csePersonnelRequests.length) {
        return NextResponse.json(
          {
            error:
              'CSE personnel references a worker index that does not exist on this permit',
          },
          { status: 400 }
        )
      }

      const personnelCheck = await validateCsePersonnel(
        supabase,
        permit.id,
        mapped
      )

      if (!personnelCheck.ok) {
        return NextResponse.json(
          { error: personnelCheck.error },
          { status: 400 }
        )
      }

      if (personnelCheck.assignments.length > 0) {
        const { error: personnelError } =
          await supabase
            .from('permit_cse_personnel')
            .insert(
              personnelCheck.assignments.map(
                (assignment) => ({
                  permit_id: permit.id,
                  worker_id: assignment.worker_id,
                  responsibility:
                    assignment.responsibility,
                  created_by: user.id,
                })
              )
            )

        if (personnelError) {
          console.error(
            'Failed to save CSE personnel:',
            personnelError
          )
          return NextResponse.json(
            {
              error:
                'Permit was created, but the CSE personnel could not be saved. Please contact support.',
            },
            { status: 500 }
          )
        }
      }
    }
  }

  // ---------------------------------------------------------
  // 8b. Persist the permit-level PPE selection.
  // ---------------------------------------------------------

  if (ppeItemIds.length > 0) {
    const { error: ppeError } = await supabase
      .from('permit_ppe')
      .insert(
        ppeItemIds.map((ppeItemId) => ({
          permit_id: permit.id,
          ppe_item_id: ppeItemId,
          is_selected: true,
          created_by: user.id,
        }))
      )

    if (ppeError) {
      console.error(
        'Failed to save permit PPE:',
        ppeError
      )
      return NextResponse.json(
        {
          error:
            'Permit was created, but the PPE selection could not be saved. Please contact support.',
        },
        { status: 500 }
      )
    }
  }

  // ---------------------------------------------------------
  // 8c. Persist the recommended-control confirmations.
  // ---------------------------------------------------------

  if (recommendedControlIds.length > 0) {
    const { error: recError } = await supabase
      .from('permit_recommended_controls')
      .insert(
        recommendedControlIds.map((controlId) => ({
          permit_id: permit.id,
          safety_control_id: controlId,
          is_selected: true,
          created_by: user.id,
        }))
      )

    if (recError) {
      console.error(
        'Failed to save recommended controls:',
        recError
      )
      return NextResponse.json(
        {
          error:
            'Permit was created, but the recommended controls could not be saved. Please contact support.',
        },
        { status: 500 }
      )
    }
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
  // 8e. Direct submit (submit=true): run submission validation, then
  //     transition DRAFT -> PENDING_APPROVAL atomically when valid.
  //     When invalid, the permit remains a DRAFT and the errors are returned
  //     so the UI can highlight exactly what is missing. This deliberately
  //     uses SUBMISSION validation (not the approval/readiness engine) —
  //     safety verification happens later by the authorised verifier.
  // ---------------------------------------------------------

  if (isSubmit) {
    const submission = await validatePermitSubmission(
      supabase,
      permit.id
    )

    if (!submission.ok) {
      return NextResponse.json(
        {
          success: false,
          submitted: false,
          permit,
          errors: submission.errors,
        },
        { status: 422 }
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
        'Failed to submit permit after create:',
        transition.error
      )
      return NextResponse.json(
        {
          error:
            transition.error ??
            'Permit was created but could not be submitted. Please try again.',
          permit,
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
            'Permit submitted for safety approval',
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
          permit: { ...permit, status: 'pending_approval' },
        },
        { status: 500 }
      )
    }

    await notifyPermitEvent(supabase, {
      permit: {
        id: permit.id,
        permit_no: permit.permit_no,
        company_id: permit.company_id,
        requester_id: user.id,
      },
      event: 'permit_submitted',
      actorId: user.id,
    })

    return NextResponse.json(
      {
        success: true,
        submitted: true,
        permit: {
          ...permit,
          status: 'pending_approval',
          workflow_stage: 'safety_approval',
        },
      },
      { status: 201 }
    )
  }

  // ---------------------------------------------------------
  // 9. Return success (draft saved)
  // ---------------------------------------------------------

  return NextResponse.json(
    {
      success: true,
      submitted: false,
      permit,
    },
    { status: 201 }
  )
}