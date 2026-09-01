import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermitAccess } from '@/lib/permit-access'

/**
 * GET /api/permits/[id]
 *
 * Returns the full permit record (with all applicant + safety-document
 * relations) for the requester to continue editing it in the unified draft
 * workspace (/permits/new?edit=id). Restricted to draft and rejected permits
 * the current user is the requester of.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const access = await requirePermitAccess(supabase, user, id)
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  const permitId = Number(id)
  if (!Number.isInteger(permitId) || permitId <= 0) {
    return NextResponse.json(
      { error: 'Invalid permit id' },
      { status: 400 }
    )
  }

  // Only the requester may load a permit into the edit workspace, and only
  // while it is still editable (draft or rejected).
  if (access.data.permit.requester_id !== user.id) {
    return NextResponse.json(
      {
        error:
          'Only the permit requester can edit this permit',
      },
      { status: 403 }
    )
  }

  const status = access.data.permit.status
  if (status !== 'draft' && status !== 'rejected') {
    return NextResponse.json(
      {
        error:
          `This permit is not editable (current status: ${status})`,
      },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('permits')
    .select(`
      id,
      supervisor_id,
      permit_no,
      work_title,
      work_description,
      work_location,
      planned_start,
      planned_end,
      status,
      initiation_mode,
      workflow_stage,
      worker_name,
      worker_id,
      staff_reference_name,
      work_method,
      ppe_other,
      special_details,
      remarks,
      declaration_confirmed_at,
      created_at,

      company_id,
      permit_type_id,
      area_id,
      equipment_id,
      contractor_id,

      workers:permit_workers (
        id,
        full_name,
        id_number,
        nationality,
        is_contractor,
        induction_completed
      ),

      permit_ppe (
        ppe_item_id,
        is_selected,
        verified,
        ppe_item:ppe_items (
          id,
          category,
          name
        )
      ),

      recommended_controls:permit_recommended_controls (
        safety_control_id,
        is_selected,
        safety_control:safety_controls (
          id,
          name
        )
      ),

      safety_controls:permit_safety_controls (
        id,
        is_required,
        status,
        safety_control:safety_controls (
          id,
          code,
          name,
          description,
          category
        )
      ),

      cse_personnel:permit_cse_personnel (
        id,
        worker_id,
        responsibility
      ),

      jhas:jhas (
        id,
        title,
        description,
        hazards_controls,
        status,
        verified_by,
        verified_at,
        created_at,
        hazards:jha_hazards (
          id,
          hazard,
          hazard_category,
          consequence,
          existing_controls,
          control_types,
          likelihood,
          severity,
          risk_rating,
          additional_controls,
          residual_likelihood,
          residual_severity,
          residual_risk,
          sort_order
        ),
        creator:profiles!jhas_created_by_fkey (
          full_name
        ),
        verifier:profiles!jhas_verified_by_fkey (
          full_name
        )
      ),

      hirarc_documents (
        id,
        permit_id,
        uploaded_by,
        filename,
        storage_path,
        content_type,
        size_bytes,
        created_at,
        uploader:profiles!hirarc_documents_uploaded_by_fkey (
          full_name
        )
      ),

      loto_points:loto_isolation_points (
        id,
        tag_number,
        description,
        isolation_point,
        lock_number,
        energy_type,
        isolation_method,
        remarks,
        status,
        verified_by,
        verified_at,
        created_at,
        creator:profiles!loto_isolation_points_created_by_fkey (
          full_name
        ),
        verifier:profiles!loto_isolation_points_verified_by_fkey (
          full_name
        )
      ),

      gas_tests:gas_tests (
        id,
        tester_id,
        tested_at,
        o2,
        lel,
        h2s,
        co,
        remarks,
        instrument,
        instrument_id,
        calibration_status,
        test_location,
        result,
        status,
        verified_by,
        verified_at,
        created_at,
        readings:gas_test_readings (
          id,
          parameter,
          reading,
          unit,
          result
        ),
        tester:profiles!gas_tests_tester_id_fkey (
          full_name
        ),
        verifier:profiles!gas_tests_verified_by_fkey (
          full_name
        )
      ),

      attachments:permit_attachments (
        id,
        permit_id,
        uploaded_by,
        filename,
        storage_path,
        content_type,
        size_bytes,
        created_at,
        uploader:profiles!permit_attachments_uploaded_by_fkey (
          full_name
        )
      ),

      permit_type:permit_types!permits_permit_type_id_fkey (
        id,
        name,
        code,
        requires_gas_test,
        requires_loto,
        requires_jha,
        requires_site_verification,
        requires_worker_briefing,
        requires_emergency_arrangements
      ),

      area:areas!permits_area_id_fkey (
        id,
        name,
        code
      ),

      equipment:equipment!permits_equipment_id_fkey (
        id,
        name,
        equipment_no
      ),

      contractor:contractors!permits_contractor_id_fkey (
        id,
        company_name
      ),

      requester:profiles!permits_requester_id_fkey (
        id,
        full_name
      ),

      company:companies!permits_company_id_fkey (
        id,
        name,
        code
      )
    `)
    .eq('id', permitId)
    .single()

  if (error) {
    console.error('Failed to load permit:', error)
    return NextResponse.json(
      { error: 'Unable to load the permit' },
      { status: 500 }
    )
  }

  return NextResponse.json({ permit: data })
}

/**
 * DELETE /api/permits/[id]
 *
 * Deletes a permit. Only DRAFT permits may be deleted, and only by their
 * requester (or a platform admin). All related safety-document records are
 * cleaned up with the permit.
 */
