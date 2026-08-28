import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Building2,
  Users,
  FileText,
  Search,
  SearchX,
  ShieldCheck,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Mail,
  User,
  Calendar,
  MapPin,
  HardHat,
  ChevronRight
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import {
  StatusBadge,
  getExpiryState,
} from '@/components/permits/status-badge'
import { formatDateTimeMY, formatDateMY } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Platform Admin — READ-ONLY support lookup.
 *
 * Tabs are driven by `?tab=` (company | user | permit); each tab is a
 * read-only search over companies, users or permits. There are deliberately
 * NO operational actions (no approve / activate / resume / suspend /
 * complete / close / verify buttons) on this page.
 */

const TABS = [
  { id: 'company', label: 'Company Lookup', icon: Building2, description: 'Search companies by name, code or SSM' },
  { id: 'user', label: 'User Lookup', icon: Users, description: 'Search users by email or name' },
  { id: 'permit', label: 'Permit Lookup', icon: FileText, description: 'Search permits by number, title or company' },
] as const

type TabId = (typeof TABS)[number]['id']

const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'Platform Admin',
  safety_manager: 'Safety Manager',
  safety_coordinator: 'Safety Coordinator',
  internal_staff: 'Internal Staff',
  contractor_admin: 'Contractor Admin',
}

const SEARCH_PLACEHOLDERS: Record<TabId, string> = {
  company: 'Company name, code or SSM…',
  user: 'Email or name…',
  permit: 'Permit no., work title or company…',
}

type SearchParams = {
  tab?: string
  q?: string
}

type CompanyRow = {
  id: number
  name: string
  code: string | null
  ssm_registration_no: string | null
  is_active: boolean
}

type SubscriptionRow = {
  id: number
  company_id: number
  status: string
  plan_id: number | null
  plans: { name: string; code: string } | null
}

type SubscriptionView = {
  plan: string
  status: string
  statusKey: 'active' | 'pending' | 'none' | 'ended'
}

type UserRow = {
  id: string
  full_name: string
  email: string
  role: string
  is_active: boolean
  invitation_sent_at: string | null
  company: { name: string } | null
}

