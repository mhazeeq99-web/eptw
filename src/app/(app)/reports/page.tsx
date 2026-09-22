import Link from 'next/link'
import { 
  BarChart3,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Archive,
  ClipboardList,
  TrendingUp,
  Activity,
  Layers,
  Building2,
  MapPin,
  HardHat,
  Calendar,
  ChevronRight,
  Info,
  Users
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { resolvePermitScope } from '@/lib/permit-scope'
import { getExpiryState } from '@/components/permits/status-badge'
import { BackButton } from '@/components/ui/back-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

type PermitRow = {
  id: number
  status: string
  created_at: string
  permit_type_id: number | null
  area_id: number | null
  contractor_id: number | null
  planned_end: string | null
  valid_until: string | null
}

const STATUS_ORDER = [
  'draft',
  'pending_approval',
  'active',
  'suspended',
  'completed',
  'closed',
  'rejected',
  'cancelled',
]

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  active: 'Active',
  suspended: 'Suspended',
  completed: 'Completed',
  closed: 'Closed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const STATUS_ICONS: Record<string, any> = {
  draft: FileText,
  pending_approval: ClipboardList,
  active: Activity,
  suspended: PauseCircle,
  completed: CheckCircle2,
  closed: Archive,
  rejected: XCircle,
  cancelled: XCircle,
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800',
  pending_approval: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/50',
  active: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/50',
  suspended: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/50',
  completed: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/50',
  closed: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800',
  rejected: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/50',
  cancelled: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/50',
}

