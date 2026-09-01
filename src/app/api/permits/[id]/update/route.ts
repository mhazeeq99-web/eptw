import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncPermitSafetyControls } from '@/lib/safety-controls'
import {
  normalizeSpecialDetails,
  validateCsePersonnel,
  type CseResponsibility,
} from '@/lib/specialised-permit'

export async function PATCH(
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
  // 2. Get request body
  // ---------------------------------------------------------

  let body: {
    permit_type_id?: number
    work_title?: string
    work_description?: string | null
    work_location?: string | null
    work_method?: string | null
    area_id?: number | null
    equipment_id?: number | null
    contractor_id?: number | null
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
    declaration_confirmed_at?: string | null
    declaration_confirmed_by?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 3. Get existing permit
  // ---------------------------------------------------------

  const { data: permit, error: permitError } =
    await supabase
      .from('permits')
      .select(`
        id,
        permit_no,
        requester_id,
        company_id,
        permit_type_id,
        contractor_id,
        status
      `)
      .eq('id', id)
      .single()

  if (permitError || !permit) {
    return NextResponse.json(
      { error: 'Permit not found' },
      { status: 404 }
    )
  }

  const permitCompanyId = permit.company_id as number | null

  // ---------------------------------------------------------
  // 4. Only requester can edit
  // ---------------------------------------------------------

  if (permit.requester_id !== user.id) {
    return NextResponse.json(
      {
        error:
          'Only the permit requester can edit this permit',
      },
      { status: 403 }
    )
  }

  // ---------------------------------------------------------
  // 5. Only DRAFT or REJECTED permits can be edited
  // ---------------------------------------------------------

  if (
    permit.status !== 'draft' &&
    permit.status !== 'rejected'
  ) {
    return NextResponse.json(
      {
        error:
          `Permit cannot be edited while its status is ${permit.status}`,
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 6. Validate required fields
  // ---------------------------------------------------------

  if (
    !body.permit_type_id ||
    !Number.isInteger(body.permit_type_id)
  ) {
    return NextResponse.json(
      {
        error: 'Permit type is required',
      },
      { status: 400 }
    )
  }

  // A DRAFT may be incomplete, so the work title is optional here (the
  // submission validator enforces it before the permit can be submitted).
  const workTitle =
    typeof body.work_title === 'string'
      ? body.work_title.trim()
      : ''

  // ---------------------------------------------------------
  // 7. Validate permit type and safety requirements
  // ---------------------------------------------------------

  const {
    data: permitType,
    error: permitTypeError,
  } = await supabase
    .from('permit_types')
    .select(`
      id,
      name,
      code,
      requires_jha,
      requires_gas_test,
      requires_loto
    `)
    .eq('id', body.permit_type_id)
    .eq('is_active', true)
    .single()

  if (permitTypeError || !permitType) {
    return NextResponse.json(
      {
        error:
          'Selected permit type was not found or is inactive',
      },
      { status: 400 }
    )
  }

  // Phase 2a hardening: the selected permit type must belong to the
  // permit's company (malicious clients cannot attach another company's type).
  if (permitCompanyId != null) {
    const { data: companyType } = await supabase
      .from('permit_types')
      .select('id')
      .eq('id', body.permit_type_id)
      .eq('company_id', permitCompanyId)
      .eq('is_active', true)
      .maybeSingle()

    if (!companyType) {
      return NextResponse.json(
        {
          error:
            'Selected permit type does not belong to this permit\u2019s company',
        },
        { status: 400 }
      )
    }
  }

  // Phase 2a hardening: validate optional area / equipment / contractor
  // against the permit's company (mirrors the create route).
  const areaId =
    body.area_id == null ? null : Number(body.area_id)
  if (areaId !== null && permitCompanyId != null) {
    const { data: area } = await supabase
      .from('areas')
      .select('id, company_id')
      .eq('id', areaId)
      .eq('company_id', permitCompanyId)
      .eq('is_active', true)
      .maybeSingle()
    if (!area) {
      return NextResponse.json(
        {
          error:
            'Selected area does not belong to this permit\u2019s company',
        },
        { status: 400 }
      )
    }
  }

  const equipmentId =
    body.equipment_id == null ? null : Number(body.equipment_id)
  if (equipmentId !== null && permitCompanyId != null) {
    const { data: equipment } = await supabase
      .from('equipment')
      .select('id, company_id, area_id')
      .eq('id', equipmentId)
      .eq('company_id', permitCompanyId)
      .eq('is_active', true)
      .maybeSingle()
    if (!equipment) {
      return NextResponse.json(
        {
          error:
            'Selected equipment does not belong to this permit\u2019s company',
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

  const contractorId =
    body.contractor_id == null ? null : Number(body.contractor_id)
  if (contractorId !== null && permitCompanyId != null) {
    // The contractor must be actively authorized for this permit's company.
    const { data: relationship } = await supabase
      .from('contractor_companies')
      .select('id')
      .eq('contractor_id', contractorId)
      .eq('company_id', permitCompanyId)
      .eq('is_active', true)
      .maybeSingle()
    if (!relationship) {
      return NextResponse.json(
        {
          error:
            'Selected contractor is not authorized for this permit\u2019s company',
        },
        { status: 400 }
      )
    }
  }

  // Phase E: specialised permit details (validated per permit-type code).
  const specialDetails =
    body.special_details !== undefined
      ? normalizeSpecialDetails(
          permitType.code,
          body.special_details
        )
      : undefined

  const csePersonnelRequests =
    body.cse_personnel !== undefined &&
    Array.isArray(body.cse_personnel)
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
      : null

  // ---------------------------------------------------------
  // 8. Validate planned dates
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
          'Planned end time must be later than planned start time',
      },
      { status: 400 }
    )
  }

  // ---------------------------------------------------------
  // 9. Update permit
  // ---------------------------------------------------------

  // Worker list (new UI sends `workers`; legacy single fields still work).
  let workers: Array<{
    full_name: string
    id_number: string
    nationality: string | null
    induction_completed: boolean
  }> | null = null

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

    const finalContractorId =
      body.contractor_id ?? permit.contractor_id

    if (
      finalContractorId !== null &&
      (workers.length === 0 ||
        workers.some(
          (worker) =>
            !worker.full_name || !worker.id_number
        ))
    ) {
      return NextResponse.json(
        {
          error:
            'Contractor permits require at least one worker with a name and ID/NRIC',
        },
        { status: 400 }
      )
    }
  }

  const firstWorker = workers?.[0] ?? null

  const { data: updatedPermit, error: updateError } =
    await supabase
      .from('permits')
      .update({
        permit_type_id: body.permit_type_id,
        work_title: workTitle,
        work_description:
          body.work_description?.trim() || null,
        work_location:
          body.work_location?.trim() || null,
        work_method:
          typeof body.work_method === 'string'
            ? body.work_method.trim() || null
            : null,
        area_id: areaId,
        equipment_id: equipmentId,
        contractor_id: contractorId,
        planned_start:
          typeof body.planned_start === 'string' &&
          body.planned_start.trim()
            ? body.planned_start
            : null,
        planned_end:
          typeof body.planned_end === 'string' &&
          body.planned_end.trim()
            ? body.planned_end
            : null,
        worker_name: firstWorker?.full_name ?? null,
        worker_id: firstWorker?.id_number ?? null,
        staff_reference_name:
          typeof body.staff_reference_name === 'string'
            ? body.staff_reference_name.trim() || null
            : null,
        ppe_other:
          typeof body.ppe_other === 'string'
            ? body.ppe_other.trim() || null
            : null,
        ...(specialDetails !== undefined
          ? { special_details: specialDetails }
          : {}),
        declaration_confirmed_at:
          typeof body.declaration_confirmed_at === 'string'
            ? body.declaration_confirmed_at
            : null,
        declaration_confirmed_by:
          typeof body.declaration_confirmed_by === 'string'
            ? body.declaration_confirmed_by
            : null,
      })
      .eq('id', id)
      .eq('requester_id', user.id)
      .select(`
        id,
        permit_no,
        status
      `)
      .single()

  if (updateError) {
    return NextResponse.json(
      {
        error: updateError.message,
      },
      { status: 500 }
    )
  }

  // ---------------------------------------------------------
  // 9b. Replace the worker list when the new UI sends one.
  // ---------------------------------------------------------

  if (workers !== null) {
    const finalContractorId =
      body.contractor_id ?? permit.contractor_id

    const { error: deleteError } = await supabase
      .from('permit_workers')
      .delete()
      .eq('permit_id', permit.id)

    if (deleteError) {
      console.error(
        'Failed to replace permit workers:',
        deleteError
      )
      return NextResponse.json(
        {
          error:
            'Permit was updated, but the worker list could not be replaced.',
        },
        { status: 500 }
      )
    }

    if (workers.length > 0) {
      const { error: insertError } = await supabase
        .from('permit_workers')
        .insert(
          workers.map((worker) => ({
            permit_id: permit.id,
            full_name: worker.full_name,
            id_number: worker.id_number || null,
            nationality: worker.nationality,
            is_contractor: finalContractorId !== null,
            contractor_id: finalContractorId,
            induction_completed:
              worker.induction_completed,
            created_by: user.id,
          }))
        )

      if (insertError) {
        console.error(
          'Failed to save permit workers:',
          insertError
        )
        return NextResponse.json(
          {
            error:
              'Permit was updated, but the worker list could not be saved.',
          },
          { status: 500 }
        )
      }
    }
  }

  // ---------------------------------------------------------
  // 9b2. Replace CSE personnel when the new UI sends assignments.
  //      Worker indexes refer to the (possibly replaced) workers array.
  // ---------------------------------------------------------

  if (csePersonnelRequests !== null) {
    // Re-read the current worker list (it may have just been replaced).
    const { data: currentWorkers } = await supabase
      .from('permit_workers')
      .select('id')
      .eq('permit_id', permit.id)
      .order('id')

    const workerIds = (currentWorkers ?? []).map(
      (worker) => worker.id
    )

    const mapped = csePersonnelRequests
      .map((item) => ({
        worker_id: workerIds[item.worker_index],
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

    const { error: deleteCseError } = await supabase
      .from('permit_cse_personnel')
      .delete()
      .eq('permit_id', permit.id)

    if (deleteCseError) {
      console.error(
        'Failed to replace CSE personnel:',
        deleteCseError
      )
      return NextResponse.json(
        {
          error:
            'Permit was updated, but the CSE personnel could not be replaced.',
        },
        { status: 500 }
      )
    }

    if (personnelCheck.assignments.length > 0) {
      const { error: insertCseError } = await supabase
        .from('permit_cse_personnel')
        .insert(
          personnelCheck.assignments.map((assignment) => ({
            permit_id: permit.id,
            worker_id: assignment.worker_id,
            responsibility: assignment.responsibility,
            created_by: user.id,
          }))
        )

      if (insertCseError) {
        console.error(
          'Failed to save CSE personnel:',
          insertCseError
        )
        return NextResponse.json(
          {
            error:
              'Permit was updated, but the CSE personnel could not be saved.',
          },
          { status: 500 }
        )
      }
    }
  }

  // ---------------------------------------------------------
  // 9c. Replace the PPE selection when the new UI sends one.
  // ---------------------------------------------------------

  if (Array.isArray(body.ppe_item_ids)) {    const ppeItemIds = body.ppe_item_ids
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)

    const { error: deletePpeError } = await supabase
      .from('permit_ppe')
      .delete()
      .eq('permit_id', permit.id)

    if (deletePpeError) {
      console.error(
        'Failed to replace permit PPE:',
        deletePpeError
      )
      return NextResponse.json(
        {
          error:
            'Permit was updated, but the PPE selection could not be replaced.',
        },
        { status: 500 }
      )
    }

    if (ppeItemIds.length > 0) {
      const { error: insertPpeError } = await supabase
        .from('permit_ppe')
        .insert(
          ppeItemIds.map((ppeItemId) => ({
            permit_id: permit.id,
            ppe_item_id: ppeItemId,
            is_selected: true,
            created_by: user.id,
          }))
        )

      if (insertPpeError) {
        console.error(
          'Failed to save permit PPE:',
          insertPpeError
        )
        return NextResponse.json(
          {
            error:
              'Permit was updated, but the PPE selection could not be saved.',
          },
          { status: 500 }
        )
      }
    }
  }

  // ---------------------------------------------------------
  // 9d. Replace the recommended-control confirmations.
  // ---------------------------------------------------------

  if (Array.isArray(body.recommended_control_ids)) {
    const controlIds = body.recommended_control_ids
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)

    const { error: deleteRecError } = await supabase
      .from('permit_recommended_controls')
      .delete()
      .eq('permit_id', permit.id)

    if (deleteRecError) {
      console.error(
        'Failed to replace recommended controls:',
        deleteRecError
      )
      return NextResponse.json(
        {
          error:
            'Permit was updated, but the recommended controls could not be replaced.',
        },
        { status: 500 }
      )
    }

    if (controlIds.length > 0) {
      const { error: insertRecError } = await supabase
        .from('permit_recommended_controls')
        .insert(
          controlIds.map((controlId) => ({
            permit_id: permit.id,
            safety_control_id: controlId,
            is_selected: true,
            created_by: user.id,
          }))
        )

      if (insertRecError) {
        console.error(
          'Failed to save recommended controls:',
          insertRecError
        )
        return NextResponse.json(
          {
            error:
              'Permit was updated, but the recommended controls could not be saved.',
          },
          { status: 500 }
        )
      }
    }
  }

  // ---------------------------------------------------------
  // 10. Record revision in audit history
  // ---------------------------------------------------------

  if (permit.status === 'rejected') {
    const { error: historyError } =
      await supabase
        .from('permit_approvals')
        .insert({
          permit_id: permit.id,
          action: 'revised',
          performed_by: user.id,
          remarks:
            'Permit revised after rejection',
        })

    if (historyError) {
      console.error(
        'Failed to record revision history:',
        historyError
      )

      return NextResponse.json(
        {
          error:
            'Permit was updated, but revision history could not be recorded. Please contact support.',
        },
        { status: 500 }
      )
    }
  }

  // ---------------------------------------------------------
  // 10b. Resynchronize required safety controls when the
  //      permit type changes
  // ---------------------------------------------------------

  if (
    permit.permit_type_id &&
    Number(body.permit_type_id) !== permit.permit_type_id
  ) {
    const syncResult = await syncPermitSafetyControls(
      supabase,
      permit.id
    )

    if (syncResult.error) {
      console.error(
        'Failed to resynchronize safety controls:',
        syncResult.error
      )

      return NextResponse.json(
        {
          error:
            'Permit was updated, but safety requirements could not be synchronized. Please contact support.',
        },
        { status: 500 }
      )
    }

    if (!syncResult.applied) {
      console.warn(
        'sync_permit_safety_controls RPC not found; safety controls were not resynchronized for permit',
        permit.id
      )
    }
  }

  return NextResponse.json({
    success: true,
    permit: updatedPermit,
  })
}