export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Authorization is enforced in-app via requirePermitAccess (requester or
  // platform_admin only). The actual row deletions run through the admin
  // client because authenticated users have no DELETE RLS policy on these
  // tables — this mirrors how other privileged writes are performed.
  const access = await requirePermitAccess(supabase, user, id)
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  const permit = access.data.permit
  const profile = access.data.profile

  // Only drafts may be deleted. A platform admin may delete any draft;
  // otherwise only the requester can delete their own draft.
  if (permit.status !== 'draft') {
    return NextResponse.json(
      {
        error:
          'Only draft permits can be deleted. This permit is not a draft.',
      },
      { status: 400 }
    )
  }

  if (
    profile.role !== 'platform_admin' &&
    permit.requester_id !== user.id
  ) {
    return NextResponse.json(
      {
        error:
          'Only the permit requester can delete this draft',
      },
      { status: 403 }
    )
  }

  const permitId = Number(id)
  if (!Number.isInteger(permitId) || permitId <= 0) {
    return NextResponse.json(
      { error: 'Invalid permit id' },
      { status: 400 }
    )
  }

  const admin = await createAdminClient()

  const relatedTables = [
    'permit_workers',
    'permit_ppe',
    'permit_safety_controls',
    'permit_recommended_controls',
    'permit_approvals',
    'permit_site_verifications',
    'permit_worker_briefings',
    'permit_emergency_arrangements',
    'jhas',
    'loto_isolation_points',
    'gas_tests',
    'permit_cse_personnel',
    'hirarc_documents',
    'permit_resume_checklists',
    'permit_completion_checklists',
    'permit_closure_checklists',
    'permit_attachments',
  ]

  for (const table of relatedTables) {
    const { error } = await admin
      .from(table as 'permit_workers')
      .delete()
      .eq('permit_id', permitId)
    if (error) {
      console.error(
        `Failed to clean up ${table} for permit ${permitId}:`,
        error.message
      )
    }
  }

  const { error: deleteError } = await admin
    .from('permits')
    .delete()
    .eq('id', permitId)

  if (deleteError) {
    console.error('Failed to delete permit:', deleteError)
    return NextResponse.json(
      {
        error: deleteError?.message || 'Unable to delete the permit',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
