import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Printer } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { StartWorkButton } from '@/components/permits/start-work-button'
import { SubmitPermitButton } from '@/components/permits/submit-permit-button'
import { ReviewPermit } from '@/components/permits/review-permit'
import { ResubmitPermitButton } from '@/components/permits/resubmit-permit-button'
import { IssuePermitButton } from '@/components/permits/issue-permit-button'
import { SuspendPermitButton } from '@/components/permits/suspend-permit-button'
import { ResumePermitButton } from '@/components/permits/resume-permit-button'
import { CompletePermitButton } from '@/components/permits/complete-permit-button'
import { ClosePermitButton } from '@/components/permits/close-permit-button'
import { VerifySafetyControlButton } from '@/components/permits/verify-safety-control-button'
import { AssignSupervisor } from '@/components/permits/assign-supervisor'
import { SendToContractorButton } from '@/components/permits/send-to-contractor-button'
import { ApproveAndIssueButton } from '@/components/permits/approve-and-issue-button'
import { CancelPermitButton } from '@/components/permits/cancel-permit-button'
import { RejectPermitButton } from '@/components/permits/reject-permit-button'
import { JhaSection, type Jha } from '@/components/permits/safety-documents/jha-section'
import { LotoSection, type LotoPoint } from '@/components/permits/safety-documents/loto-section'
import { GasTestSection, type GasTest } from '@/components/permits/safety-documents/gas-test-section'
import { AttachmentsSection, type Attachment } from '@/components/permits/attachments-section'

