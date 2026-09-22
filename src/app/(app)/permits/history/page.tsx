import Link from 'next/link'
import { 
  History as HistoryIcon, 
  FileText,
  CheckCircle2,
  XCircle,
  Ban,
  Archive,
  Calendar,
  Clock,
  User,
  MapPin,
  Wrench,
  Search,
  Filter,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Download,
  Info
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePermitScope } from '@/lib/permit-scope'
import { getCompanyPlan } from '@/lib/entitlements'
import { QuickFilters } from '@/components/permits/quick-filters'
import { StatusBadge, formatDate } from '@/components/permits/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pagination } from '@/components/ui/pagination'
import { parsePage, pageHref, DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import type { PostgrestFilterBuilder } from '@supabase/supabase-js'

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
  page?: string
}

export default async function PermitHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const page = parsePage(params.page)
  const pageSize = DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

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

  // Applies the shared history filters (status scope, retention cutoff,
  // access scope, search/filter params) to a permits query. Used by both the
  // head-count query and the page-slice query so totals and rows always agree.
  const applyHistoryFilters = (
    query: PostgrestFilterBuilder<any, any, any, any>
  ): PostgrestFilterBuilder<any, any, any, any> => {
    let q = query.in('status', HISTORY_STATUSES)

    if (historyCutoff) {
      q = q.gte('updated_at', historyCutoff)
    }

    if (!scope.isPlatformAdmin) {
      if (scope.companyId !== null) {
        q = q.eq('company_id', scope.companyId)
      } else if (scope.contractorId !== null) {
        q = q.eq('contractor_id', scope.contractorId)
      }
    }

    if (params.q) {
      q = q.or(
        `permit_no.ilike.%${escapeLike(params.q)}%,work_title.ilike.%${escapeLike(params.q)}%`
      )
    }

    if (params.status && HISTORY_STATUSES.includes(params.status)) {
      q = q.eq('status', params.status)
    }

    if (params.permit_type_id) {
      q = q.eq('permit_type_id', Number(params.permit_type_id))
    }

    if (params.area_id) {
      q = q.eq('area_id', Number(params.area_id))
    }

    if (params.contractor_id) {
      q = q.eq('contractor_id', Number(params.contractor_id))
    }

    if (params.requester) {
      q = q.filter(
        'requester.full_name',
        'ilike',
        `%${escapeLike(params.requester)}%`
      )
    }

    if (params.date_from) {
      q = q.gte('updated_at', `${params.date_from}T00:00:00`)
    }

    if (params.date_to) {
      q = q.lte('updated_at', `${params.date_to}T23:59:59`)
    }

    return q
  }

  // Head-count query (same filters, no row data) for the total.
  const { count, error: countError } = await applyHistoryFilters(
    supabase.from('permits').select('id', { count: 'exact', head: true })
  )

  if (countError) {
    console.error('Failed to count permit history:', countError)
  }

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Page-slice query (same filters, ordered, restricted to the page range).
  const { data, error } = await applyHistoryFilters(
    supabase
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
  )
    .order('updated_at', { ascending: false })
    .range(from, to)

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

  // Statistics — total from the head-count query, per-status counts from the
  // current page slice.
  const stats = {
    total,
    completed: permits.filter(p => p.status === 'completed').length,
    closed: permits.filter(p => p.status === 'closed').length,
    rejected: permits.filter(p => p.status === 'rejected').length,
    cancelled: permits.filter(p => p.status === 'cancelled').length,
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
                <HistoryIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Permit History
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Completed, closed, rejected and cancelled permits
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Archive className="mr-1 h-3 w-3" />
            {stats.total} Records
          </Badge>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={CheckCircle2}
            label="Completed"
            value={stats.completed}
            color="green"
          />
          <StatCard
            icon={Archive}
            label="Closed"
            value={stats.closed}
            color="blue"
          />
          <StatCard
            icon={XCircle}
            label="Rejected"
            value={stats.rejected}
            color="red"
          />
          <StatCard
            icon={Ban}
            label="Cancelled"
            value={stats.cancelled}
            color="orange"
          />
        </div>

        {/* Filters */}
        <QuickFilters
          basePath="/permits/history"
          statuses={HISTORY_STATUSES}
          options={{
            permitTypes: permitTypesResult.data ?? [],
            areas: areasResult.data ?? [],
            contractors: contractorsResult.data ?? [],
          }}
        />

        {/* Permits List */}
        {permits.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <HistoryIcon className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Permit History
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                No historical permits match the current filters.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <CardTitle>Historical Permits</CardTitle>
              <CardDescription>
                Review completed, closed, rejected, and cancelled permits
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Work</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Area</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Requester</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Last Updated</th>
                        <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {permits.map((permit) => (
                        <tr 
                          key={permit.id} 
                          className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="px-6 py-4">
                            <Link
                              href={`/permits/${permit.id}`}
                              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {permit.permit_no}
                            </Link>
                          </td>

                          <td className="px-6 py-4">
                            <div className="max-w-[200px]">
                              <p className="font-medium text-gray-900 dark:text-white truncate">
                                {permit.work_title}
                              </p>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <Badge variant="secondary">
                              {permit.permit_type?.name ?? '—'}
                            </Badge>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <MapPin className="h-3.5 w-3.5" />
                              {permit.area?.name ?? '—'}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <User className="h-3.5 w-3.5" />
                              {permit.requester?.full_name ?? '—'}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <StatusBadge status={permit.status} />
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDate(permit.updated_at)}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/permits/${permit.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                View
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                buildHref={(p) => pageHref('/permits/history', params, p)}
                totalItems={total}
                pageSize={pageSize}
              />
            </CardContent>
          </Card>
        )}

        {/* Retention Info */}
        {historyCutoff && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Permit History Retention
              </p>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                Your plan includes access to permit history from {formatDate(historyCutoff)} onwards. Contact your administrator to upgrade for extended history access.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: 'green' | 'blue' | 'red' | 'orange' }) {
  const colorClasses = {
    green: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400",
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${colorClasses[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
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