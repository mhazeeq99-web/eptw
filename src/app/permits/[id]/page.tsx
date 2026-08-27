import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Printer } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { SubmitPermitButton } from '@/components/permits/submit-permit-button'
import { ResubmitPermitButton } from '@/components/permits/resubmit-permit-button'
import { SuspendPermitButton } from '@/components/permits/suspend-permit-button'
import { VerifySafetyControlButton } from '@/components/permits/verify-safety-control-button'
import { RejectPermitButton } from '@/components/permits/reject-permit-button'
import { CancelPermitButton } from '@/components/permits/cancel-permit-button'
import { ApplicantDeclarationConfirm } from '@/components/permits/applicant-declaration-confirm'
import { LifecyclePanel } from '@/components/permits/lifecycle-panel'
import { JhaSection, type Jha, type HirarcDocument } from '@/components/permits/safety-documents/jha-section'
import { LotoSection, type LotoPoint } from '@/components/permits/safety-documents/loto-section'
import { GasTestSection, type GasTest } from '@/components/permits/safety-documents/gas-test-section'
import { AttachmentsSection, type Attachment } from '@/components/permits/attachments-section'
import { SiteVerificationSection, type SiteChecklistTemplateItem, type SiteVerificationRecord } from '@/components/permits/safety-verification/site-verification-section'
import { WorkerBriefingSection, type WorkerBriefingRecord } from '@/components/permits/safety-verification/worker-briefing-section'
import { PpeVerificationSection, type PpeVerificationItem } from '@/components/permits/safety-verification/ppe-verification-section'
import { EmergencyArrangementsSection, type EmergencyArrangementsRecord } from '@/components/permits/safety-verification/emergency-arrangements-section'
import { SafetyVerificationPanel } from '@/components/permits/safety-verification/safety-verification-panel'
import { SpecialisedPermitSection } from '@/components/permits/specialised/specialised-permit-section'
import { formatDateTimeMY } from '@/lib/dates'
import { BackButton } from '@/components/ui/back-button'

type PermitType = {
  id: number
  name: string
  code: string
  requires_gas_test: boolean
  requires_loto: boolean
  requires_jha: boolean
  requires_site_verification: boolean
  requires_worker_briefing: boolean
  requires_emergency_arrangements: boolean
}

type Area = {
  id: number
  name: string
  code: string
}

type Equipment = {
  id: number
  name: string
  equipment_no: string | null
}

type Contractor = {
  id: number
  company_name: string
}

type Requester = {
  id: string
  full_name: string
  employee_no: string | null
  department: string | null
  position: string | null
}

type PermitApproval = {
  id: number
  action: string
  remarks: string | null
  created_at: string
  performer: {
    full_name: string
    role: string
  } | null
}

type PermitSafetyControl = {
  id: number
  is_required: boolean
  status: string
  verified_by: string | null
  verified_at: string | null
  remarks: string | null
  safety_control: {
    id: number
    code: string
    name: string
    description: string | null
    category: string
  } | null
}