type PermitRow = {
  id: number
  permit_no: string
  work_title: string
  status: string
  planned_start: string | null
  planned_end: string | null
  valid_until: string | null
  created_at: string
  permit_type: { name: string } | null
  company: { name: string } | null
}

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const rawTab = typeof params.tab === 'string' ? params.tab : ''
  const tab: TabId = TABS.some((t) => t.id === rawTab)
    ? (rawTab as TabId)
    : 'company'
  const q = (typeof params.q === 'string' ? params.q : '').trim()

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
    redirect('/dashboard')
  }

  // ------------------------------------------------------------------
  // Tab data (all read-only lookups; RLS stays authoritative)
  // ------------------------------------------------------------------

  let companyRows: CompanyRow[] = []
  const subscriptionByCompany = new Map<number, SubscriptionView>()
  const userCounts = new Map<number, number>()
  const permitCounts = new Map<number, number>()

  let userRows: UserRow[] = []

  let permitRows: PermitRow[] = []

  if (tab === 'company') {
    let query = supabase
      .from('companies')
      .select('id, name, code, ssm_registration_no, is_active')
      .order('name')

    if (q) {
      query = query.or(
        `name.ilike.%${escapeLike(q)}%,code.ilike.%${escapeLike(q)}%,ssm_registration_no.ilike.%${escapeLike(q)}%`
      )
    }

    const { data, error } = await query.limit(50)
    companyRows = (data ?? []) as unknown as CompanyRow[]

    if (error) {
      console.error('Failed to load companies:', error)
    }

    const companyIds = companyRows.map((company) => company.id)

    if (companyIds.length > 0) {
      const { data: subscriptions } = await supabase
        .from('company_subscriptions')
        .select(
          'id, company_id, status, plan_id, plans:plans!company_subscriptions_plan_id_fkey (name, code)'
        )
        .in('company_id', companyIds)
        .order('id', { ascending: false })

      const allSubscriptions =
        (subscriptions ?? []) as unknown as SubscriptionRow[]

      for (const companyId of companyIds) {
        subscriptionByCompany.set(
          companyId,
          effectiveSubscription(allSubscriptions, companyId)
        )
      }

      const [userResults, permitResults] = await Promise.all([
        Promise.all(
          companyIds.map((id) =>
            supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('company_id', id)
          )
        ),
        Promise.all(
          companyIds.map((id) =>
            supabase
              .from('permits')
              .select('id', { count: 'exact', head: true })
              .eq('company_id', id)
          )
        ),
      ])

      companyIds.forEach((id, index) => {
        userCounts.set(id, userResults[index].count ?? 0)
        permitCounts.set(id, permitResults[index].count ?? 0)
      })
    }
  }

  if (tab === 'user') {
    let query = supabase
      .from('profiles')
      .select(
        'id, full_name, email, role, is_active, invitation_sent_at, company:companies!profiles_company_id_fkey (name)'
      )
      .order('created_at', { ascending: false })

    if (q) {
      query = query.or(
        `email.ilike.%${escapeLike(q)}%,full_name.ilike.%${escapeLike(q)}%`
      )
    }

    const { data, error } = await query.limit(50)
    userRows = (data ?? []) as unknown as UserRow[]

    if (error) {
      console.error('Failed to load users:', error)
    }
  }

  if (tab === 'permit') {
    const select = `
      id,
      permit_no,
      work_title,
      status,
      planned_start,
      planned_end,
      valid_until,
      created_at,
      permit_type:permit_types!permits_permit_type_id_fkey (name),
      company:companies!permits_company_id_fkey (name)
    `

    if (q) {
      const [byPermitResult, byCompanyResult] = await Promise.all([
        supabase
          .from('permits')
          .select(select)
          .or(
            `permit_no.ilike.%${escapeLike(q)}%,work_title.ilike.%${escapeLike(q)}%`
          )
          .order('created_at', { ascending: false })
          .limit(50),
        (async () => {
          const { data: matchingCompanies } = await supabase
            .from('companies')
            .select('id')
            .ilike('name', `%${escapeLike(q)}%`)
            .limit(20)

          if (!matchingCompanies || matchingCompanies.length === 0) {
            return { data: [] as unknown as PermitRow[] }
          }

          return supabase
            .from('permits')
            .select(select)
            .in(
              'company_id',
              matchingCompanies.map((company) => company.id)
            )
            .order('created_at', { ascending: false })
            .limit(50)
        })(),
      ])

      const merged = new Map<number, PermitRow>()

      for (const row of [
        ...((byPermitResult.data ?? []) as unknown as PermitRow[]),
        ...((byCompanyResult.data ?? []) as unknown as PermitRow[]),
      ]) {
        if (!merged.has(row.id)) {
          merged.set(row.id, row)
        }
      }

      permitRows = [...merged.values()]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )
        .slice(0, 50)
    } else {
      const { data, error } = await supabase
        .from('permits')
        .select(select)
        .order('created_at', { ascending: false })
        .limit(50)

      permitRows = (data ?? []) as unknown as PermitRow[]

      if (error) {
        console.error('Failed to load permits:', error)
      }
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const resultCount =
    tab === 'company'
      ? companyRows.length
      : tab === 'user'
        ? userRows.length
        : permitRows.length

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/dashboard" label="Back to Platform" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Search className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Platform Support
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Read-only lookup of companies, users and permits
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Support Mode
          </Badge>
        </div>

        {/* Read-only Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              READ-ONLY SUPPORT MODE
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              This page only displays data. Approve, activate, resume, suspend, complete, close and verify actions are not available here.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Card>
          <CardContent className="p-2">
            <div className="grid gap-2 sm:grid-cols-3">
              {TABS.map((tabItem) => {
                const Icon = tabItem.icon
                const isActive = tabItem.id === tab
                const query = q
                  ? `?tab=${tabItem.id}&q=${encodeURIComponent(q)}`
                  : `?tab=${tabItem.id}`

                return (
                  <Link
                    key={tabItem.id}
                    href={`/platform/support${query}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                    <div>
                      <p className="font-medium">{tabItem.label}</p>
                      <p className={`text-xs ${isActive ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                        {tabItem.description}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <form action="/platform/support" method="get" className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="tab" value={tab} />
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder={SEARCH_PLACEHOLDERS[tab]}
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
              {q && (
                <Link
                  href={`/platform/support?tab=${tab}`}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Clear
                </Link>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Results Count */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {resultCount} result{resultCount === 1 ? '' : 's'}
          </Badge>
          {q && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              (filtered)
            </span>
          )}
        </div>

        {/* Tab Content */}
        {tab === 'company' && (
          <CompanyTable
            rows={companyRows}
            subscriptions={subscriptionByCompany}
            userCounts={userCounts}
            permitCounts={permitCounts}
            q={q}
          />
        )}

        {tab === 'user' && <UserTable rows={userRows} q={q} />}

        {tab === 'permit' && <PermitTable rows={permitRows} q={q} />}
      </div>
    </DashboardShell>
  )
}

// ----------------------------------------------------------------------
// Company tab
// ----------------------------------------------------------------------