type PermitType = {
  id: number
  name: string
  code: string
  requires_gas_test: boolean
  requires_loto: boolean
  requires_jha: boolean
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
  remarks: string | null
  created_at: string
  permit_type: PermitType | null
  area: Area | null
  equipment: Equipment | null
  contractor: Contractor | null
  requester: Requester | null
  approvals: PermitApproval[]
  safety_controls: PermitSafetyControl[]
  jhas: Jha[]
  loto_points: LotoPoint[]
  gas_tests: GasTest[]
  attachments: Attachment[]
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
      remarks,
      created_at,

      permit_type:permit_types!permits_permit_type_id_fkey (
        id,
        name,
        code,
        requires_gas_test,
        requires_loto,
        requires_jha
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
        status,
        verified_by,
        verified_at,
        created_at,
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
  // Check whether current user is assigned supervisor
  // ---------------------------------------------------------

  const isAssignedSupervisor =
    user?.id === permit.supervisor_id

  // ---------------------------------------------------------
  // Safety-document permissions (JHA / LOTO / gas testing)
  // ---------------------------------------------------------

  const canAddSafetyDocs =
    permit.status === 'draft' ||
    permit.status === 'pending_approval'

  const canVerifySafetyDocs =
    currentUserRole === 'admin' ||
    currentUserRole === 'permit_issuer' ||
    currentUserRole === 'safety' ||
    currentUserRole === 'safety_manager' ||
    currentUserRole === 'safety_coordinator' ||
    currentUserRole === 'work_supervisor' ||
    currentUserRole === 'supervisor'

  return (
    <DashboardShell>
      <div className="max-w-5xl">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
              />
            )}

          {permit.status === 'draft' &&
            permit.initiation_mode ===
              'contractor_work_supervisor' &&
            permit.workflow_stage === 'draft' && (
              <SendToContractorButton
                permitId={permit.id}
              />
            )}

          {permit.status === 'draft' &&
            permit.initiation_mode ===
              'contractor_direct' && (
              <SubmitPermitButton
                permitId={permit.id}
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
                />
              </div>
            )}

          {/* REPLACED OLD APPROVED -> ISSUE WITH NEW APPROVE & ISSUE */}
          {permit.status === 'pending_approval' &&
            permit.workflow_stage === 'safety_approval' &&
            (currentUserRole === 'safety_coordinator' ||
              currentUserRole === 'safety_manager') && (
              <div className="flex flex-wrap items-start gap-2">
                <ApproveAndIssueButton
                  permitId={permit.id}
                />

                <RejectPermitButton
                  permitId={permit.id}
                />
              </div>
            )}

          {permit.status === 'issued' &&
            (currentUserRole === 'permit_issuer' ||
              currentUserRole === 'admin') && (
              <StartWorkButton
                permitId={permit.id}
              />
            )}

          {permit.status === 'active' &&
            (currentUserRole === 'permit_issuer' ||
              currentUserRole === 'admin') && (
              <SuspendPermitButton
                permitId={permit.id}
              />
            )}

          {permit.status === 'suspended' &&
            (currentUserRole === 'permit_issuer' ||
              currentUserRole === 'admin') && (
              <ResumePermitButton
                permitId={permit.id}
              />
            )}

          {permit.status === 'active' &&
            (currentUserRole === 'permit_issuer' ||
              currentUserRole === 'admin') && (
              <CompletePermitButton
                permitId={permit.id}
              />
            )}

          {permit.status === 'completed' &&
            (currentUserRole === 'permit_issuer' ||
              currentUserRole === 'admin') && (
              <ClosePermitButton
                permitId={permit.id}
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
              currentUserRole === 'admin' ||
              currentUserRole === 'permit_issuer' ||
              currentUserRole === 'safety_manager' ||
              currentUserRole === 'safety_coordinator') && (
              <CancelPermitButton
                permitId={permit.id}
              />
            )}
        </div>

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
            <SectionHeader title="Workflow Information" />

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

        {/* Work Details */}
        <section className="mt-8 rounded-xl border bg-background">
          <SectionHeader title="Work Details" />

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

          </div>
        </section>

        {/* Planned Work Period */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader title="Planned Work Period" />

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

        {/* Requester */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader title="Requester" />

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

        {/* Safety Requirements */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader title="Safety Requirements" />

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

        {/* JHA / JSA */}
        <JhaSection
          permitId={permit.id}
          canAdd={canAddSafetyDocs}
          canVerify={canVerifySafetyDocs}
          initialJhas={permit.jhas ?? []}
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

        {/* Attachments */}
        <AttachmentsSection
          permitId={permit.id}
          canUpload={
            permit.status !== 'closed' &&
            permit.status !== 'cancelled'
          }
          canDelete={
            currentUserRole === 'admin' ||
            currentUserRole === 'safety_manager' ||
            currentUserRole === 'platform_admin'
          }
          initialAttachments={permit.attachments ?? []}
        />

        {/* Supervisor Assignment - KEEP FOR NOW, WILL BE REMOVED LATER */}
        {currentUserRole === 'admin' &&
          (permit.status === 'submitted' ||
            permit.status === 'pending_approval') && (
            <section className="mt-6 rounded-xl border bg-background">
              <SectionHeader title="Supervisor Assignment" />

              <div className="p-6">
                <AssignSupervisor
                  permitId={permit.id}
                  currentSupervisorId={
                    permit.supervisor_id
                  }
                />
              </div>
            </section>
          )}

        {/* REMOVED: Supervisor Review block - no longer used in new workflow */}
        {/* {permit.status === 'pending_approval' &&
          isAssignedSupervisor && (
            <ReviewPermit
              permitId={permit.id}
            />
          )} */}

        {/* Remarks */}
        {permit.remarks && (
          <section className="mt-6 rounded-xl border bg-background">
            <SectionHeader title="Remarks" />

            <div className="p-6">
              <p className="whitespace-pre-wrap text-sm">
                {permit.remarks}
              </p>
            </div>
          </section>
        )}

        {/* Permit History */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader title="Permit History" />

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

        {/* Record Information */}
        <section className="mt-6 rounded-xl border bg-background">
          <SectionHeader title="Record Information" />

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
}: {
  title: string
}) {
  return (
    <div className="border-b px-6 py-4">
      <h2 className="font-semibold">
        {title}
      </h2>
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
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatAction(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    )
}