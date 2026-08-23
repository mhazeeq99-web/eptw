import Link from 'next/link'
import { PauseCircle, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { resolvePermitScope } from '@/lib/permit-scope'
import { QuickFilters } from '@/components/permits/quick-filters'
import { formatDate } from '@/components/permits/status-badge'
import { ResumePermitButton } from '@/components/permits/resume-permit-button'

type Approval = {
  action: string
  remarks: string | null
  created_at: string
  performer: { full_name: string } | null
}

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  suspension_reason: string | null
  permit_type: { name: string } | null
  area: { name: string } | null
  approvals: Approval[]
}

type SearchParams = {
  q?: string
  permit_type_id?: string
  area_id?: string
  contractor_id?: string
}

export default async function SuspendedPermitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const scope = await resolvePermitScope(supabase, user)

  if (!scope) return null

  let query = supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      work_title,
      status,
      suspension_reason,

      permit_type:permit_types!permits_permit_type_id_fkey (
        name
      ),

      area:areas!permits_area_id_fkey (
        name
      ),

      approvals:permit_approvals (
        action,
        remarks,
        created_at,
        performer:profiles!permit_approvals_performed_by_fkey (
          full_name
        )
      )
    `)
    .eq('status', 'suspended')

  if (!scope.isPlatformAdmin) {
    if (scope.companyId !== null) {
      query = query.eq('company_id', scope.companyId)
    } else if (scope.contractorId !== null) {
      query = query.eq('contractor_id', scope.contractorId)
    }
  }

  if (params.q) {
    query = query.or(
      `permit_no.ilike.%${escapeLike(params.q)}%,work_title.ilike.%${escapeLike(params.q)}%`
    )
  }

  if (params.permit_type_id) {
    query = query.eq('permit_type_id', Number(params.permit_type_id))
  }

  if (params.area_id) {
    query = query.eq('area_id', Number(params.area_id))
  }

  if (params.contractor_id) {
    query = query.eq('contractor_id', Number(params.contractor_id))
  }

  query = query.order('updated_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('Failed to load suspended permits:', error)
  }

  const permits = (data ?? []) as unknown as Permit[]

  const companyMatch = scope.companyId
    ? { company_id: scope.companyId, is_active: true }
    : { is_active: true }

  const [permitTypesResult, areasResult, contractorsResult] =
    await Promise.all([
      supabase
        .from('permit_types')
        .select('id, name')
        .match(companyMatch)
        .order('name'),
      supabase
        .from('areas')
        .select('id, name')
        .match(companyMatch)
        .order('name'),
      supabase
        .from('contractors')
        .select('id, company_name')
        .order('company_name'),
    ])

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Suspended Permits
          </h1>

          <p className="mt-2 text-muted-foreground">
            Active permits whose work has been stopped.
          </p>
        </div>

        <QuickFilters
          basePath="/permits/suspended"
          options={{
            permitTypes: permitTypesResult.data ?? [],
            areas: areasResult.data ?? [],
            contractors: contractorsResult.data ?? [],
          }}
        />

        <div className="overflow-hidden rounded-xl border bg-background">
          {permits.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <PauseCircle className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">
                No suspended permits
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                There are currently no suspended permits.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Permit</th>
                    <th className="px-4 py-3 text-left font-medium">Work</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Area</th>
                    <th className="px-4 py-3 text-left font-medium">Suspended By</th>
                    <th className="px-4 py-3 text-left font-medium">Suspended At</th>
                    <th className="px-4 py-3 text-left font-medium">Reason</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {permits.map((permit) => {
                    const suspension = [...(permit.approvals ?? [])]
                      .filter((approval) => approval.action === 'suspended')
                      .sort(
                        (a, b) =>
                          new Date(b.created_at).getTime() -
                          new Date(a.created_at).getTime()
                      )[0]

                    return (
                      <tr key={permit.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <Link
                            href={`/permits/${permit.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {permit.permit_no}
                          </Link>
                        </td>

                        <td className="px-4 py-3 font-medium">
                          {permit.work_title}
                        </td>

                        <td className="px-4 py-3">
                          {permit.permit_type?.name ?? '—'}
                        </td>

                        <td className="px-4 py-3">
                          {permit.area?.name ?? '—'}
                        </td>

                        <td className="px-4 py-3">
                          {suspension?.performer?.full_name ?? '—'}
                        </td>

                        <td className="px-4 py-3">
                          {formatDate(suspension?.created_at)}
                        </td>

                        <td className="max-w-[220px] px-4 py-3">
                          <p className="truncate" title={permit.suspension_reason ?? suspension?.remarks ?? ''}>
                            {permit.suspension_reason ?? suspension?.remarks ?? '—'}
                          </p>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/permits/${permit.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Open
                            </Link>

                            <ResumePermitButton
                              permitId={permit.id}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}
