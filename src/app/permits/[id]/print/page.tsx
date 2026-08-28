import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { PrintPermitButton } from '@/components/permits/print-permit-button'
import { 
  Printer, 
  ArrowLeft, 
  Building2, 
  MapPin, 
  User, 
  Users, 
  Shield, 
  FileText, 
  HardHat, 
  Wrench,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  Loader2
} from 'lucide-react'

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
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6 dark:bg-gray-900">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Please sign in to view this permit
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
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
      work_method,
      planned_start,
      planned_end,
      valid_from,
      valid_until,
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
      staff_reference_name,
      special_details,
      remarks,
      created_at,

      workers:permit_workers (
        id,
        full_name,
        id_number,
        nationality,
        is_contractor,
        induction_completed
      ),

      permit_ppe (
        is_selected,
        verified,
        ppe_item:ppe_items (
          category,
          name
        )
      ),

      cse_personnel:permit_cse_personnel (
        worker_id,
        responsibility,
        worker:permit_workers!permit_cse_personnel_worker_id_fkey (
          full_name
        )
      ),

      site_verification:permit_site_verifications (
        status,
        verified_by,
        verified_at
      ),

      worker_briefing:permit_worker_briefings (
        status,
        briefed_by,
        briefed_at
      ),

      emergency_arrangements:permit_emergency_arrangements (
        status,
        emergency_contact,
        muster_point,
        emergency_procedure,
        first_aid_available,
        fire_response_available,
        rescue_required,
        rescue_available
      ),

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
    <main className="min-h-screen bg-gray-100 p-4 print:bg-white print:p-0 sm:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Toolbar (hidden when printing) */}
        <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm print:hidden dark:border-gray-700 dark:bg-gray-800">
          <Link
            href={`/permits/${permit.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Permit
          </Link>

          <div className="flex items-center gap-2">
            <PrintPermitButton />
          </div>
        </div>

        {/* Permit Document */}
        <div className="overflow-hidden rounded-lg bg-white shadow-lg print:rounded-none print:shadow-none dark:bg-gray-900">
          {/* Header */}
          <div className="border-b-4 border-blue-600 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 sm:p-8 dark:from-gray-800 dark:to-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-600 p-2">
                    <FileText className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold uppercase tracking-tight text-gray-900 dark:text-white">
                      Permit to Work
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {permit.company?.name ?? '—'}
                      {permit.company?.code
                        ? ` (${permit.company.code})`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {permit.permit_no}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {permit.permit_type?.name ?? 'Permit'}
                </p>
                <p className="mt-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  {permit.status.replaceAll('_', ' ')}
                </p>
                {permit.workflow_stage && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Stage: {permit.workflow_stage.replaceAll('_', ' ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {/* Work details */}
            <Section title="Work Details" icon={FileText}>
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
                {permit.staff_reference_name && (
                  <Item
                    label="Customer Staff Reference"
                    value={permit.staff_reference_name}
                  />
                )}
                <Item label="Planned Start" value={formatDate(permit.planned_start)} />
                <Item label="Planned End" value={formatDate(permit.planned_end)} />
                <Item label="Valid From" value={formatDate(permit.valid_from)} />
                <Item label="Valid Until" value={formatDate(permit.valid_until)} />
              </Grid>

              {permit.work_method && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Work Method / Sequence
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                    {permit.work_method}
                  </p>
                </div>
              )}

              {permit.work_description && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Description
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                    {permit.work_description}
                  </p>
                </div>
              )}
            </Section>

            {/* Workers */}
            <Section title="Workers / Authorised Personnel" icon={Users}>
              {permit.workers && permit.workers.length > 0 ? (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Name
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        {permit.workers.some((w) => w.is_contractor)
                          ? 'NRIC / Passport'
                          : 'Employee ID'}
                      </th>
                      {permit.workers.some((w) => w.is_contractor) && (
                        <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                          Nationality
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {permit.workers.map((worker) => (
                      <tr key={worker.id}>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {worker.full_name}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {worker.id_number ?? '—'}
                        </td>
                        {worker.is_contractor && (
                          <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                            {worker.nationality ?? '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No workers listed.</p>
              )}
            </Section>

            {/* PPE */}
            <Section title="PPE Requirements" icon={HardHat}>
              {permit.permit_ppe?.some((p) => p.is_selected) ? (
                <div className="flex flex-wrap gap-2">
                  {permit.permit_ppe
                    .filter((p) => p.is_selected && p.ppe_item)
                    .map((p) => (
                      <span
                        key={p.ppe_item?.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300"
                      >
                        {p.ppe_item?.name}
                        {p.verified && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        )}
                      </span>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No PPE selected.</p>
              )}
            </Section>

            {/* CSE Personnel */}
            {permit.permit_type?.code === 'CSE' &&
              permit.cse_personnel?.length ? (
              <Section title="Confined Space Personnel" icon={Users}>
                <Grid>
                  {permit.cse_personnel
                    .filter((p) => p.responsibility === 'entry_supervisor')
                    .map((p) => (
                      <Item
                        key={`sup-${p.worker_id}`}
                        label="Entry Supervisor"
                        value={p.worker?.full_name}
                      />
                    ))}
                  {permit.cse_personnel
                    .filter((p) => p.responsibility === 'standby_attendant')
                    .map((p) => (
                      <Item
                        key={`std-${p.worker_id}`}
                        label="Standby / Attendant"
                        value={p.worker?.full_name}
                      />
                    ))}
                  {permit.cse_personnel
                    .filter((p) => p.responsibility === 'authorised_entrant')
                    .length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                        Authorised Entrants
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {permit.cse_personnel
                          .filter((p) => p.responsibility === 'authorised_entrant')
                          .map((p) => p.worker?.full_name ?? '')
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  )}
                </Grid>
              </Section>
            ) : null}

            {/* Safety Controls */}
            <Section title="Safety Controls" icon={Shield}>
              {permit.safety_controls?.length ? (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Control
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Required
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {permit.safety_controls.map((control) => (
                      <tr key={control.id}>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {control.safety_control?.name ?? 'Control'}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {control.is_required ? 'Yes' : 'No'}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 uppercase text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {control.status.replaceAll('_', ' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No safety controls configured.</p>
              )}
            </Section>

            {/* JHA / LOTO / Gas */}
            <Section title="JHA / LOTO / Gas Testing" icon={Wrench}>
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
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Tested At
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        O₂ %
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        LEL %
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        H₂S ppm
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        CO ppm
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {permit.gas_tests.map((test) => (
                      <tr key={test.id}>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {formatDate(test.tested_at)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {test.o2 ?? '—'}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {test.lel ?? '—'}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {test.h2s ?? '—'}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {test.co ?? '—'}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 uppercase text-gray-900 dark:border-gray-600 dark:text-gray-100">
                          {test.status.replaceAll('_', ' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">No gas tests recorded.</p>
              )}
            </Section>

            {/* Site verification */}
            <Section title="Site Verification & Readiness" icon={CheckCircle2}>
              <Grid>
                <Item
                  label="Site Verification"
                  value={
                    permit.site_verification
                      ? permit.site_verification.status.replaceAll('_', ' ')
                      : 'Not recorded'
                  }
                />
                <Item
                  label="Worker Briefing"
                  value={
                    permit.worker_briefing
                      ? permit.worker_briefing.status.replaceAll('_', ' ')
                      : 'Not recorded'
                  }
                />
                <Item
                  label="Emergency Arrangements"
                  value={
                    permit.emergency_arrangements
                      ? permit.emergency_arrangements.status.replaceAll('_', ' ')
                      : 'Not recorded'
                  }
                />
                {permit.emergency_arrangements && (
                  <>
                    <Item
                      label="Emergency Contact"
                      value={permit.emergency_arrangements.emergency_contact}
                    />
                    <Item
                      label="Muster Point"
                      value={permit.emergency_arrangements.muster_point}
                    />
                    <Item
                      label="First Aid Available"
                      value={
                        permit.emergency_arrangements.first_aid_available
                          ? 'Yes'
                          : 'No'
                      }
                    />
                    <Item
                      label="Fire Response Available"
                      value={
                        permit.emergency_arrangements.fire_response_available
                          ? 'Yes'
                          : 'No'
                      }
                    />
                    <Item
                      label="Rescue"
                      value={
                        permit.emergency_arrangements.rescue_required
                          ? permit.emergency_arrangements.rescue_available
                            ? 'Required - Available'
                            : 'Required - NOT available'
                          : 'Not required'
                      }
                    />
                  </>
                )}
              </Grid>
            </Section>

            {/* Approval */}
            <Section title="Approval & Sign-off" icon={CheckCircle2}>
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
                  <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Remarks
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                    {permit.remarks}
                  </p>
                </div>
              )}
            </Section>

            {/* History */}
            <Section title="Permit History" icon={Clock}>
              {permit.approvals?.length ? (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Action
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Performed By
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
                        Remarks
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 dark:border-gray-600 dark:text-gray-300">
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
                          <td className="border border-gray-300 px-3 py-2 uppercase text-gray-900 dark:border-gray-600 dark:text-gray-100">
                            {approval.action.replaceAll('_', ' ')}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                            {approval.performer?.full_name ?? '—'}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                            {approval.remarks ?? '—'}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                            {formatDate(approval.created_at)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No history recorded.</p>
              )}
            </Section>

            {/* Footer with QR */}
            <div className="mt-8 flex flex-col items-end justify-between gap-6 border-t-2 border-blue-600 pt-6 sm:flex-row sm:items-end">
              <div className="text-xs text-gray-500 dark:text-gray-400">
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
                <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                  <p>Scan to view permit</p>
                  <p className="mt-1 font-mono">{permit.permit_no}</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${permit.permit_no}`}
                  width={120}
                  height={120}
                  className="h-[120px] w-[120px] rounded-lg border border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>
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
  work_method: string | null
  planned_start: string | null
  planned_end: string | null
  valid_from: string | null
  valid_until: string | null
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
  staff_reference_name: string | null
  special_details: Record<string, unknown> | null
  remarks: string | null
  created_at: string
  workers: Array<{
    id: number
    full_name: string
    id_number: string | null
    nationality: string | null
    is_contractor: boolean
    induction_completed: boolean
  }> | null
  permit_ppe: Array<{
    is_selected: boolean
    verified: boolean
    ppe_item: {
      category: string
      name: string
    } | null
  }> | null
  cse_personnel: Array<{
    worker_id: number
    responsibility: string
    worker: {
      full_name: string
    } | null
  }> | null
  site_verification: {
    status: string
    verified_by: string | null
    verified_at: string | null
  } | null
  worker_briefing: {
    status: string
    briefed_by: string | null
    briefed_at: string | null
  } | null
  emergency_arrangements: {
    status: string
    emergency_contact: string | null
    muster_point: string | null
    emergency_procedure: string | null
    first_aid_available: boolean
    fire_response_available: boolean
    rescue_required: boolean
    rescue_available: boolean
  } | null
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
  icon: Icon,
  children,
}: {
  title: string
  icon?: any
  children: React.ReactNode
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="flex items-center gap-2 border-b-2 border-blue-600 pb-2 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-white">
        {Icon && <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
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
      <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
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
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(new Date(value))
}