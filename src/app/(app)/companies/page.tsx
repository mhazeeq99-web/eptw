import Link from 'next/link'
import { redirect } from 'next/navigation'
import { 
  SearchX, 
  ShieldAlert, 
  Building2,
  Users,
  FileText,
  CreditCard,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Search,
  TrendingUp,
  Activity,
  Info,
  Star,
  Layers
} from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { CompanySearchBox } from './search-box'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

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

  if (profile?.role !== 'platform_admin') {
    return (
      <>
        <div className="flex flex-col items-center justify-center rounded-xl border bg-background p-12 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Access restricted</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only Platform Admins can manage companies.
          </p>
        </div>
      </>
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

  const stats = {
    total: rows.length,
    active: rows.filter(c => c.is_active).length,
    suspended: rows.filter(c => !c.is_active).length,
    pro: rows.filter(c => {
      const sub = c.subscription?.find(s => s.status === 'active')
      return sub?.plan?.code === 'pro'
    }).length,
    free: rows.filter(c => {
      const sub = c.subscription?.find(s => s.status === 'active')
      return !sub || !sub.plan || sub.plan.code === 'free'
    }).length,
    totalUsers: rows.reduce((sum, c) => sum + c.userCount, 0),
    totalPermits: rows.reduce((sum, c) => sum + c.permitCount, 0),
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-6">
          <BackButton href="/dashboard" label="Back to Platform" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Companies
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Manage all registered ePTW companies
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Building2 className="mr-1 h-3 w-3" />
            {stats.total} Total
          </Badge>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Building2}
            label="Total Companies"
            value={stats.total}
            color="blue"
          />
          <StatCard
            icon={CheckCircle2}
            label="Active"
            value={stats.active}
            color="green"
          />
          <StatCard
            icon={Star}
            label="Pro Plan"
            value={stats.pro}
            color="purple"
          />
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats.totalUsers}
            color="orange"
          />
        </div>

        {/* Additional Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={Layers}
            label="Free Plan"
            value={stats.free}
            color="gray"
          />
          <StatCard
            icon={FileText}
            label="Total Permits"
            value={stats.totalPermits}
            color="indigo"
          />
          <StatCard
            icon={XCircle}
            label="Suspended"
            value={stats.suspended}
            color="red"
          />
        </div>

        {/* Companies Table */}
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Registered Companies</CardTitle>
                <CardDescription>
                  {query
                    ? `${rows.length} result${rows.length === 1 ? '' : 's'} for "${query}"`
                    : `${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} registered`}
                </CardDescription>
              </div>
              <CompanySearchBox defaultValue={query} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                  <SearchX className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                  {query
                    ? 'No Companies Match Your Search'
                    : 'No Companies Registered Yet'}
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {query
                    ? 'Try a different company name, code or SSM registration number.'
                    : 'Newly registered companies will appear here.'}
                </p>
                {query && (
                  <Link
                    href="/companies"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <XCircle className="h-4 w-4" />
                    Clear Search
                  </Link>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">SSM</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Plan</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Users</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">PTWs</th>
                        <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {rows.map((company) => {
                        const subscription = company.subscription?.find(
                          (entry) => entry.status === 'active'
                        )
                        const planName = subscription
                          ? (subscription.plan?.name ?? '—')
                          : 'Free'
                        const isPro = subscription?.plan?.code === 'pro'

                        return (
                          <tr
                            key={company.id}
                            className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <td className="px-6 py-4">
                              <div>
                                <Link
                                  href={`/companies/${company.id}`}
                                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {company.name}
                                </Link>
                                {company.code && (
                                  <span className="ml-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {company.code}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                              {company.ssm_registration_no ?? '—'}
                            </td>

                            <td className="px-6 py-4">
                              <Badge variant={isPro ? "info" : "secondary"}>
                                {isPro && <Star className="mr-1 h-3 w-3" />}
                                {planName}
                              </Badge>
                            </td>

                            <td className="px-6 py-4">
                              <StatusBadge active={company.is_active} />
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                                <Users className="h-3.5 w-3.5" />
                                {company.userCount}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                                <FileText className="h-3.5 w-3.5" />
                                {company.permitCount}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/companies/${company.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                  View Details
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Info Note */}
        {rows.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Company Management
              </p>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                Click on any company to view detailed information and manage their subscription status.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: 'blue' | 'green' | 'purple' | 'orange' | 'gray' | 'indigo' | 'red' }) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400",
    gray: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
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

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Active
      </Badge>
    )
  }

  return (
    <Badge variant="destructive">
      <XCircle className="mr-1 h-3 w-3" />
      Suspended
    </Badge>
  )
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}