type Permit = {
  id: number
  supervisor_id: string | null
  permit_no: string
  work_title: string
  work_description: string | null
  work_location: string | null
  planned_start: string | null
  planned_end: string | null
  status: string
  initiation_mode: string | null
  workflow_stage: string | null
  submitted_by: string | null
  submitted_at: string | null
  work_verified_by: string | null
  work_verified_at: string | null
  approved_by: string | null
  approved_at: string | null
  completed_by: string | null
  completed_at: string | null
  closed_by: string | null
  closed_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  suspension_reason: string | null
  rejection_reason: string | null
  worker_name: string | null
  worker_id: string | null
  staff_reference_name: string | null
  work_method: string | null
  ppe_other: string | null
  workers: Array<{
    id: number
    full_name: string
    id_number: string | null
    nationality: string | null
    is_contractor: boolean
    induction_completed: boolean
    briefed: boolean
    acknowledged: boolean
    acknowledged_by: string | null
    acknowledged_at: string | null
  }> | null
  permit_ppe: Array<{
    ppe_item_id: number
    is_selected: boolean
    verified: boolean
    verified_by: string | null
    verified_at: string | null
    ppe_item: {
      id: number
      category: string
      name: string
    } | null
  }> | null
  recommended_controls: Array<{
    safety_control_id: number
    is_selected: boolean
    safety_control: { id: number; name: string } | null
  }> | null
  site_verification: {
    id: number
    permit_id: number
    status: string
    checklist: Array<{
      key: string
      status: string
    }>
    verified_by: string | null
    verified_at: string | null
    remarks: string | null
  } | null
  worker_briefing: {
    id: number
    permit_id: number
    status: string
    topics: Array<{
      key: string
      label: string
      covered: boolean
    }>
    briefed_by: string | null
    briefed_at: string | null
    remarks: string | null
  } | null
  emergency_arrangements: {
    id: number
    permit_id: number
    status: string
    emergency_contact: string | null
    muster_point: string | null
    emergency_procedure: string | null
    first_aid_available: boolean
    fire_response_available: boolean
    rescue_required: boolean
    rescue_available: boolean
    confirmed_by: string | null
    confirmed_at: string | null
    remarks: string | null
  } | null
  special_details: Record<string, unknown> | null
  cse_personnel: Array<{
    id: number
    worker_id: number
    responsibility: string
    worker: {
      id: number
      full_name: string
    } | null
  }> | null
  remarks: string | null
  declaration_confirmed_at: string | null
  created_at: string
  permit_type: PermitType | null
  area: Area | null
  equipment: Equipment | null
  contractor: Contractor | null
  company: {
    id: number
    name: string
  } | null
  requester: Requester | null
  approvals: PermitApproval[]
  safety_controls: PermitSafetyControl[]
  jhas: Jha[]
  loto_points: LotoPoint[]
  gas_tests: GasTest[]
  attachments: Attachment[]
  hirarc_documents: HirarcDocument[]
}

