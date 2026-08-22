import Link from 'next/link'
import { Plus, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { PermitFilters } from '@/components/permits/permit-filters'

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  planned_start: string | null
  planned_end: string | null
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
  } else if (profile?.role === 'requester') {
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

  // ---------------------------------------------------------
  // Filter options (scoped to the user's company)
  // ---------------------------------------------------------

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

  const hasActiveFilters = Boolean(
    params.q ||
      params.status ||
      params.permit_type_id ||
      params.area_id ||
      params.contractor_id ||
      params.requester ||
      params.date_from ||
      params.date_to
  )

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
          {permits.length} permit
          {permits.length === 1 ? '' : 's'}
          {hasActiveFilters ? ' (filtered)' : ''}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border bg-background">

          {permits.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">
                {hasActiveFilters
                  ? 'No permits match your filters'
                  : 'No permits found'}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {hasActiveFilters
                  ? 'Try adjusting or clearing the filters above.'
                  : 'Create your first permit-to-work application.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">

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
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {permits.map((permit) => (
                    <tr
                      key={permit.id}
                      className="hover:bg-muted/40"
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
                            {formatDate(permit.planned_start)}
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
                        />
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

function StatusBadge({
  status,
}: {
  status: string
}) {
  const styles: Record<string, string> = {
    draft:
      'bg-muted text-muted-foreground',

    submitted:
      'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',

    pending_approval:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',

    approved:
      'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',

    issued:
      'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',

    active:
      'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',

    suspended:
      'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',

    completed:
      'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',

    closed:
      'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',

    rejected:
      'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',

    cancelled:
      'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',

    expired:
      'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
        styles[status] ?? 'bg-muted text-muted-foreground'
      }`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
