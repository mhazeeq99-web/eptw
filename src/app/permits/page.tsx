import Link from 'next/link'
import { Plus, FileText, SearchX, TriangleAlert, X } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { PermitFilters } from '@/components/permits/permit-filters'
import {
  StatusBadge,
  getExpiryState,
} from '@/components/permits/status-badge'
import { formatDateTimeMY } from '@/lib/dates'

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  planned_start: string | null
  planned_end: string | null
  valid_until: string | null
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
}

export default async function PermitsPage({
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

  // ---------------------------------------------------------
  // Build the permit query with server-side filters
  // ---------------------------------------------------------

  let query = supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      work_title,
      status,
      planned_start,
      planned_end,
      valid_until,

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
    `)

  // Company / contractor scoping (defense in depth on top of RLS).
  if (profile?.company_id) {
    query = query.eq('company_id', profile.company_id)
  } else if (profile?.role === 'contractor_admin') {
    const { data: membership } = await supabase
      .from('contractor_users')
      .select('contractor_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (membership) {
      query = query.eq('contractor_id', membership.contractor_id)
    }
  }

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
    query = query.eq(
      'permit_type_id',
      Number(params.permit_type_id)
    )
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

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('Failed to load permits:', error)
  }

  const permits = (data ?? []) as unknown as Permit[]

  // Phase 2e hardening: unified expiry clock. The authoritative permit
  // expiry is valid_until; the `expiry` search param (expiring_soon|expired)
  // filters ACTIVE permits by that derived state so the dashboard/report
  // drill-down links match the displayed results.
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

  // Filter options (scoped to the user's company)
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
    <DashboardShell>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Permits
            </h1>

            <p className="mt-2 text-muted-foreground">
              Manage permit-to-work applications.
            </p>
          </div>

          <Link
            href="/permits/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Permit
          </Link>
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
        <div className="text-sm text-muted-foreground">
          {filteredPermits.length} permit
          {filteredPermits.length === 1 ? '' : 's'}
          {hasActiveFilters ? ' (filtered)' : ''}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border bg-background">

          {error ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <TriangleAlert className="h-10 w-10 text-destructive" />

              <h2 className="mt-4 font-semibold">
                Couldn&apos;t load permits
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Something went wrong while loading your permits. Please try
                again.
              </p>
            </div>
          ) : filteredPermits.length === 0 ? (
            hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <SearchX className="h-10 w-10 text-muted-foreground" />

                <h2 className="mt-4 font-semibold">
                  No permits match your filters
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting or clearing the filters above to see more
                  permits.
                </p>

                <Link
                  href="/permits"
                  className="mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                  Clear filters
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" />

                <h2 className="mt-4 font-semibold">
                  No permits yet
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Create your first permit-to-work application to get started.
                </p>

                <Link
                  href="/permits/new"
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Create Permit
                </Link>
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">

                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">
                      Permit
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Work
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Type
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Area
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Requester
                    </th>

                    <th className="px-6 py-3 text-left font-medium">
                      Status
                    </th>

                    <th className="px-6 py-3 text-right font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filteredPermits.map((permit) => (
                    <tr
                      key={permit.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/permits/${permit.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {permit.permit_no}
                        </Link>

                        <p className="mt-1 text-xs text-muted-foreground">
                          #{permit.id}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-medium">
                          {permit.work_title}
                        </p>

                        {permit.planned_start && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDateTimeMY(permit.planned_start)}
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
                        {permit.requester?.full_name ?? '—'}
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

                      <td className="px-6 py-4 text-right">
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