function CompanyTable({
  rows,
  subscriptions,
  userCounts,
  permitCounts,
  q,
}: {
  rows: CompanyRow[]
  subscriptions: Map<number, SubscriptionView>
  userCounts: Map<number, number>
  permitCounts: Map<number, number>
  q: string
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={q ? 'No companies match your search' : 'No companies found'}
        detail={q ? 'Try a different name, company code or SSM registration number.' : 'There are no companies registered yet.'}
      />
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Plan</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Subscription</th>
                  <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Users</th>
                  <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Permits</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((company) => {
                  const sub = subscriptions.get(company.id)
                  return (
                    <tr key={company.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{company.name}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {company.code ?? '—'}
                              {company.ssm_registration_no ? ` · SSM ${company.ssm_registration_no}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <PlanPill sub={sub} />
                      </td>
                      <td className="px-6 py-4">
                        <SubscriptionPill sub={sub} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-gray-900 dark:text-white">
                          <Users className="h-3.5 w-3.5 text-gray-400" />
                          {userCounts.get(company.id) ?? 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-gray-900 dark:text-white">
                          <FileText className="h-3.5 w-3.5 text-gray-400" />
                          {permitCounts.get(company.id) ?? 0}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <AccountPill active={company.is_active} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------
// User tab
// ----------------------------------------------------------------------

function UserTable({ rows, q }: { rows: UserRow[]; q: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={q ? 'No users match your search' : 'No users found'}
        detail={q ? 'Try a different email address or name.' : 'There are no user profiles yet.'}
      />
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">User</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Role</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Account</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Invitation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{user.full_name || '—'}</p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {user.company?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="secondary">
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <AccountPill active={user.is_active} />
                    </td>
                    <td className="px-6 py-4">
                      {user.invitation_sent_at ? (
                        <Badge variant="warning">
                          <Clock className="mr-1 h-3 w-3" />
                          Invited · {formatDateMY(user.invitation_sent_at)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not invited</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------
// Permit tab
// ----------------------------------------------------------------------

function PermitTable({ rows, q }: { rows: PermitRow[]; q: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={q ? 'No permits match your search' : 'No permits found'}
        detail={q ? 'Try a different permit number, work title or company name.' : 'There are no permits yet.'}
      />
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Work</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Dates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((permit) => (
                  <tr key={permit.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4">
                      <span className="font-medium text-blue-600 dark:text-blue-400">{permit.permit_no}</span>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">#{permit.id}</p>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                      {permit.work_title}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Building2 className="h-3.5 w-3.5" />
                        {permit.company?.name ?? '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="secondary">
                        <HardHat className="mr-1 h-3 w-3" />
                        {permit.permit_type?.name ?? '—'}
                      </Badge>
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
                      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                        <p className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {permit.planned_start ? formatDateTimeMY(permit.planned_start) : '—'}
                          {permit.planned_end ? ` → ${formatDateTimeMY(permit.planned_end)}` : ''}
                        </p>
                        {permit.valid_until && (
                          <p className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Valid until {formatDateTimeMY(permit.valid_until)}
                          </p>
                        )}
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
  )
}

// ----------------------------------------------------------------------
// Small shared bits
// ----------------------------------------------------------------------

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-12 text-center">
        <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
          <SearchX className="h-12 w-12 text-gray-400 dark:text-gray-500" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{detail}</p>
      </CardContent>
    </Card>
  )
}

function AccountPill({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="success">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      Active
    </Badge>
  ) : (
    <Badge variant="secondary">
      <XCircle className="mr-1 h-3 w-3" />
      Disabled
    </Badge>
  )
}

function PlanPill({ sub }: { sub: SubscriptionView | undefined }) {
  const paid = sub?.statusKey === 'active' || sub?.statusKey === 'pending'
  return (
    <Badge variant={paid ? 'info' : 'secondary'}>
      {sub?.plan ?? 'Free'}
    </Badge>
  )
}

function SubscriptionPill({ sub }: { sub: SubscriptionView | undefined }) {
  const key = sub?.statusKey ?? 'none'
  
  const variants: Record<string, string> = {
    active: 'success',
    pending: 'warning',
    ended: 'secondary',
    none: 'secondary',
  }

  return (
    <Badge variant={variants[key] as any}>
      {sub?.status ?? '—'}
    </Badge>
  )
}

function effectiveSubscription(
  rows: SubscriptionRow[],
  companyId: number
): SubscriptionView {
  const latest = rows
    .filter((row) => row.company_id === companyId)
    .sort((a, b) => b.id - a.id)[0]

  if (!latest) {
    return {
      plan: 'Free',
      status: 'No subscription',
      statusKey: 'none',
    }
  }

  if (latest.status === 'active') {
    return {
      plan: latest.plans?.name ?? 'Paid plan',
      status: 'Active',
      statusKey: 'active',
    }
  }

  if (latest.status === 'pending') {
    return {
      plan: latest.plans?.name ?? 'Paid plan',
      status: 'Pending',
      statusKey: 'pending',
    }
  }

  return {
    plan: 'Free',
    status: capitalize(latest.status),
    statusKey: 'ended',
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Escapes LIKE wildcards so user input is matched literally. */
function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}