export default async function PermitDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()

  // ---------------------------------------------------------
  // Current authenticated user
  // ---------------------------------------------------------

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let currentUserRole: string | null = null

  if (user) {
    const { data: currentProfile } =
      await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    currentUserRole = currentProfile?.role ?? null
  }

  // ---------------------------------------------------------
  // Get permit
  // ---------------------------------------------------------

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
      submitted_by,
      submitted_at,
      work_verified_by,
      work_verified_at,
      approved_by,
      approved_at,
      completed_by,
      completed_at,
      closed_by,
      closed_at,
      cancelled_by,
      cancelled_at,
      suspension_reason,
      rejection_reason,
      worker_name,
      worker_id,
      staff_reference_name,
      work_method,
      ppe_other,
      workers:permit_workers (
        id,
        full_name,
        id_number,
        nationality,
        is_contractor,
        induction_completed,
        briefed,
        acknowledged,
        acknowledged_by,
        acknowledged_at
      ),
      permit_ppe (
        ppe_item_id,
        is_selected,
        verified,
        verified_by,
        verified_at,
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
      site_verification:permit_site_verifications (
        id,
        permit_id,
        status,
        checklist,
        verified_by,
        verified_at,
        remarks
      ),
      worker_briefing:permit_worker_briefings (
        id,
        permit_id,
        status,
        topics,
        briefed_by,
        briefed_at,
        remarks
      ),
      emergency_arrangements:permit_emergency_arrangements (
        id,
        permit_id,
        status,
        emergency_contact,
        muster_point,
        emergency_procedure,
        first_aid_available,
        fire_response_available,
        rescue_required,
        rescue_available,
        confirmed_by,
        confirmed_at,
        remarks
      ),
      special_details,
      cse_personnel:permit_cse_personnel (
        id,
        worker_id,
        responsibility,
        worker:permit_workers!permit_cse_personnel_worker_id_fkey (
          id,
          full_name
        )
      ),
      remarks,
      declaration_confirmed_at,
      created_at,

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
        full_name,
        employee_no,
        department,
        position
      ),

      company:companies!permits_company_id_fkey (
        id,
        name
      ),

      safety_controls:permit_safety_controls (
        id,
        is_required,
        status,
        verified_by,
        verified_at,
        remarks,
        safety_control:safety_controls (
          id,
          code,
          name,
          description,
          category
        )
      ),

      approvals:permit_approvals (
        id,
        action,
        remarks,
        created_at,
        performer:profiles!permit_approvals_performed_by_fkey (
          full_name,
          role
        )
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
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Failed to load permit:', error)
    notFound()
  }

  if (!data) {
    notFound()
  }

  const permit = data as unknown as Permit

  // ---------------------------------------------------------
  // Safety-document permissions (JHA / LOTO / gas testing)
  // ---------------------------------------------------------

  const canAddSafetyDocs =
    permit.status === 'draft' ||
    permit.status === 'pending_approval'

  const canVerifySafetyDocs =
    currentUserRole === 'safety_manager' ||
    currentUserRole === 'safety_coordinator'

  // The Applicant Declaration may be confirmed/revoked by the requester while
  // the permit is in a submittable state (draft, or rejected before resubmit).
  // The submission gate requires the declaration to be confirmed before the
  // permit can move forward.
  const canConfirmDeclaration =
    (permit.status === 'draft' || permit.status === 'rejected') &&
    user?.id === permit.requester?.id

  // Safety-verification actions (site verification, PPE availability,
  // emergency arrangements, worker briefing/acknowledgement) may ONLY be
  // performed by an authorised safety verifier (SM/SC). Contractors and
  // internal staff may view the state but must never see the edit controls —
  // the API already rejects them; we hide the UI to match.
  const canPerformSafetyVerification =
    canAddSafetyDocs && canVerifySafetyDocs

  // ---------------------------------------------------------
  // Site-verification checklist template for this permit type
  // ---------------------------------------------------------

  let siteChecklistTemplate: SiteChecklistTemplateItem[] = []

  if (permit.permit_type?.id) {
    const { data: checklistRows } = await supabase
      .from('permit_type_site_checklist')
      .select('item_key, label, is_required, sort_order')
      .eq('permit_type_id', permit.permit_type.id)
      .order('sort_order')

    siteChecklistTemplate = (checklistRows ?? []).map(
      (row) => ({
        item_key: row.item_key,
        label: row.label,
        is_required: row.is_required,
        sort_order: row.sort_order,
      })
    )
  }

  // ---------------------------------------------------------
  // Permit-type PPE mappings (required vs recommended) for the
  // PPE verification display.
  // ---------------------------------------------------------

  let ppeVerificationItems: PpeVerificationItem[] = []

  if (permit.permit_type?.id) {
    const { data: mappings } = await supabase
      .from('permit_type_ppe')
      .select(`
        ppe_item_id,
        requirement,
        ppe_items ( id, category, name )
      `)
      .eq('permit_type_id', permit.permit_type.id)

    const selectedMap = new Map(
      (permit.permit_ppe ?? []).map((item) => [
        item.ppe_item_id,
        item,
      ])
    )

    ppeVerificationItems = (mappings ?? [])
      .map((mapping) => {
        const ppe = mapping.ppe_items as unknown as
          | { id: number; category: string; name: string }
          | null
        const selected = selectedMap.get(mapping.ppe_item_id)
        return {
          ppe_item_id: mapping.ppe_item_id,
          name: ppe?.name ?? 'PPE item',
          category: ppe?.category ?? 'Other',
          requirement: mapping.requirement as
            | 'required'
            | 'recommended',
          is_selected: selected?.is_selected === true,
          verified: selected?.verified === true,
        }
      })
      .sort((a, b) => {
        const req = (r: string) =>
          r === 'required' ? 0 : 1
        return req(a.requirement) - req(b.requirement)
      })
  }

  // ---------------------------------------------------------
  // Overview summary labels (presentation only)
  // ---------------------------------------------------------

  const validityLabel =
    permit.planned_start || permit.planned_end
      ? `${formatDate(permit.planned_start)} → ${formatDate(permit.planned_end)}`
      : null

  return (
    <DashboardShell>
      <div className="max-w-5xl">
        <div className="mb-6">
          <BackButton href="/permits" label="Back to Permits" />
        </div>

        {/* Permit Overview */}
        <section className="rounded-xl border bg-background">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">
                  {permit.permit_no}
                </h1>

                <StatusBadge status={permit.status} />
              </div>

              <p className="mt-2 text-muted-foreground">
                {permit.permit_type?.name ?? 'Permit'}
              </p>
            </div>

            {permit.status === 'draft' &&
              permit.initiation_mode === 'internal' && (
                <SubmitPermitButton
                  permitId={permit.id}
                  permitNo={permit.permit_no}
                />
              )}

            {permit.status === 'draft' &&
              permit.initiation_mode ===
                'contractor_direct' && (
                <SubmitPermitButton
                  permitId={permit.id}
                  permitNo={permit.permit_no}
                />
              )}

            {permit.status === 'draft' &&
              permit.initiation_mode ===
                'contractor_work_supervisor' &&
              permit.workflow_stage ===
                'contractor_completion' && (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  Awaiting contractor completion.
                </div>
              )}

            {permit.status === 'draft' &&
              user?.id === permit.requester?.id && (
                <Link
                  href={`/permits/${permit.id}/edit`}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Edit Permit
                </Link>
              )}

            {permit.status === 'rejected' &&
              user?.id === permit.requester?.id && (
                <div className="flex gap-2">
                  <Link
                    href={`/permits/${permit.id}/edit`}
                    className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Revise Permit
                  </Link>

                  <ResubmitPermitButton
                    permitId={permit.id}
                    permitNo={permit.permit_no}
                  />
                </div>
              )}

            {/* Safety approval happens from the Safety Verification panel
                (readiness-gated). Reject stays here. */}
            {permit.status === 'pending_approval' &&
              permit.workflow_stage === 'safety_approval' &&
              (currentUserRole === 'safety_coordinator' ||
                currentUserRole === 'safety_manager') && (
                <RejectPermitButton
                  permitId={permit.id}
                  permitNo={permit.permit_no}
                />
              )}

            {/* Suspend stays in the header; resume/complete/close are driven
                from the Permit Lifecycle panel (checklist-gated). */}
            {permit.status === 'active' &&
              (currentUserRole === 'safety_manager' ||
                currentUserRole === 'safety_coordinator') && (
                <SuspendPermitButton
                  permitId={permit.id}
                  permitNo={permit.permit_no}
                />
              )}

            <Link
              href={`/permits/${permit.id}/print`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <Printer className="h-4 w-4" />
              Print / PDF
            </Link>

            {(permit.status === 'draft' ||
              permit.status === 'pending_approval' ||
              permit.status === 'rejected' ||
              permit.status === 'approved' ||
              permit.status === 'issued' ||
              permit.status === 'suspended') &&
              (user?.id === permit.requester?.id ||
                currentUserRole === 'safety_manager' ||
                currentUserRole === 'safety_coordinator') && (
                <CancelPermitButton
                  permitId={permit.id}
                  permitNo={permit.permit_no}
                />
              )}
          </div>

          <div className="grid gap-6 border-t p-6 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem
              label="Company"
              value={permit.company?.name}
            />

            <InfoItem
              label="Area"
              value={permit.area?.name}
            />

            <InfoItem
              label="Validity"
              value={validityLabel}
            />

            <InfoItem
              label="Requester"
              value={permit.requester?.full_name}
            />
          </div>
        </section>

        {/* Workflow Information */}
        {(permit.initiation_mode ||
          permit.workflow_stage ||
          permit.submitted_by ||
          permit.submitted_at ||
          permit.work_verified_by ||
          permit.work_verified_at ||
          permit.approved_by ||
          permit.approved_at) && (
          <section className="mt-6 rounded-xl border bg-background">
            <SectionHeader
              title="Workflow Information"
              subtitle="Initiation, verification and approval trail for this permit"
            />

            <div className="grid gap-6 p-6 md:grid-cols-2">
              {permit.initiation_mode && (
                <InfoItem
                  label="Initiation Mode"
                  value={permit.initiation_mode}
                />
              )}

              {permit.workflow_stage && (
                <InfoItem
                  label="Workflow Stage"
                  value={permit.workflow_stage}
                />
              )}

              {permit.submitted_by && (
                <InfoItem
                  label="Submitted By"
                  value={permit.submitted_by}
                />
              )}

              {permit.submitted_at && (
                <InfoItem
                  label="Submitted At"
                  value={formatDate(permit.submitted_at)}
                />
              )}

              {permit.work_verified_by && (
                <InfoItem
                  label="Work Verified By"
                  value={permit.work_verified_by}
                />
              )}

              {permit.work_verified_at && (
                <InfoItem
                  label="Work Verified At"
                  value={formatDate(permit.work_verified_at)}
                />
              )}

              {permit.approved_by && (
                <InfoItem
                  label="Approved By"
                  value={permit.approved_by}
                />
              )}

              {permit.approved_at && (
                <InfoItem
                  label="Approved At"
                  value={formatDate(permit.approved_at)}
                />
              )}

              {permit.completed_by && (
                <InfoItem
                  label="Completed By"
                  value={permit.completed_by}
                />
              )}

              {permit.completed_at && (
                <InfoItem
                  label="Completed At"
                  value={formatDate(permit.completed_at)}
                />
              )}

              {permit.closed_by && (
                <InfoItem
                  label="Closed By"
                  value={permit.closed_by}
                />
              )}

              {permit.closed_at && (
                <InfoItem
                  label="Closed At"
                  value={formatDate(permit.closed_at)}
                />
              )}

              {permit.cancelled_by && (
                <InfoItem
                  label="Cancelled By"
                  value={permit.cancelled_by}
                />
              )}

              {permit.cancelled_at && (
                <InfoItem
                  label="Cancelled At"
                  value={formatDate(permit.cancelled_at)}
                />
              )}

              {permit.suspension_reason && (
                <div className="md:col-span-2">
                  <InfoItem
                    label="Suspension Reason"
                    value={permit.suspension_reason}
                  />
                </div>
              )}

              {permit.rejection_reason && (
                <div className="md:col-span-2">
                  <InfoItem
                    label="Rejection Reason"
                    value={permit.rejection_reason}
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Divider: APPLICANT / PERMIT INFORMATION ─────── */}
        <div className="mt-8 rounded-lg border border-primary/30 bg-muted/30 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-foreground">APPLICANT / PERMIT INFORMATION</div>

        {/* Permit Information */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader
            title="Permit Information"
            subtitle="Company, permit type and location for the work to be performed"
          />

          <div className="grid gap-6 p-6 md:grid-cols-2">

            <InfoItem
              label="Company"
              value={permit.company?.name}
            />

            <InfoItem
              label="Permit Type"
              value={permit.permit_type?.name}
            />

            <InfoItem
              label="Area"
              value={permit.area?.name}
            />

            <InfoItem
              label="Equipment"
              value={permit.equipment?.name}
            />

          </div>
        </section>

        {/* Work Description & Method */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader
            title="Work Description & Method"
            subtitle="Scope, location and conditions of the work"
          />

          <div className="grid gap-6 p-6 md:grid-cols-2">

            <InfoItem
              label="Work Title"
              value={permit.work_title}
            />

            <InfoItem
              label="Work Location"
              value={permit.work_location}
            />

            <InfoItem
              label="Permit Type"
              value={permit.permit_type?.name}
            />

            <InfoItem
              label="Area"
              value={permit.area?.name}
            />

            <InfoItem
              label="Equipment"
              value={
                permit.equipment
                  ? `${permit.equipment.name}${
                      permit.equipment.equipment_no
                        ? ` (${permit.equipment.equipment_no})`
                        : ''
                    }`
                  : null
              }
            />

            <InfoItem
              label="Contractor"
              value={permit.contractor?.company_name}
            />

            <div className="md:col-span-2">
              <InfoItem
                label="Work Description"
                value={permit.work_description}
              />
            </div>

            {permit.work_method && (
              <div className="md:col-span-2">
                <InfoItem
                  label="Work Method / Sequence"
                  value={permit.work_method}
                />
              </div>
            )}

          </div>
        </section>

        {/* Contractor Details (contractor PTW) */}
        {permit.contractor && (
          <section className="mt-6 rounded-xl border bg-background">
            <SectionHeader
              title="Contractor Details"
              subtitle="Contractor responsible for carrying out this permit"
            />

            <div className="grid gap-6 p-6 md:grid-cols-2">
              <InfoItem
                label="Contractor Company"
                value={permit.contractor.company_name}
              />

              <InfoItem
                label="Contractor Admin"
                value={permit.requester?.full_name}
              />
            </div>
          </section>
        )}

        {/* Customer Staff Reference (contractor PTW) */}
        {permit.contractor && permit.staff_reference_name && (
          <section className="mt-6 rounded-xl border bg-background">
            <SectionHeader
              title={`${permit.company?.name ?? 'Customer Company'}'s Staff Reference`}
              subtitle="Customer company's staff contact for this permit"
            />

            <div className="grid gap-6 p-6 md:grid-cols-2">
              <InfoItem
                label="Reference Name"
                value={permit.staff_reference_name}
              />
            </div>
          </section>
        )}

        {/* Workers / Authorised Personnel */}
        {permit.workers && permit.workers.length > 0 && (
          <section className="mt-6 rounded-xl border bg-background">
            <SectionHeader
              title="Workers / Authorised Personnel"
              subtitle="Personnel authorised to perform the work under this permit"
            />

            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">No.</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">
                        {permit.workers.some((w) => w.is_contractor)
                          ? 'NRIC / Passport'
                          : 'Employee ID'}
                      </th>
                      {permit.workers.some((w) => w.is_contractor) && (
                        <>
                          <th className="px-3 py-2 font-medium">Nationality</th>
                          <th className="px-3 py-2 font-medium">Induction</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {permit.workers.map((worker, index) => (
                      <tr key={worker.id} className="border-b last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="px-3 py-2">{worker.full_name}</td>
                        <td className="px-3 py-2">{worker.id_number ?? '—'}</td>
                        {worker.is_contractor && (
                          <>
                            <td className="px-3 py-2">
                              {worker.nationality ?? '—'}
                            </td>
                            <td className="px-3 py-2">
                              {worker.induction_completed
                                ? 'Completed'
                                : '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Only workers listed and authorised under this permit may
                perform the work / enter the designated work area.
              </p>
            </div>
          </section>
        )}

        {/* Work Period */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader
            title="Work Period"
            subtitle="Scheduled start and end of the work"
          />

          <div className="grid gap-6 p-6 md:grid-cols-2">

            <InfoItem
              label="Planned Start"
              value={formatDate(permit.planned_start)}
            />

            <InfoItem
              label="Planned End"
              value={formatDate(permit.planned_end)}
            />

          </div>
        </section>

        {/* JHA / JSA */}
        <JhaSection
          permitId={permit.id}
          canAdd={canAddSafetyDocs}
          canVerify={canVerifySafetyDocs}
          initialJhas={permit.jhas ?? []}
          initialHirarc={permit.hirarc_documents ?? []}
        />

        {/* Safety Controls */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader
            title="Safety Controls"
            subtitle="Safety controls required or selected for this permit"
          />

          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {permit.safety_controls?.length ? (
              permit.safety_controls.map((control) => (
                <Requirement
                  key={control.id}
                  label={
                    control.safety_control?.name ??
                    'Safety Control'
                  }
                  required={control.is_required}
                  status={control.status}
                  permitId={permit.id}
                  controlId={control.id}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No safety controls configured for this permit.
              </p>
            )}
          </div>
        </section>

        {/* Recommended Controls */}
        {permit.recommended_controls &&
          permit.recommended_controls.filter(
            (item) => item.is_selected && item.safety_control
          ).length > 0 && (
            <section className="mt-6 rounded-xl border bg-background">
              <SectionHeader
                title="Recommended Controls"
                subtitle="Additional controls selected for this permit"
              />

              <div className="flex flex-wrap gap-2 p-6">
                {permit.recommended_controls
                  .filter(
                    (item) => item.is_selected && item.safety_control
                  )
                  .map((item) => (
                    <span
                      key={item.safety_control_id}
                      className="rounded-full border px-3 py-1 text-sm"
                    >
                      {item.safety_control?.name}
                    </span>
                  ))}
              </div>
            </section>
          )}

        {/* PPE Requirements */}
        {(permit.permit_ppe && permit.permit_ppe.length > 0) ||
        permit.ppe_other ? (
          <section className="mt-6 rounded-xl border bg-background">
            <SectionHeader
              title="PPE Requirements"
              subtitle="Personal protective equipment required for this work"
            />

            <div className="p-6">
              {(() => {
                const categories: string[] = []
                const selectedPpe = (permit.permit_ppe ?? [])
                  .filter((item) => item.is_selected)
                  .filter((item) => item.ppe_item)
                for (const item of selectedPpe) {
                  const category = item.ppe_item?.category ?? 'Other'
                  if (!categories.includes(category)) {
                    categories.push(category)
                  }
                }
                return (
                  <div className="space-y-4">
                    {categories.map((category) => (
                      <div key={category}>
                        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {category}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedPpe
                            .filter(
                              (item) =>
                                (item.ppe_item?.category ?? 'Other') ===
                                category
                            )
                            .map((item) => (
                              <span
                                key={item.ppe_item_id}
                                className="rounded-full border px-3 py-1 text-sm"
                              >
                                {item.ppe_item?.name}
                              </span>
                            ))}
                        </div>
                      </div>
                    ))}
                    {permit.ppe_other && (
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Other
                        </p>
                        <p className="mt-1 text-sm">
                          {permit.ppe_other}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </section>
        ) : null}

        {/* Specialised Permit Details (Phase E) */}
        <SpecialisedPermitSection
          permitId={permit.id}
          code={permit.permit_type?.code ?? null}
          initialDetails={permit.special_details ?? null}
          initialWorkers={(permit.workers ?? []).map((worker) => ({
            id: worker.id,
            full_name: worker.full_name,
          }))}
          initialPersonnel={(permit.cse_personnel ?? []).map(
            (assignment) => ({
              id: assignment.id,
              worker_id: assignment.worker_id,
              responsibility: assignment.responsibility,
            })
          )}
          canEdit={canAddSafetyDocs}
        />

        {/* LOTO */}
        <LotoSection
          permitId={permit.id}
          canAdd={canAddSafetyDocs}
          canVerify={canVerifySafetyDocs}
          initialPoints={permit.loto_points ?? []}
        />

        {/* Gas Testing */}
        <GasTestSection
          permitId={permit.id}
          canAdd={canAddSafetyDocs}
          canVerify={canVerifySafetyDocs}
          initialTests={permit.gas_tests ?? []}
        />

        {/* Applicant Declaration */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader
            title="Applicant Declaration"
            subtitle="Declaration made by the applicant for this permit application"
          />

          <div className="p-6">
            <ApplicantDeclarationConfirm
              permitId={permit.id}
              initiallyConfirmed={Boolean(
                permit.declaration_confirmed_at
              )}
              editable={canConfirmDeclaration}
            />
          </div>
        </section>

        {/* ── Divider: SAFETY PERSONNEL VERIFICATION ──────── */}
        <div className="mt-8 rounded-lg border border-primary/30 bg-muted/30 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-foreground">SAFETY PERSONNEL VERIFICATION</div>

        {/* Site / Work-Area Verification (Phase D) */}
        {permit.permit_type?.requires_site_verification !== false && (
          <SiteVerificationSection
            permitId={permit.id}
            canEdit={canPerformSafetyVerification}
            template={siteChecklistTemplate}
            initialRecord={
              (permit.site_verification ?? null) as
                | SiteVerificationRecord
                | null
            }
          />
        )}

        {/* PPE Verification (Phase D) */}
        <PpeVerificationSection
          permitId={permit.id}
          canEdit={canPerformSafetyVerification}
          initialItems={ppeVerificationItems}
        />

        {/* Emergency Arrangements (Phase D) */}
        {permit.permit_type?.requires_emergency_arrangements && (
          <EmergencyArrangementsSection
            permitId={permit.id}
            canEdit={canPerformSafetyVerification}
            initialRecord={
              (permit.emergency_arrangements ?? null) as
                | EmergencyArrangementsRecord
                | null
            }
          />
        )}

        {/* Worker Briefing / Toolbox Talk (Phase D) */}
        {(permit.workers && permit.workers.length > 0) ||
        permit.permit_type?.requires_worker_briefing ? (
          <WorkerBriefingSection
            permitId={permit.id}
            canEdit={canPerformSafetyVerification}
            requiresLoto={
              permit.permit_type?.requires_loto ?? false
            }
            requiresGas={
              permit.permit_type?.requires_gas_test ?? false
            }
            initialRecord={
              (permit.worker_briefing ?? null) as
                | WorkerBriefingRecord
                | null
            }
            initialWorkers={(permit.workers ?? []).map(
              (worker) => ({
                id: worker.id,
                full_name: worker.full_name,
                briefed: worker.briefed,
                acknowledged: worker.acknowledged,
              })
            )}
          />
        ) : null}

        {/* Safety Verification readiness panel (Phase D) */}
        {permit.status === 'pending_approval' ||
        permit.status === 'draft' ? (
          <SafetyVerificationPanel
            permitId={permit.id}
            permitNo={permit.permit_no}
            canApprove={
              permit.status === 'pending_approval' &&
              permit.workflow_stage === 'safety_approval' &&
              (currentUserRole === 'safety_coordinator' ||
                currentUserRole === 'safety_manager')
            }
          />
        ) : null}

        {/* Permit Lifecycle panel (Phase F): validity + resume/complete/close */}
        <LifecyclePanel
          permitId={permit.id}
          status={permit.status}
          permitNo={permit.permit_no}
          canAct={
            currentUserRole === 'safety_manager' ||
            currentUserRole === 'safety_coordinator'
          }
        />

        {/* Supporting Documents */}
        <section className="mt-6 rounded-xl border bg-background">
          <div className="p-6">
            <p className="text-sm text-muted-foreground">
              Supporting Documents — you can attach documents such as
              drawings, method statements and certificates below.
            </p>
          </div>
        </section>

        {/* Attachments */}
        <AttachmentsSection
          permitId={permit.id}
          canUpload={
            permit.status !== 'closed' &&
            permit.status !== 'cancelled'
          }
          canDelete={
            currentUserRole === 'safety_manager' ||
            currentUserRole === 'platform_admin'
          }
          initialAttachments={permit.attachments ?? []}
        />

        {/* Remarks */}
        {permit.remarks && (
          <section className="mt-6 rounded-xl border bg-background">
            <SectionHeader
              title="Remarks"
              subtitle="Additional notes recorded on this permit"
            />

            <div className="p-6">
              <p className="whitespace-pre-wrap text-sm">
                {permit.remarks}
              </p>
            </div>
          </section>
        )}

        {/* Permit History */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader
            title="Permit History"
            subtitle="Chronological record of actions taken on this permit"
          />

          <div className="divide-y">
            {permit.approvals?.length ? (
              [...permit.approvals]
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
                )
                .map((approval) => (
                  <div
                    key={approval.id}
                    className="p-6"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

                      <div>
                        <p className="font-medium uppercase">
                          {formatAction(approval.action)}
                        </p>

                        <p className="text-sm text-muted-foreground">
                          {approval.performer
                            ? `${approval.performer.full_name} · ${formatAction(approval.performer.role)}`
                            : 'Unknown user'}
                        </p>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {formatDate(approval.created_at)}
                      </p>

                    </div>

                    {approval.remarks && (
                      <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
                        {approval.remarks}
                      </div>
                    )}
                  </div>
                ))
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                No approval history available.
              </div>
            )}
          </div>
        </section>

        {/* Requester */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader
            title="Requester"
            subtitle="Details of the person who requested this permit"
          />

          <div className="grid gap-6 p-6 md:grid-cols-2">

            <InfoItem
              label="Name"
              value={permit.requester?.full_name}
            />

            <InfoItem
              label="Employee No."
              value={permit.requester?.employee_no}
            />

            <InfoItem
              label="Department"
              value={permit.requester?.department}
            />

            <InfoItem
              label="Position"
              value={permit.requester?.position}
            />

          </div>
        </section>

        {/* Record Information */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader
            title="Record Information"
            subtitle="System metadata for this permit record"
          />

          <div className="grid gap-6 p-6 md:grid-cols-2">

            <InfoItem
              label="Created"
              value={formatDate(permit.created_at)}
            />

            <InfoItem
              label="Permit Status"
              value={permit.status.toUpperCase()}
            />

          </div>
        </section>

      </div>
    </DashboardShell>
  )
}

/* =========================================================
   COMPONENTS
   ========================================================= */

function SectionHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="border-b px-6 py-4">
      <h2 className="font-semibold">
        {title}
      </h2>

      {subtitle && (
        <p className="mt-0.5 text-sm text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  )
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value?: string | null
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 whitespace-pre-wrap text-sm font-medium">
        {value || '—'}
      </p>
    </div>
  )
}

function Requirement({
  label,
  required,
  status,
  permitId,
  controlId,
}: {
  label: string
  required: boolean
  status?: string
  permitId?: number
  controlId?: number
}) {
  const isPending = status === 'pending'
  const isVerified = status === 'verified'

  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium">
        {label}
      </p>

      <p
        className={`mt-1 text-sm ${
          required
            ? 'text-destructive'
            : 'text-muted-foreground'
        }`}
      >
        {required ? 'Required' : 'Not required'}
      </p>

      {status && (
        <p className="mt-2 text-xs text-muted-foreground">
          Status: {status.replaceAll('_', ' ')}
        </p>
      )}

      {isPending &&
        permitId &&
        controlId && (
          <VerifySafetyControlButton
            permitId={permitId}
            controlId={controlId}
          />
        )}

      {isVerified && (
        <p className="mt-3 text-xs font-medium text-green-600">
          ✓ Verified
        </p>
      )}
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: string
}) {
  return (
    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase">
      {status.replaceAll('_', ' ')}
    </span>
  )
}

function formatDate(value?: string | null) {
  return formatDateTimeMY(value ?? null)
}

function formatAction(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    )
}