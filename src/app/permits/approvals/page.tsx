import Link from 'next/link'
import { CheckCircle, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { resolvePermitScope } from '@/lib/permit-scope'
import { formatDateTimeMY } from '@/lib/dates'
import { ReadinessBadge } from './readiness-badge'

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  planned_start: string | null
  permit_type: {
    name: string
    code: string
  } | null
  area: {
    name: string
    code: string
  } | null
  contractor: {
    company_name: string
  } | null
  worker_name: string | null
  worker_id: string | null
  staff_reference_name: string | null
  requester: {
    full_name: string
    department: string | null
  } | null
}

export default async function ApprovalQueuePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const scope = await resolvePermitScope(supabase, user)

  if (!scope) return null

  let query = supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      work_title,
      status,
      planned_start,

      permit_type:permit_types!permits_permit_type_id_fkey (
        name,
        code
      ),

      area:areas!permits_area_id_fkey (
        name,
        code
      ),

      contractor:contractors!permits_contractor_id_fkey (
        company_name
      ),

      worker_name,
      worker_id,
      staff_reference_name,

      requester:profiles!permits_requester_id_fkey (
        full_name,
        department
      )
    `)
    .eq('status', 'pending_approval')
    .eq('workflow_stage', 'safety_approval')

  if (!scope.isPlatformAdmin) {
    if (scope.companyId !== null) {
      query = query.eq('company_id', scope.companyId)
    } else if (scope.contractorId !== null) {
      query = query.eq('contractor_id', scope.contractorId)
    }
  }

  const { data: permits, error } = await query.order('created_at', {
    ascending: false,
  })

  if (error) {
    console.error(
      'Failed to load approval queue:',
      error
    )
  }

  const approvalPermits =
    (permits ?? []) as unknown as Permit[]

  return (
    <DashboardShell>
      <div className="space-y-6">

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Approval Queue
          </h1>

          <p className="mt-2 text-muted-foreground">
            Permits awaiting safety approval.
            {scope.profile.role === 'safety_coordinator' ||
            scope.profile.role === 'safety_manager' ? (
              <span className="mt-1 block">
                You can approve or reject these permits from their
                detail page.
              </span>
            ) : null}
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-background">

          {approvalPermits.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">

              <CheckCircle className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">
                No pending approvals
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                There are currently no permits waiting for safety
                approval.
              </p>

            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead className="border-b bg-muted/40">
                  <tr>

                    <th className="px-6 py-3 text-left font-medium">
                      Permit
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Work
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Requester
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Type
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Area
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Readiness
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Action
                    </th>

                  </tr>
                </thead>

                <tbody className="divide-y">

                  {approvalPermits.map((permit) => (
                    <tr
                      key={permit.id}
                      className="hover:bg-muted/40"
                    >

                      <td className="px-6 py-4">
                        <Link
                          href={`/permits/${permit.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {permit.permit_no}
                        </Link>

                        <p className="mt-1 text-xs text-muted-foreground">
                          Planned:{' '}
                          {formatDateTimeMY(permit.planned_start)}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-medium">
                          {permit.work_title}
                        </p>

                        {permit.area?.name && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {permit.area.name}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <p>
                          {permit.requester?.full_name ?? '—'}
                        </p>

                        {permit.requester?.department && (
                          <p className="text-xs text-muted-foreground">
                            {permit.requester.department}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {permit.permit_type?.name ?? '—'}
                      </td>

                      <td className="px-6 py-4">
                        {permit.area?.name ?? '—'}
                      </td>

                      <td className="px-6 py-4">
                        <ReadinessBadge permitId={permit.id} />
                      </td>

                      <td className="px-6 py-4">
                        <div className="space-y-3">
                          {permit.contractor ? (
                            <div className="space-y-1">
                              <span className="inline-flex rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                Contractor PTW
                              </span>

                              <p className="text-xs font-medium">
                                {permit.contractor.company_name}
                              </p>

                              {permit.worker_name && (
                                <p className="text-xs text-muted-foreground">
                                  Worker:{' '}
                                  {permit.worker_name}
                                  {permit.worker_id
                                    ? ` (${permit.worker_id})`
                                    : ''}
                                </p>
                              )}

                              {permit.staff_reference_name && (
                                <p className="text-xs text-muted-foreground">
                                  Staff Ref:{' '}
                                  {permit.staff_reference_name}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              Internal PTW
                            </span>
                          )}

                          <Link
                            href={`/permits/${permit.id}`}
                            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            <FileText className="h-4 w-4" />
                            Review
                          </Link>
                        </div>
                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>

            </div>
          )}

        </div>
      </div>
    </DashboardShell>
  )
}
