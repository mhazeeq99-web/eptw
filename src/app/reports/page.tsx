import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { resolvePermitScope } from '@/lib/permit-scope'
import { getExpiryState } from '@/components/permits/status-badge'
import { BackButton } from '@/components/ui/back-button'

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
    <DashboardShell>
      <div className="space-y-6">
        <BackButton href="/dashboard" label="Back to Operations" />

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Reports
          </h1>

          <p className="mt-2 text-muted-foreground">
            Operational overview of permit-to-work activity for your
            company.
          </p>
        </div>

        {/* Status counts */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/permits"
            className="rounded-xl border bg-background p-5 shadow-sm transition-colors hover:bg-muted/40"
          >
            <p className="text-sm text-muted-foreground">Total Permits</p>
            <p className="mt-2 text-3xl font-bold">{total}</p>
          </Link>

          {STATUS_ORDER.map((status) => (
            <Link
              key={status}
              href={`/permits?status=${status}`}
              className="rounded-xl border bg-background p-5 shadow-sm transition-colors hover:bg-muted/40"
            >
              <p className="text-sm text-muted-foreground">
                {STATUS_LABELS[status]}
              </p>
              <p className="mt-2 text-3xl font-bold">
                {counts[status] ?? 0}
              </p>
            </Link>
          ))}

          <Link
            href="/permits?status=active&expiry=expiring_soon"
            className="rounded-xl border bg-background p-5 shadow-sm transition-colors hover:bg-muted/40"
          >
            <p className="text-sm text-muted-foreground">Expiring Soon</p>
            <p className="mt-2 text-3xl font-bold">{expiringSoon}</p>
          </Link>

          <Link
            href="/permits?status=active&expiry=expired"
            className="rounded-xl border bg-background p-5 shadow-sm transition-colors hover:bg-muted/40"
          >
            <p className="text-sm text-muted-foreground">Expired</p>
            <p className="mt-2 text-3xl font-bold">{expired}</p>
          </Link>
        </div>

        {/* Breakdowns */}
        <div className="grid gap-6 lg:grid-cols-2">
          <BreakdownTable
            title="PTW by Permit Type"
            data={byType}
            hrefBase="/permits"
          />

          <BreakdownTable
            title="PTW by Area"
            data={byArea}
            hrefBase="/permits"
          />

          <BreakdownTable
            title="PTW by Contractor"
            data={byContractor}
            hrefBase="/permits"
          />

          <BreakdownTable title="PTW by Month" data={byMonth} />
        </div>
      </div>
    </DashboardShell>
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

function BreakdownTable({
  title,
  data,
  hrefBase,
}: {
  title: string
  data: Array<{ key: string; count: number }>
  hrefBase?: string
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-background">
      <div className="border-b px-6 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          {title}
        </h2>
      </div>

      {data.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          No data available.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Item</th>
                <th className="px-6 py-3 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((item) => (
                <tr key={item.key} className="hover:bg-muted/40">
                  <td className="px-6 py-3 font-medium">{item.key}</td>
                  <td className="px-6 py-3 text-right">
                    {hrefBase ? (
                      <Link
                        href={hrefBase}
                        className="font-medium text-primary hover:underline"
                      >
                        {item.count}
                      </Link>
                    ) : (
                      item.count
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
