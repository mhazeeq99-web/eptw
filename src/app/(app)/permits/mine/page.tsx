import Link from 'next/link'
import {
  Plus,
  FileText,
  SearchX,
  TriangleAlert,
  X,
  Clock,
  MapPin,
  User,
  Wrench,
  Calendar,
  Filter,
  Activity,
  AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PermitFilters } from '@/components/permits/permit-filters'
import {
  StatusBadge,
  getExpiryState,
} from '@/components/permits/status-badge'
import { formatDateTimeMY } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DeleteDraftButton } from '@/components/permits/delete-draft-button'
import { Pagination } from '@/components/ui/pagination'
import { parsePage, DEFAULT_PAGE_SIZE, pageHref } from '@/lib/pagination'

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  planned_start: string | null
  planned_end: string | null
  valid_until: string | null
  requester_id: string | null
  permit_type: {
    name: string
    code: string
  } | null
  area: {
    name: string
    code: string
  } | null
  requester: {
    full_name: string
  } | null
}

type SearchParams = {
  q?: string
  status?: string
  permit_type_id?: string
  area_id?: string
  contractor_id?: string
  requester?: string
  date_from?: string
  date_to?: string
  expiry?: string
  page?: string
}

/**
 * /permits/mine — the same list UI as /permits (same header, KPI cards, filter
 * panel, table, states and pagination), scoped to the permits this user raised.
 * Kept structurally identical on purpose so the two pages behave the same way;
 * the only differences are the title/description and the requester scope.
 */
