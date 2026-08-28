import Link from 'next/link'
import { 
  PlayCircle, 
  FileText,
  Clock,
  MapPin,
  User,
  Wrench,
  Calendar,
  ChevronRight,
  Building2,
  HardHat,
  AlertTriangle,
  Activity,
  TrendingUp,
  CheckCircle2,
  Info,
  Timer,
  Zap
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { resolvePermitScope } from '@/lib/permit-scope'
import { QuickFilters } from '@/components/permits/quick-filters'
import { StatusBadge, formatDate, getExpiryState } from '@/components/permits/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  actual_start: string | null
  planned_end: string | null
  valid_until: string | null
  permit_type: { name: string } | null
  area: { name: string } | null
  equipment: { name: string; equipment_no: string | null } | null
  contractor: { company_name: string } | null
  requester: { full_name: string } | null
}

type SearchParams = {
  q?: string
  permit_type_id?: string
  area_id?: string
  contractor_id?: string
  requester?: string
  date_from?: string
  date_to?: string
}

export default async function ActivePermitsPage({
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

  // ---------------------------------------------------------
  // Active permits (optionally expiring soon / expired)
  // ---------------------------------------------------------

  let query = supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      work_title,
      status,
      actual_start,
      planned_end,
      valid_until,

      permit_type:permit_types!permits_permit_type_id_fkey (
        name
      ),

      area:areas!permits_area_id_fkey (
        name
      ),

      equipment:equipment!permits_equipment_id_fkey (
        name,
        equipment_no
      ),

      contractor:contractors!permits_contractor_id_fkey (
        company_name
      ),

      requester:profiles!permits_requester_id_fkey (
        full_name
      )
    `)
    .eq('status', 'active')

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

  if (params.requester) {
    query = query.filter(
      'requester.full_name',
      'ilike',
      `%${escapeLike(params.requester)}%`
    )
  }

  if (params.date_from) {
    query = query.gte('actual_start', `${params.date_from}T00:00:00`)
  }

  if (params.date_to) {
    query = query.lte('actual_start', `${params.date_to}T23:59:59`)
  }

  query = query.order('actual_start', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('Failed to load active permits:', error)
  }

  const permits = (data ?? []) as unknown as Permit[]

  // ---------------------------------------------------------
  // Filter options
  // ---------------------------------------------------------

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

  const activeCount = permits.length
  const expiringCount = permits.filter(
    (permit) =>
      getExpiryState(
        permit.status,
        permit.valid_until,
        permit.planned_end
      ) === 'expiring_soon'
  ).length
  const expiredCount = permits.filter(
    (permit) =>
      getExpiryState(
        permit.status,
        permit.valid_until,
        permit.planned_end
      ) === 'expired'
  ).length

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-100 p-3 dark:bg-green-900/50">
                <PlayCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Active Permits
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Permits currently in progress
                </p>
              </div>
            </div>
          </div>

          <Badge variant="success" className="self-start">
            <Activity className="mr-1 h-3 w-3" />
            {activeCount} Active
          </Badge>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/50">
                  <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/50">
                  <Timer className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expiring Soon</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{expiringCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/50">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expired</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{expiredCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <QuickFilters
          basePath="/permits/active"
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
              <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/50">
                <PlayCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Active Permits
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                There are currently no active permits in the system.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <CardTitle>Active Permit List</CardTitle>
              <CardDescription>
                Monitor permits currently in progress
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Work</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Area</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Equipment</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Contractor</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Requester</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Actual Start</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Planned End</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {permits.map((permit) => (
                        <tr 
                          key={permit.id} 
                          className="group transition-colors hover:bg-green-50/50 dark:hover:bg-green-900/10"
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
                            <div className="max-w-[150px]">
                              <p className="truncate text-gray-600 dark:text-gray-400">
                                {permit.equipment
                                  ? `${permit.equipment.name}${permit.equipment.equipment_no ? ` (${permit.equipment.equipment_no})` : ''}`
                                  : '—'}
                              </p>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {permit.contractor ? (
                              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                                <Building2 className="h-3.5 w-3.5" />
                                {permit.contractor.company_name}
                              </div>
                            ) : (
                              <Badge variant="secondary">
                                <HardHat className="mr-1 h-3 w-3" />
                                Internal
                              </Badge>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <User className="h-3.5 w-3.5" />
                              {permit.requester?.full_name ?? '—'}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(permit.actual_start)}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDate(permit.planned_end)}
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
                            <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
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
            </CardContent>
          </Card>
        )}

        {/* Info Note */}
        {permits.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Active Permits
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                These permits are currently in progress. Monitor expiry dates and ensure all safety protocols are being followed.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}