import Link from 'next/link'
import { notFound } from 'next/navigation'
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
  remarks: string | null
  created_at: string
  permit_type: PermitType | null
  area: Area | null
  equipment: Equipment | null
  contractor: Contractor | null
  requester: Requester | null
  approvals: PermitApproval[]
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

      approvals:permit_approvals (
        id,
        action,
        remarks,
        created_at,
        performer:profiles!permit_approvals_performed_by_fkey (
          full_name,
          role
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

          {permit.status === 'draft' && (
            <div className="flex gap-2">
              <Link
                href={`/permits/${permit.id}/edit`}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Edit Permit
              </Link>

              <SubmitPermitButton
                permitId={permit.id}
              />
            </div>
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

          {permit.status === 'approved' &&
            (currentUserRole === 'permit_issuer' ||
              currentUserRole === 'admin') && (
              <IssuePermitButton
                permitId={permit.id}
              />
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
        </div>

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

          <div className="grid gap-4 p-6 sm:grid-cols-3">

            <Requirement
              label="JSA / JHA"
              required={
                permit.permit_type?.requires_jha ?? false
              }
            />

            <Requirement
              label="Gas Testing"
              required={
                permit.permit_type?.requires_gas_test ?? false
              }
            />

            <Requirement
              label="LOTO"
              required={
                permit.permit_type?.requires_loto ?? false
              }
            />

          </div>
        </section>

        {/* Supervisor Review */}
        {permit.status === 'pending_approval' &&
          isAssignedSupervisor && (
            <ReviewPermit
              permitId={permit.id}
            />
          )}

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
}: {
  label: string
  required: boolean
}) {
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