import Link from 'next/link'
import { PlayCircle, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { resolvePermitScope } from '@/lib/permit-scope'
import { QuickFilters } from '@/components/permits/quick-filters'
import { StatusBadge, formatDate, getExpiryState } from '@/components/permits/status-badge'

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  actual_start: string | null
  planned_end: string | null
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
      getExpiryState(permit.status, permit.planned_end) ===
      'expiring_soon'
  ).length
  const expiredCount = permits.filter(
    (permit) =>
      getExpiryState(permit.status, permit.planned_end) === 'expired'
  ).length

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Active Permits
          </h1>

          <p className="mt-2 text-muted-foreground">
            Permits currently in progress.
          </p>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
            {activeCount} active
          </span>

          <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {expiringCount} expiring soon
          </span>

          <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {expiredCount} expired
          </span>
        </div>

        <QuickFilters
          basePath="/permits/active"
          options={{
            permitTypes: permitTypesResult.data ?? [],
            areas: areasResult.data ?? [],
            contractors: contractorsResult.data ?? [],
          }}
        />

        <div className="overflow-hidden rounded-xl border bg-background">
          {permits.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <PlayCircle className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">
                No active permits
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                There are currently no active permits.
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
                    <th className="px-4 py-3 text-left font-medium">Equipment</th>
                    <th className="px-4 py-3 text-left font-medium">Contractor</th>
                    <th className="px-4 py-3 text-left font-medium">Requester</th>
                    <th className="px-4 py-3 text-left font-medium">Actual Start</th>
                    <th className="px-4 py-3 text-left font-medium">Planned End</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
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
                        {permit.equipment
                          ? `${permit.equipment.name}${permit.equipment.equipment_no ? ` (${permit.equipment.equipment_no})` : ''}`
                          : '—'}
                      </td>

                      <td className="px-4 py-3">
                        {permit.contractor?.company_name ?? '—'}
                      </td>

                      <td className="px-4 py-3">
                        {permit.requester?.full_name ?? '—'}
                      </td>

                      <td className="px-4 py-3">
                        {formatDate(permit.actual_start)}
                      </td>

                      <td className="px-4 py-3">
                        {formatDate(permit.planned_end)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge
                          status={permit.status}
                          expiry={getExpiryState(
                            permit.status,
                            permit.planned_end
                          )}
                        />
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
