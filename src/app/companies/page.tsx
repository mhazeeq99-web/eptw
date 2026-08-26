import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SearchX, ShieldAlert } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { CompanySearchBox } from './search-box'

type SubscriptionEmbed = {
  status: string
  plan: {
    name: string
    code: string
  } | null
}

type CompanyRow = {
  id: number
  name: string
  code: string | null
  ssm_registration_no: string | null
  is_active: boolean
  created_at: string | null
  subscription: SubscriptionEmbed[]
  userCount: number
  permitCount: number
}

/**
 * Platform Admin — company management.
 *
 * Reads `?q=` from the URL and filters server-side (name / code / SSM).
 * RLS grants platform admins platform-wide read access through the regular
 * server client; the write path (suspend/reactivate) lives in
 * `/api/admin/companies/[id]/suspend`.
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { q: rawQ } = await searchParams
  const q = Array.isArray(rawQ) ? (rawQ[0] ?? '') : (rawQ ?? '')
  const query = q.trim()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Platform-admin-only page. RLS would scope the data anyway; this guard
  // keeps the management UI out of non-admin hands.
  if (profile?.role !== 'platform_admin') {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center rounded-xl border bg-background p-12 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Access restricted</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only Platform Admins can manage companies.
          </p>
        </div>
      </DashboardShell>
    )
  }

  let companyQuery = supabase
    .from('companies')
    .select(`
      id,
      name,
      code,
      ssm_registration_no,
      is_active,
      created_at,
      subscription:company_subscriptions(
        status,
        plan:plans(name, code)
      )
    `)
    .order('name')

  if (query) {
    const like = `%${escapeLike(query)}%`
    companyQuery = companyQuery.or(
      `name.ilike.${like},code.ilike.${like},ssm_registration_no.ilike.${like}`
    )
  }

  const { data: companies, error } = await companyQuery

  if (error) {
    console.error('Failed to load companies:', error)
  }

  // Per-company counts (exact, head-only queries — no row payloads).
  const rows: CompanyRow[] = await Promise.all(
    (companies ?? []).map(async (company) => {
      const [userCount, permitCount] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .eq('is_active', true),
        supabase
          .from('permits')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id),
      ])

      return {
        ...(company as unknown as Omit<
          CompanyRow,
          'userCount' | 'permitCount'
        >),
        userCount: userCount.count ?? 0,
        permitCount: permitCount.count ?? 0,
      }
    })
  )

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <BackButton href="/dashboard" label="Back to Platform" />
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
          <p className="mt-2 text-muted-foreground">
            Manage all registered ePTW companies.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-background">
          <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Registered companies</h2>
              <p className="text-sm text-muted-foreground">
                {query
                  ? `${rows.length} result${rows.length === 1 ? '' : 's'} for “${query}”`
                  : `${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} registered`}
              </p>
            </div>

            <CompanySearchBox defaultValue={query} />
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">
                {query
                  ? 'No companies match your search'
                  : 'No companies registered yet'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {query
                  ? 'Try a different company name, code or SSM registration number.'
                  : 'Newly registered companies will appear here.'}
              </p>
              {query && (
                <Link
                  href="/companies"
                  className="mt-4 text-sm font-medium text-primary hover:underline"
                >
                  Clear search
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Company</th>
                    <th className="px-6 py-3 text-left font-medium">SSM</th>
                    <th className="px-6 py-3 text-left font-medium">Plan</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-left font-medium">Users</th>
                    <th className="px-6 py-3 text-left font-medium">PTWs</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {rows.map((company) => {
                    const subscription = company.subscription?.find(
                      (entry) => entry.status === 'active'
                    )
                    const planName = subscription
                      ? (subscription.plan?.name ?? '—')
                      : 'Free'

                    return (
                      <tr
                        key={company.id}
                        className="relative hover:bg-muted/40"
                      >
                        <td className="px-6 py-4">
                          <Link
                            href={`/companies/${company.id}`}
                            className="font-medium text-foreground after:absolute after:inset-0 hover:underline"
                          >
                            {company.name}
                          </Link>
                          {company.code && (
                            <span className="ml-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {company.code}
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-muted-foreground">
                          {company.ssm_registration_no ?? '—'}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              planName === 'Free'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-primary/10 text-primary'
                            }`}
                          >
                            {planName}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <StatusBadge active={company.is_active} />
                        </td>

                        <td className="px-6 py-4">{company.userCount}</td>
                        <td className="px-6 py-4">{company.permitCount}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Active
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Suspended
    </span>
  )
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}
