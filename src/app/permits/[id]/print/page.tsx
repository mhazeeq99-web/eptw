import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PrintPermitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm">Please sign in to view this permit.</p>
      </main>
    )
  }

  const { data, error } = await supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      company_id,
      work_title,
      work_description,
      work_location,
      planned_start,
      planned_end,
      status,
      workflow_stage,
      submitted_by,
      submitted_at,
      approved_by,
      approved_at,
      actual_start,
      completed_by,
      completed_at,
      closed_by,
      closed_at,
      cancelled_by,
      cancelled_at,
      remarks,
      created_at,

      company:companies!permits_company_id_fkey (
        id,
        name,
        code
      ),

      permit_type:permit_types!permits_permit_type_id_fkey (
        id,
        name,
        code
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

      approved_by_profile:profiles!permits_approved_by_fkey (
        full_name
      ),

      safety_controls:permit_safety_controls (
        id,
        is_required,
        status,
        safety_control:safety_controls (
          code,
          name
        )
      ),

      jhas:jhas (
        id,
        title,
        status,
        verified_at
      ),

      loto_points:loto_isolation_points (
        id,
        description,
        tag_number,
        status,
        verified_at
      ),

      gas_tests:gas_tests (
        id,
        tested_at,
        o2,
        lel,
        h2s,
        co,
        status,
        verified_at
      ),

      approvals:permit_approvals (
        id,
        action,
        remarks,
        created_at,
        performer:profiles!permit_approvals_performed_by_fkey (
          full_name
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('Failed to load permit for print:', error)
    notFound()
  }

  const permit = data as unknown as PrintPermit

  const qrContent =
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/permits/${permit.id}`

  const qrDataUrl = await QRCode.toDataURL(qrContent, {
    width: 160,
    margin: 1,
    errorCorrectionLevel: 'M',
  })

  return (
    <main className="min-h-screen bg-white p-8 text-black print:p-0">
      <div className="mx-auto max-w-4xl">
        {/* Toolbar (hidden when printing) */}
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link
            href={`/permits/${permit.id}`}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            ← Back to Permit
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Print / Save as PDF
          </button>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-6">
          <div>
            <h1 className="text-2xl font-bold uppercase">
              Permit to Work
            </h1>
            <p className="mt-1 text-sm">
              {permit.company?.name ?? '—'}
              {permit.company?.code
                ? ` (${permit.company.code})`
                : ''}
            </p>
          </div>

          <div className="text-right">
            <p className="text-lg font-bold">
              {permit.permit_no}
            </p>
            <p className="mt-1 text-sm">
              {permit.permit_type?.name ?? 'Permit'}
            </p>
            <p className="mt-1 inline-block rounded border border-black px-2 py-0.5 text-xs font-semibold uppercase">
              {permit.status.replaceAll('_', ' ')}
            </p>
            {permit.workflow_stage && (
              <p className="mt-1 text-xs">
                Stage: {permit.workflow_stage.replaceAll('_', ' ')}
              </p>
            )}
          </div>
        </div>

        {/* Work details */}
        <Section title="Work Details">
          <Grid>
            <Item label="Work Title" value={permit.work_title} />
            <Item label="Work Location" value={permit.work_location} />
            <Item label="Area" value={permit.area?.name} />
            <Item
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
            <Item label="Contractor" value={permit.contractor?.company_name} />
            <Item label="Requester" value={permit.requester?.full_name} />
            <Item label="Department" value={permit.requester?.department} />
            <Item label="Planned Start" value={formatDate(permit.planned_start)} />
            <Item label="Planned End" value={formatDate(permit.planned_end)} />
          </Grid>

          {permit.work_description && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-gray-600">
                Description
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {permit.work_description}
              </p>
            </div>
          )}
        </Section>

        {/* Safety controls */}
        <Section title="Safety Controls">
          {permit.safety_controls?.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Control
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Required
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {permit.safety_controls.map((control) => (
                  <tr key={control.id}>
                    <td className="border border-black px-3 py-1.5">
                      {control.safety_control?.name ?? 'Control'}
                    </td>
                    <td className="border border-black px-3 py-1.5">
                      {control.is_required ? 'Yes' : 'No'}
                    </td>
                    <td className="border border-black px-3 py-1.5 uppercase">
                      {control.status.replaceAll('_', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm">No safety controls configured.</p>
          )}
        </Section>

        {/* JHA / LOTO / Gas */}
        <Section title="JHA / LOTO / Gas Testing">
          <Grid>
            <Item
              label="JHA / JSA"
              value={
                permit.jhas?.length
                  ? permit.jhas
                      .map((jha) => `${jha.title} (${jha.status})`)
                      .join(', ')
                  : 'Not recorded'
              }
            />
            <Item
              label="LOTO Isolation Points"
              value={
                permit.loto_points?.length
                  ? permit.loto_points
                      .map(
                        (point) =>
                          `${point.description}${point.tag_number ? ` [${point.tag_number}]` : ''} (${point.status})`
                      )
                      .join('; ')
                  : 'Not recorded'
              }
            />
          </Grid>

          {permit.gas_tests?.length ? (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Tested At
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    O₂ %
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    LEL %
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    H₂S ppm
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    CO ppm
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {permit.gas_tests.map((test) => (
                  <tr key={test.id}>
                    <td className="border border-black px-3 py-1.5">
                      {formatDate(test.tested_at)}
                    </td>
                    <td className="border border-black px-3 py-1.5">
                      {test.o2 ?? '—'}
                    </td>
                    <td className="border border-black px-3 py-1.5">
                      {test.lel ?? '—'}
                    </td>
                    <td className="border border-black px-3 py-1.5">
                      {test.h2s ?? '—'}
                    </td>
                    <td className="border border-black px-3 py-1.5">
                      {test.co ?? '—'}
                    </td>
                    <td className="border border-black px-3 py-1.5 uppercase">
                      {test.status.replaceAll('_', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm">No gas tests recorded.</p>
          )}
        </Section>

        {/* Approval */}
        <Section title="Approval &amp; Sign-off">
          <Grid>
            <Item label="Status" value={permit.status.toUpperCase()} />
            <Item
              label="Approved By"
              value={permit.approved_by_profile?.full_name}
            />
            <Item label="Approved At" value={formatDate(permit.approved_at)} />
            <Item label="Work Started" value={formatDate(permit.actual_start)} />
            <Item label="Completed By" value={permit.completed_by} />
            <Item label="Completed At" value={formatDate(permit.completed_at)} />
            <Item label="Closed By" value={permit.closed_by} />
            <Item label="Closed At" value={formatDate(permit.closed_at)} />
          </Grid>

          {permit.remarks && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-gray-600">
                Remarks
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {permit.remarks}
              </p>
            </div>
          )}
        </Section>

        {/* History */}
        <Section title="Permit History">
          {permit.approvals?.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Action
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Performed By
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Remarks
                  </th>
                  <th className="border border-black px-3 py-1.5 text-left text-xs font-semibold uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...permit.approvals]
                  .sort(
                    (a, b) =>
                      new Date(a.created_at).getTime() -
                      new Date(b.created_at).getTime()
                  )
                  .map((approval) => (
                    <tr key={approval.id}>
                      <td className="border border-black px-3 py-1.5 uppercase">
                        {approval.action.replaceAll('_', ' ')}
                      </td>
                      <td className="border border-black px-3 py-1.5">
                        {approval.performer?.full_name ?? '—'}
                      </td>
                      <td className="border border-black px-3 py-1.5">
                        {approval.remarks ?? '—'}
                      </td>
                      <td className="border border-black px-3 py-1.5">
                        {formatDate(approval.created_at)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm">No history recorded.</p>
          )}
        </Section>

        {/* Footer with QR */}
        <div className="mt-8 flex items-end justify-between border-t-2 border-black pt-6">
          <div className="text-xs text-gray-600">
            <p>
              Generated on{' '}
              {new Intl.DateTimeFormat('en-MY', {
                dateStyle: 'long',
                timeStyle: 'short',
              }).format(new Date())}
            </p>
            <p className="mt-1">
              ePTW — Electronic Permit to Work
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right text-xs text-gray-600">
              <p>Scan to view permit</p>
              <p className="mt-1 font-mono">{permit.permit_no}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt={`QR code for ${permit.permit_no}`}
              width={120}
              height={120}
              className="h-[120px] w-[120px]"
            />
          </div>
        </div>
      </div>
    </main>
  )
}

/* ---------------------------------------------------------------
   Types & helpers
   --------------------------------------------------------------- */

type PrintPermit = {
  id: number
  permit_no: string
  company_id: number
  work_title: string
  work_description: string | null
  work_location: string | null
  planned_start: string | null
  planned_end: string | null
  status: string
  workflow_stage: string | null
  submitted_by: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  actual_start: string | null
  completed_by: string | null
  completed_at: string | null
  closed_by: string | null
  closed_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  remarks: string | null
  created_at: string
  company: {
    id: number
    name: string
    code: string
  } | null
  permit_type: {
    id: number
    name: string
    code: string
  } | null
  area: {
    id: number
    name: string
    code: string
  } | null
  equipment: {
    id: number
    name: string
    equipment_no: string | null
  } | null
  contractor: {
    id: number
    company_name: string
  } | null
  requester: {
    id: string
    full_name: string
    employee_no: string | null
    department: string | null
    position: string | null
  } | null
  approved_by_profile: {
    full_name: string
  } | null
  safety_controls: Array<{
    id: number
    is_required: boolean
    status: string
    safety_control: {
      code: string
      name: string
    } | null
  }>
  jhas: Array<{
    id: number
    title: string
    status: string
    verified_at: string | null
  }>
  loto_points: Array<{
    id: number
    description: string
    tag_number: string | null
    status: string
    verified_at: string | null
  }>
  gas_tests: Array<{
    id: number
    tested_at: string
    o2: number | null
    lel: number | null
    h2s: number | null
    co: number | null
    status: string
    verified_at: string | null
  }>
  approvals: Array<{
    id: number
    action: string
    remarks: string | null
    created_at: string
    performer: {
      full_name: string
    } | null
  }>
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-6">
      <h2 className="border-b border-black pb-1 text-sm font-bold uppercase tracking-wide">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {children}
    </div>
  )
}

function Item({
  label,
  value,
}: {
  label: string
  value?: string | null
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-gray-600">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium">
        {value || '—'}
      </p>
    </div>
  )
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
