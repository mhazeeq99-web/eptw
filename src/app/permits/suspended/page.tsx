import Link from 'next/link'
import { 
  PauseCircle, 
  FileText, 
  AlertTriangle,
  Search,
  Filter,
  Clock,
  User,
  MapPin,
  Building2,
  ChevronRight,
  RotateCcw,
  Info,
  ShieldAlert,
  CalendarClock
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { resolvePermitScope } from '@/lib/permit-scope'
import { QuickFilters } from '@/components/permits/quick-filters'
import { formatDate } from '@/components/permits/status-badge'
import { ResumePermitButton } from '@/components/permits/resume-permit-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Pagination } from '@/components/ui/pagination'
import { DEFAULT_PAGE_SIZE, pageHref, parsePage } from '@/lib/pagination'

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
  page?: string
}

export default async function SuspendedPermitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const page = parsePage(params.page)
  const pageSize = DEFAULT_PAGE_SIZE

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const scope = await resolvePermitScope(supabase, user)

  if (!scope) return null

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // Head-count query: same filters as the page query below.
  let countQuery = supabase
    .from('permits')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'suspended')

  if (!scope.isPlatformAdmin) {
    if (scope.companyId !== null) {
      countQuery = countQuery.eq('company_id', scope.companyId)
    } else if (scope.contractorId !== null) {
      countQuery = countQuery.eq('contractor_id', scope.contractorId)
    }
  }

  if (params.q) {
    countQuery = countQuery.or(
      `permit_no.ilike.%${escapeLike(params.q)}%,work_title.ilike.%${escapeLike(params.q)}%`
    )
  }

  if (params.permit_type_id) {
    countQuery = countQuery.eq('permit_type_id', Number(params.permit_type_id))
  }

  if (params.area_id) {
    countQuery = countQuery.eq('area_id', Number(params.area_id))
  }

  if (params.contractor_id) {
    countQuery = countQuery.eq('contractor_id', Number(params.contractor_id))
  }

  // Page query: same filters, plus ordering and the page slice.
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

  const [countResult, dataResult] = await Promise.all([
    countQuery,
    query.order('updated_at', { ascending: false }).range(from, to),
  ])

  const total = countResult.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const { data, error } = dataResult

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

  // Calculate statistics
  const totalSuspended = total
  // withReason / recentSuspensions are computed from the current page slice.
  const withReason = permits.filter(p => p.suspension_reason).length
  const recentSuspensions = permits.filter(p => {
    const suspension = getLatestSuspension(p)
    if (!suspension) return false
    const suspensionDate = new Date(suspension.created_at)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - suspensionDate.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays <= 7
  }).length

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-yellow-100 p-3 dark:bg-yellow-900/50">
                <PauseCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Suspended Permits
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Active permits whose work has been stopped
                </p>
              </div>
            </div>
          </div>
          
          <Badge variant="warning" className="self-start">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {totalSuspended} Suspended
          </Badge>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-yellow-100 p-2 dark:bg-yellow-900/50">
                  <PauseCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Suspended</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalSuspended}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
                  <ShieldAlert className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">With Reason</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{withReason}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/50">
                  <CalendarClock className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Recent (7 days)</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{recentSuspensions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <QuickFilters
          basePath="/permits/suspended"
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
                <PauseCircle className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Suspended Permits
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                There are currently no suspended permits in the system.
              </p>
              <Link
                href="/permits"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                View All Permits
                <ChevronRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <CardTitle>Suspended Permit List</CardTitle>
              <CardDescription>
                Review and resume suspended work permits
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Work</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Area</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Suspended By</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Suspended At</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Reason</th>
                        <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {permits.map((permit) => {
                        const suspension = getLatestSuspension(permit)

                        return (
                          <tr 
                            key={permit.id} 
                            className="group transition-colors hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10"
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
                                {suspension?.performer?.full_name ?? '—'}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDate(suspension?.created_at)}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="max-w-[250px]">
                                <p 
                                  className="truncate text-gray-600 dark:text-gray-400"
                                  title={permit.suspension_reason ?? suspension?.remarks ?? ''}
                                >
                                  {permit.suspension_reason ?? suspension?.remarks ?? '—'}
                                </p>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <Link
                                  href={`/permits/${permit.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  View
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
              </ScrollArea>
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                buildHref={(p) => pageHref('/permits/suspended', params, p)}
                totalItems={total}
                pageSize={pageSize}
              />
            </CardContent>
          </Card>
        )}

        {/* Info Note */}
        {permits.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Important Note
              </p>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                Suspended permits must be reviewed before resuming work. Ensure all safety concerns are addressed before resuming any suspended permit.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function getLatestSuspension(permit: Permit): Approval | undefined {
  return [...(permit.approvals ?? [])]
    .filter((approval) => approval.action === 'suspended')
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )[0]
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}