export default async function MyPermitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, company_id')
    .eq('id', user.id)
    .single()

  const page = parsePage(params.page)
  const pageSize = DEFAULT_PAGE_SIZE

  const PERMIT_SELECT = `
    id,
    permit_no,
    work_title,
    status,
    planned_start,
    planned_end,
    valid_until,
    requester_id,

    permit_type:permit_types!permits_permit_type_id_fkey (
      name,
      code
    ),

    area:areas!permits_area_id_fkey (
      name,
      code
    ),

    requester:profiles!permits_requester_id_fkey (
      full_name
    )
  `

  // Same filter builder shape as /permits: one WHERE clause shared by the
  // COUNT query and the page slice. `expiry` is a derived state (getExpiryState)
  // applied after slicing, exactly as on /permits.
  const buildQuery = (
    select: string,
    opts?: { count?: 'exact'; head?: boolean }
  ) => {
    let query = supabase
      .from('permits')
      .select(select, opts)
      .eq('requester_id', user.id)

    const filters: string[] = []

    if (params.q) {
      filters.push(
        `permit_no.ilike.%${escapeLike(params.q)}%,work_title.ilike.%${escapeLike(params.q)}%`
      )
    }

    if (params.status) {
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
      query = query.gte('planned_start', `${params.date_from}T00:00:00`)
    }

    if (params.date_to) {
      query = query.lte('planned_start', `${params.date_to}T23:59:59`)
    }

    if (filters.length > 0) {
      query = query.or(filters.join(','))
    }

    return query
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const [{ data, error }, { count }] = await Promise.all([
    buildQuery(PERMIT_SELECT)
      .order('created_at', { ascending: false })
      .range(from, to),
    buildQuery('id', { count: 'exact', head: true }),
  ])

  if (error) {
    console.error('Failed to load my permits:', error)
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const permits = (data ?? []) as unknown as Permit[]

  let filteredPermits = permits
  if (params.expiry === 'expiring_soon' || params.expiry === 'expired') {
    filteredPermits = permits.filter((permit) => {
      const state = getExpiryState(
        permit.status,
        permit.valid_until,
        permit.planned_end
      )
      return state === params.expiry
    })
  }

  const hasActiveFilters = Boolean(
    params.q ||
      params.status ||
      params.permit_type_id ||
      params.area_id ||
      params.contractor_id ||
      params.requester ||
      params.date_from ||
      params.date_to ||
      params.expiry
  )

  const stats = {
    total,
    active: filteredPermits.filter((permit) => permit.status === 'active')
      .length,
    pending: filteredPermits.filter(
      (permit) => permit.status === 'pending_approval'
    ).length,
    expiringSoon: filteredPermits.filter((permit) => {
      const state = getExpiryState(
        permit.status,
        permit.valid_until,
        permit.planned_end
      )
      return state === 'expiring_soon'
    }).length,
  }

  const companyScope = profile?.company_id
    ? { company_id: profile.company_id }
    : {}

  const [permitTypesResult, areasResult, contractorsResult] =
    await Promise.all([
      supabase
        .from('permit_types')
        .select('id, name')
        .match({ ...companyScope, is_active: true })
        .order('name'),
      supabase
        .from('areas')
        .select('id, name')
        .match({ ...companyScope, is_active: true })
        .order('name'),
      supabase
        .from('contractors')
        .select('id, company_name')
        .order('company_name'),
    ])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
              <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                My Permits
              </h1>
              <p className="mt-1 text-muted-foreground">
                Permits submitted by you
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/permits/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-blue-700/30"
        >
          <Plus className="h-4 w-4" />
          Create Permit
        </Link>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Total Permits"
          value={stats.total}
          color="blue"
        />
        <StatCard
          icon={Activity}
          label="Active"
          value={stats.active}
          color="green"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={stats.pending}
          color="yellow"
        />
        <StatCard
          icon={AlertCircle}
          label="Expiring Soon"
          value={stats.expiringSoon}
          color="orange"
        />
      </div>

      {/* Filters */}
      <PermitFilters
        options={{
          permitTypes: permitTypesResult.data ?? [],
          areas: areasResult.data ?? [],
          contractors: contractorsResult.data ?? [],
        }}
      />

      {/* Permit count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">
          {filteredPermits.length} permit
          {filteredPermits.length === 1 ? '' : 's'}
        </Badge>
        {hasActiveFilters && (
          <span className="inline-flex items-center gap-1">
            <Filter className="h-3 w-3" />
            Filtered
          </span>
        )}
      </div>

      {/* Table */}
      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/50">
              <TriangleAlert className="h-12 w-12 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Couldn&apos;t Load Permits
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Something went wrong while loading your permits. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : filteredPermits.length === 0 ? (
        hasActiveFilters ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <SearchX className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Permits Match Your Filters
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Try adjusting or clearing the filters above to see more permits.
              </p>
              <Link
                href="/permits/mine"
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Permits Yet
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Create your first permit-to-work application to get started.
              </p>
              <Link
                href="/permits/new"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Create Your First Permit
              </Link>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle>Permit List</CardTitle>
            <CardDescription>
              View and manage the permits you have raised
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">
                        Permit
                      </th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">
                        Work
                      </th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">
                        Type
                      </th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">
                        Area
                      </th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">
                        Requester
                      </th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPermits.map((permit) => (
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
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            #{permit.id}
                          </p>
                        </td>

                        <td className="px-6 py-4">
                          <div className="max-w-[200px]">
                            <p className="truncate font-medium text-gray-900 dark:text-white">
                              {permit.work_title}
                            </p>
                            {permit.planned_start && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <Calendar className="h-3 w-3" />
                                {formatDateTimeMY(permit.planned_start)}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <Badge variant="secondary">
                            <Wrench className="mr-1 h-3 w-3" />
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
                          <StatusBadge
                            status={permit.status}
                            expiry={getExpiryState(
                              permit.status,
                              permit.valid_until,
                              permit.planned_end
                            )}
                          />
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
                            {permit.status === 'draft' &&
                              permit.requester_id === user.id && (
                                <DeleteDraftButton
                                  permitId={permit.id}
                                  permitNo={permit.permit_no}
                                />
                              )}
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
              buildHref={(p) => pageHref('/permits/mine', params, p)}
              totalItems={total}
              pageSize={pageSize}
            />
          </CardContent>
        </Card>
      )}

      {/* Help Note */}
      {filteredPermits.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Tip
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Click on any permit to view detailed information, including safety
              verifications, approvals, and attachments.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any
  label: string
  value: number
  color: 'blue' | 'green' | 'yellow' | 'orange'
}) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400',
    green:
      'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400',
    yellow:
      'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400',
    orange:
      'bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400',
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
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}