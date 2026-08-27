import Link from 'next/link'
import { History as HistoryIcon, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePermitScope } from '@/lib/permit-scope'
import { getCompanyPlan } from '@/lib/entitlements'
import { QuickFilters } from '@/components/permits/quick-filters'
import { StatusBadge, formatDate } from '@/components/permits/status-badge'

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  updated_at: string | null
  permit_type: { name: string } | null
  area: { name: string } | null
  requester: { full_name: string } | null
}

const HISTORY_STATUSES = [
  'completed',
  'closed',
  'rejected',
  'cancelled',
]

type SearchParams = {
  q?: string
  status?: string
  permit_type_id?: string
  area_id?: string
  contractor_id?: string
  requester?: string
  date_from?: string
  date_to?: string
}

export default async function PermitHistoryPage({
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

  // Permit history retention (product access rule — never deletes records).
  // Permit history older than the plan's retention window is hidden from the
  // normal history access. Free = 2 years, Pro = 10 years. Contractor and
  // platform users fall back to the longest retention (10 years) since they
  // are not tied to a single customer plan.
  let historyCutoff: string | null = null
  if (scope.companyId !== null) {
    const plan = await getCompanyPlan(
      createAdminClient(),
      scope.companyId
    )
    historyCutoff = await resolveHistoryCutoff(plan.max_history_years)
  }

  let query = supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      work_title,
      status,
      updated_at,

      permit_type:permit_types!permits_permit_type_id_fkey (
        name
      ),

      area:areas!permits_area_id_fkey (
        name
      ),

      requester:profiles!permits_requester_id_fkey (
        full_name
      )
    `)
    .in('status', HISTORY_STATUSES)

  if (historyCutoff) {
    query = query.gte('updated_at', historyCutoff)
  }

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

  if (params.status && HISTORY_STATUSES.includes(params.status)) {
    query = query.eq('status', params.status)
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

  if (params.requester) {
    query = query.filter(
      'requester.full_name',
      'ilike',
      `%${escapeLike(params.requester)}%`
    )
  }

  if (params.date_from) {
    query = query.gte('updated_at', `${params.date_from}T00:00:00`)
  }

  if (params.date_to) {
    query = query.lte('updated_at', `${params.date_to}T23:59:59`)
  }

  query = query.order('updated_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('Failed to load permit history:', error)
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
            Permit History
          </h1>

          <p className="mt-2 text-muted-foreground">
            Completed, closed, rejected and cancelled permits.
          </p>
        </div>

        <QuickFilters
          basePath="/permits/history"
          statuses={HISTORY_STATUSES}
          options={{
            permitTypes: permitTypesResult.data ?? [],
            areas: areasResult.data ?? [],
            contractors: contractorsResult.data ?? [],
          }}
        />

        <div className="overflow-hidden rounded-xl border bg-background">
          {permits.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <HistoryIcon className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">
                No permit history
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                No historical permits match the current filters.
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
                    <th className="px-4 py-3 text-left font-medium">Requester</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Last Updated</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {permits.map((permit) => (
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
                        {permit.requester?.full_name ?? '—'}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={permit.status} />
                      </td>

                      <td className="px-4 py-3">
                        {formatDate(permit.updated_at)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/permits/${permit.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View
                        </Link>
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

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}

/**
 * Resolves the permit-history retention cutoff (an ISO timestamp) from the
 * plan's max_history_years. A null/zero years means no cutoff (unlimited).
 * This is a product access/visibility rule — records are never deleted.
 * Kept as a separate async helper so the server component body stays pure.
 */
async function resolveHistoryCutoff(
  years: number | null
): Promise<string | null> {
  if (years == null || years <= 0) return null
  const now = new Date()
  const cutoff = new Date(
    now.getTime() - years * 365.25 * 24 * 60 * 60 * 1000
  )
  return cutoff.toISOString()
}
