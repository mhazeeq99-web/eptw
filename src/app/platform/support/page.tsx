import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Building2,
  Users,
  FileText,
  Search,
  SearchX,
  ShieldCheck,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import {
  StatusBadge,
  getExpiryState,
} from '@/components/permits/status-badge'
import { formatDateTimeMY, formatDateMY } from '@/lib/dates'

/**
 * Platform Admin — READ-ONLY support lookup.
 *
 * Tabs are driven by `?tab=` (company | user | permit); each tab is a
 * read-only search over companies, users or permits. There are deliberately
 * NO operational actions (no approve / activate / resume / suspend /
 * complete / close / verify buttons) on this page.
 */

const TABS = [
  { id: 'company', label: 'Company Lookup', icon: Building2 },
  { id: 'user', label: 'User Lookup', icon: Users },
  { id: 'permit', label: 'Permit Lookup', icon: FileText },
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
      ? `${companyRows.length} compan${companyRows.length === 1 ? 'y' : 'ies'}`
      : tab === 'user'
        ? `${userRows.length} user${userRows.length === 1 ? '' : 's'}`
        : `${permitRows.length} permit${permitRows.length === 1 ? '' : 's'}`

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <BackButton href="/dashboard" label="Back to Platform" />
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Platform Support
          </h1>
          <p className="mt-2 text-muted-foreground">
            Read-only lookup of companies, users and permits for
            customer support.
          </p>
        </div>

        {/* READ-ONLY notice */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />

          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              READ-ONLY SUPPORT MODE — Operational actions are
              disabled.
            </p>

            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              This page only displays data. Approve, activate,
              resume, suspend, complete, close and verify actions are
              not available here.
            </p>
          </div>
        </div>

        <TabBar active={tab} q={q} />

        {/* Search */}
        <form
          action="/platform/support"
          method="get"
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input type="hidden" name="tab" value={tab} />

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={SEARCH_PLACEHOLDERS[tab]}
              className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Search className="h-4 w-4" />
            Search
          </button>

          {q && (
            <Link
              href={`/platform/support?tab=${tab}`}
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Clear
            </Link>
          )}
        </form>

        <div className="text-sm text-muted-foreground">
          {resultCount}
          {q ? ' (filtered)' : ''}
        </div>

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
// Tab bar — links driven by `?tab=`; preserves the active search `q`.
// Plain links, so it works from this Server Component with zero client JS.
// ----------------------------------------------------------------------

function TabBar({ active, q }: { active: TabId; q: string }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border bg-background p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === active
        const query = q
          ? `?tab=${tab.id}&q=${encodeURIComponent(q)}`
          : `?tab=${tab.id}`

        return (
          <Link
            key={tab.id}
            href={`/platform/support${query}`}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
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
        detail={
          q
            ? 'Try a different name, company code or SSM registration number.'
            : 'There are no companies registered yet.'
        }
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-6 py-3 text-left font-medium">
                Company
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Plan
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Subscription
              </th>
              <th className="px-6 py-3 text-right font-medium">
                Users
              </th>
              <th className="px-6 py-3 text-right font-medium">
                Permits
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Account
              </th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {rows.map((company) => {
              const sub = subscriptions.get(company.id)

              return (
                <tr
                  key={company.id}
                  className="transition-colors hover:bg-muted/40"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium">{company.name}</p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {company.code ?? '—'}
                      {company.ssm_registration_no
                        ? ` · SSM ${company.ssm_registration_no}`
                        : ''}
                    </p>
                  </td>

                  <td className="px-6 py-4">
                    <PlanPill sub={sub} />
                  </td>

                  <td className="px-6 py-4">
                    <SubscriptionPill sub={sub} />
                  </td>

                  <td className="px-6 py-4 text-right">
                    {userCounts.get(company.id) ?? 0}
                  </td>

                  <td className="px-6 py-4 text-right">
                    {permitCounts.get(company.id) ?? 0}
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
    </div>
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
        detail={
          q
            ? 'Try a different email address or name.'
            : 'There are no user profiles yet.'
        }
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-6 py-3 text-left font-medium">
                User
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Company
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Role
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Account
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Invitation
              </th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {rows.map((user) => (
              <tr
                key={user.id}
                className="transition-colors hover:bg-muted/40"
              >
                <td className="px-6 py-4">
                  <p className="font-medium">
                    {user.full_name || '—'}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </td>

                <td className="px-6 py-4">
                  {user.company?.name ?? '—'}
                </td>

                <td className="px-6 py-4">
                  {ROLE_LABELS[user.role] ?? user.role}
                </td>

                <td className="px-6 py-4">
                  <AccountPill active={user.is_active} />
                </td>

                <td className="px-6 py-4">
                  {user.invitation_sent_at ? (
                    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      Invited ·{' '}
                      {formatDateMY(user.invitation_sent_at)}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      Not invited
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
        detail={
          q
            ? 'Try a different permit number, work title or company name.'
            : 'There are no permits yet.'
        }
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-6 py-3 text-left font-medium">
                Permit
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Work
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Company
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Type
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Status
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Dates
              </th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {rows.map((permit) => (
              <tr
                key={permit.id}
                className="transition-colors hover:bg-muted/40"
              >
                <td className="px-6 py-4">
                  <p className="font-medium">{permit.permit_no}</p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    #{permit.id}
                  </p>
                </td>

                <td className="px-6 py-4 font-medium">
                  {permit.work_title}
                </td>

                <td className="px-6 py-4">
                  {permit.company?.name ?? '—'}
                </td>

                <td className="px-6 py-4">
                  {permit.permit_type?.name ?? '—'}
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
                  <p className="text-xs text-muted-foreground">
                    {permit.planned_start
                      ? formatDateTimeMY(permit.planned_start)
                      : '—'}
                    {permit.planned_end
                      ? ` → ${formatDateTimeMY(permit.planned_end)}`
                      : ''}
                  </p>

                  {permit.valid_until && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Valid until{' '}
                      {formatDateTimeMY(permit.valid_until)}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Small shared bits
// ----------------------------------------------------------------------

function EmptyState({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-background p-12 text-center">
      <SearchX className="h-10 w-10 text-muted-foreground" />

      <h2 className="mt-4 font-semibold">{title}</h2>

      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

function AccountPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
      ACTIVE
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      DISABLED
    </span>
  )
}

function PlanPill({ sub }: { sub: SubscriptionView | undefined }) {
  const paid =
    sub?.statusKey === 'active' || sub?.statusKey === 'pending'

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        paid
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {sub?.plan ?? 'Free'}
    </span>
  )
}

function SubscriptionPill({
  sub,
}: {
  sub: SubscriptionView | undefined
}) {
  const key = sub?.statusKey ?? 'none'

  const styles: Record<string, string> = {
    active:
      'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    pending:
      'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    ended: 'bg-muted text-muted-foreground',
    none: 'bg-muted text-muted-foreground',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[key]}`}
    >
      {sub?.status ?? '—'}
    </span>
  )
}

/**
 * Effective plan/subscription for a company: mirrors the app's
 * "latest subscription row wins" rule (see lib/billing/subscription).
 * A company with no active subscription is effectively on the FREE plan.
 */
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