export default async function ReportsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const scope = await resolvePermitScope(supabase, user)

  if (!scope) return null

  // ---------------------------------------------------------
  // Fetch scoped permit rows + reference data
  // ---------------------------------------------------------

  let query = supabase
    .from('permits')
    .select(`
      id,
      status,
      created_at,
      permit_type_id,
      area_id,
      contractor_id,
      planned_end,
      valid_until
    `)

  if (!scope.isPlatformAdmin) {
    if (scope.companyId !== null) {
      query = query.eq('company_id', scope.companyId)
    } else if (scope.contractorId !== null) {
      query = query.eq('contractor_id', scope.contractorId)
    }
  }

  const { data: permits, error } = await query

  if (error) {
    console.error('Failed to load report data:', error)
  }

  const rows = (permits ?? []) as unknown as PermitRow[]

  // Phase F/2e: derived validity states for ACTIVE permits (Expiring Soon /
  // Expired) using the unified valid_until clock.
  const activeRows = rows.filter((permit) => permit.status === 'active')
  const expiringSoon = activeRows.filter(
    (permit) =>
      getExpiryState(
        permit.status,
        permit.valid_until,
        permit.planned_end
      ) === 'expiring_soon'
  ).length
  const expired = activeRows.filter(
    (permit) =>
      getExpiryState(
        permit.status,
        permit.valid_until,
        permit.planned_end
      ) === 'expired'
  ).length

  const companyMatch = scope.companyId
    ? { company_id: scope.companyId }
    : {}

  const [permitTypesResult, areasResult, contractorsResult] =
    await Promise.all([
      supabase
        .from('permit_types')
        .select('id, name')
        .match(companyMatch),
      supabase.from('areas').select('id, name').match(companyMatch),
      supabase
        .from('contractors')
        .select('id, company_name'),
    ])

  const permitTypeNames = new Map(
    (permitTypesResult.data ?? []).map((type) => [type.id, type.name])
  )
  const areaNames = new Map(
    (areasResult.data ?? []).map((area) => [area.id, area.name])
  )
  const contractorNames = new Map(
    (contractorsResult.data ?? []).map((contractor) => [
      contractor.id,
      contractor.company_name,
    ])
  )

  // ---------------------------------------------------------
  // Aggregations
  // ---------------------------------------------------------

  const counts: Record<string, number> = {}

  for (const status of STATUS_ORDER) {
    counts[status] = rows.filter(
      (permit) => permit.status === status
    ).length
  }

  const total = rows.length
  const activeTotal = counts.active ?? 0
  const completedTotal = (counts.completed ?? 0) + (counts.closed ?? 0)
  const completionRate = total > 0 ? Math.round((completedTotal / total) * 100) : 0

  const byType = aggregate(
    rows,
    (permit) => permitTypeNames.get(permit.permit_type_id ?? -1) ?? 'Unknown'
  )
  const byArea = aggregate(
    rows,
    (permit) => areaNames.get(permit.area_id ?? -1) ?? 'Unknown'
  )
  const byContractor = aggregate(
    rows,
    (permit) =>
      contractorNames.get(permit.contractor_id ?? -1) ?? 'Internal / None'
  )
  const byMonth = aggregate(rows, (permit) => {
    const date = new Date(permit.created_at)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/dashboard" label="Back to Operations" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Reports
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Operational overview of permit-to-work activity
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <TrendingUp className="mr-1 h-3 w-3" />
            {total} Total Permits
          </Badge>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={FileText}
            label="Total Permits"
            value={total}
            href="/permits"
            color="blue"
          />
          <MetricCard
            icon={Activity}
            label="Active"
            value={activeTotal}
            href="/permits?status=active"
            color="green"
          />
          <MetricCard
            icon={Clock}
            label="Expiring Soon"
            value={expiringSoon}
            href="/permits?status=active&expiry=expiring_soon"
            color="orange"
          />
          <MetricCard
            icon={CheckCircle2}
            label="Completion Rate"
            value={`${completionRate}%`}
            href="/permits?status=completed"
            color="purple"
          />
        </div>

        {/* Status Breakdown */}
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Status Breakdown
            </CardTitle>
            <CardDescription>
              Permits by current status
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STATUS_ORDER.map((status) => {
                const Icon = STATUS_ICONS[status]
                const count = counts[status] ?? 0
                return (
                  <Link
                    key={status}
                    href={`/permits?status=${status}`}
                    className="group flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:hover:border-blue-700"
                  >
                    <div className={`rounded-lg p-2 ${STATUS_COLORS[status]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400">{STATUS_LABELS[status]}</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{count}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
                  </Link>
                )
              })}
              <Link
                href="/permits?status=active&expiry=expired"
                className="group flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 transition-all hover:border-red-300 hover:shadow-md dark:border-red-800 dark:bg-red-900/20 dark:hover:border-red-700"
              >
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/50">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-red-700 dark:text-red-300">Expired</p>
                  <p className="text-xl font-bold text-red-700 dark:text-red-300">{expired}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-red-400 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Breakdown Tables */}
        <div className="grid gap-6 lg:grid-cols-2">
          <BreakdownCard
            title="PTW by Permit Type"
            icon={HardHat}
            data={byType}
            hrefBase="/permits"
          />
          <BreakdownCard
            title="PTW by Area"
            icon={MapPin}
            data={byArea}
            hrefBase="/permits"
          />
          <BreakdownCard
            title="PTW by Contractor"
            icon={Building2}
            data={byContractor}
            hrefBase="/permits"
          />
          <BreakdownCard
            title="PTW by Month"
            icon={Calendar}
            data={byMonth}
          />
        </div>

        {/* Info Note */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              About Reports
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              This report provides an operational overview of your permit activity. Click on any metric to view the corresponding permits.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  href,
  color,
}: {
  icon: any
  label: string
  value: number | string
  href: string
  color: 'blue' | 'green' | 'orange' | 'purple'
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400",
  }

  return (
    <Link
      href={href}
      className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
        <div className={`rounded-lg p-2 ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
    </Link>
  )
}

function BreakdownCard({
  title,
  icon: Icon,
  data,
  hrefBase,
}: {
  title: string
  icon: any
  data: Array<{ key: string; count: number }>
  hrefBase?: string
}) {
  const maxCount = Math.max(...data.map(d => d.count), 1)

  return (
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <p className="p-6 text-sm text-gray-600 dark:text-gray-400">
            No data available.
          </p>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.key}
                    </p>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-1.5 rounded-full bg-blue-600 dark:bg-blue-400"
                        style={{ width: `${(item.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    {hrefBase ? (
                      <Link
                        href={hrefBase}
                        className="text-lg font-bold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {item.count}
                      </Link>
                    ) : (
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {item.count}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function aggregate(
  rows: PermitRow[],
  keyFn: (permit: PermitRow) => string
): Array<{ key: string; count: number }> {
  const map = new Map<string, number>()

  for (const row of rows) {
    const key = keyFn(row)
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}