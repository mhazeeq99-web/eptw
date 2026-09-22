import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ScrollText,
  SearchX,
  ShieldCheck,
  X,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  Activity,
  Building2,
  Users,
  FileText,
  CreditCard,
  AlertTriangle,
  Info,
  Clock,
  User
} from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { formatDateTimeMY } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Pagination } from '@/components/ui/pagination'

/**
 * Platform Audit — a read-only, platform-wide audit view.
 *
 * There is no dedicated platform audit table; events are DERIVED from the
 * existing application tables:
 *   - companies.created_at            -> "Company created"
 *   - profiles.created_at             -> "User created"
 *   - permits.created_at              -> "Permit created"
 *   - permit_approvals                -> permit lifecycle actions
 *   - company_subscriptions           -> subscription created / updated
 *
 * Read-only: no mutation endpoints are exposed here and no secrets (passwords,
 * tokens, API keys) are ever selected or rendered.
 */

type SearchParams = {
  q?: string
  from?: string
  to?: string
  page?: string
  per?: string
}

type CompanyRow = {
  id: number
  name: string
  code: string | null
  is_active: boolean
  created_at: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  company_id: number | null
  is_active: boolean
  created_at: string
}

type PermitRow = {
  id: number
  permit_no: string
  status: string
  company_id: number | null
  requester_id: string | null
  created_at: string
}

type ApprovalRow = {
  id: number
  permit_id: number
  action: string
  performed_by: string | null
  created_at: string
}

type SubscriptionRow = {
  id: number
  company_id: number
  plan_id: number | null
  status: string
  created_at: string
  updated_at: string
}

type PlanRow = {
  id: number
  code: string
  name: string
}

type AuditEvent = {
  key: string
  timestamp: string
  actor: string
  company: string
  action: string
  resource: string
  result: string
}

export default async function PlatformAuditPage({
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

  // ---------------------------------------------------------
  // Fetch the source tables. RLS gives platform_admin cross-tenant
  // read access to all of these; every fetch is read-only.
  // ---------------------------------------------------------

  const [companiesResult, profilesResult, permitsResult, approvalsResult, subsResult, plansResult] =
    await Promise.all([
      supabase
        .from('companies')
        .select('id, name, code, is_active, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('profiles')
        .select(
          'id, full_name, email, role, company_id, is_active, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('permits')
        .select(
          'id, permit_no, status, company_id, requester_id, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('permit_approvals')
        .select(
          'id, permit_id, action, performed_by, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(800),
      supabase
        .from('company_subscriptions')
        .select(
          'id, company_id, plan_id, status, created_at, updated_at'
        )
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('plans')
        .select('id, code, name')
        .limit(50),
    ])

  const companies = (companiesResult.data ?? []) as unknown as CompanyRow[]
  const profiles = (profilesResult.data ?? []) as unknown as ProfileRow[]
  const permits = (permitsResult.data ?? []) as unknown as PermitRow[]
  const approvals = (approvalsResult.data ?? []) as unknown as ApprovalRow[]
  const subscriptions = (subsResult.data ?? []) as unknown as SubscriptionRow[]
  const plans = (plansResult.data ?? []) as unknown as PlanRow[]

  // ---------------------------------------------------------
  // Lookup maps for joining actors and companies in JS.
  // ---------------------------------------------------------

  const companyById = new Map<number, CompanyRow>()
  for (const company of companies) {
    companyById.set(company.id, company)
  }

  const profileById = new Map<string, ProfileRow>()
  for (const p of profiles) {
    profileById.set(p.id, p)
  }

  const permitById = new Map<number, PermitRow>()
  for (const permit of permits) {
    permitById.set(permit.id, permit)
  }

  const planById = new Map<number, PlanRow>()
  for (const plan of plans) {
    planById.set(plan.id, plan)
  }

  // ---------------------------------------------------------
  // Derive the unified audit event stream.
  // ---------------------------------------------------------

  const events: AuditEvent[] = []

  // Company events.
  for (const company of companies) {
    events.push({
      key: `company-${company.id}`,
      timestamp: company.created_at,
      actor: 'Platform',
      company: company.name,
      action: 'Company created',
      resource: company.code
        ? `${company.name} (${company.code})`
        : company.name,
      result: company.is_active ? 'Active' : 'Inactive',
    })
  }

  // User events.
  for (const p of profiles) {
    events.push({
      key: `profile-${p.id}`,
      timestamp: p.created_at,
      actor: actorLabel(p),
      company: p.company_id != null
        ? companyById.get(p.company_id)?.name ?? '—'
        : '—',
      action: 'User created',
      resource: p.role.replaceAll('_', ' '),
      result: p.is_active ? 'Active' : 'Disabled',
    })
  }

  // Permit creation events.
  for (const permit of permits) {
    const requester = permit.requester_id
      ? profileById.get(permit.requester_id)
      : undefined

    events.push({
      key: `permit-${permit.id}`,
      timestamp: permit.created_at,
      actor: requester ? actorLabel(requester) : '—',
      company:
        permit.company_id != null
          ? companyById.get(permit.company_id)?.name ?? '—'
          : '—',
      action: 'Permit created',
      resource: permit.permit_no,
      result: permit.status.replaceAll('_', ' '),
    })
  }

  // Permit lifecycle (approval) events.
  for (const approval of approvals) {
    const permit = permitById.get(approval.permit_id)
    const performer = approval.performed_by
      ? profileById.get(approval.performed_by)
      : undefined

    events.push({
      key: `approval-${approval.id}`,
      timestamp: approval.created_at,
      actor: performer ? actorLabel(performer) : '—',
      company:
        permit?.company_id != null
          ? companyById.get(permit.company_id)?.name ?? '—'
          : '—',
      action: `Permit ${approval.action}`,
      resource: permit?.permit_no ?? `Permit #${approval.permit_id}`,
      result: approval.action.replaceAll('_', ' '),
    })
  }

  // Subscription events (created + updated when a change is recorded).
  for (const sub of subscriptions) {
    const companyName =
      companyById.get(sub.company_id)?.name ?? '—'
    const planName = sub.plan_id != null
      ? planById.get(sub.plan_id)?.name ?? '—'
      : '—'

    events.push({
      key: `sub-created-${sub.id}`,
      timestamp: sub.created_at,
      actor: 'Platform',
      company: companyName,
      action: 'Subscription created',
      resource: planName,
      result: sub.status.replaceAll('_', ' '),
    })

    if (
      sub.updated_at &&
      sub.updated_at !== sub.created_at
    ) {
      events.push({
        key: `sub-updated-${sub.id}`,
        timestamp: sub.updated_at,
        actor: 'Platform',
        company: companyName,
        action: 'Subscription updated',
        resource: planName,
        result: sub.status.replaceAll('_', ' '),
      })
    }
  }

  // ---------------------------------------------------------
  // Filters: ?q= free-text + optional date range (from/to).
  // ---------------------------------------------------------

  const q = (params.q ?? '').trim().toLowerCase()
  const from = parseDateBound(params.from)
  const to = parseDateBound(params.to, true)

  const filtered = events
    .filter((event) => {
      if (
        q &&
        !`${event.actor} ${event.company} ${event.action} ${event.resource} ${event.result}`
          .toLowerCase()
          .includes(q)
      ) {
        return false
      }

      const ts = new Date(event.timestamp).getTime()
      if (from != null && ts < from) return false
      if (to != null && ts > to) return false

      return true
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    )

  // ---------------------------------------------------------
  // Pagination (display-level; events are derived in JS then sliced).
  // ---------------------------------------------------------

  const PER_OPTIONS = [25, 50, 100] as const
  const perRaw = Number(params.per)
  const per = (PER_OPTIONS as readonly number[]).includes(perRaw)
    ? perRaw
    : 25
  const pageRaw = Number(params.page)
  const page =
    Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / per))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * per
  const shown = filtered.slice(start, start + per)
  const hasActiveFilters = Boolean(q || params.from || params.to)

  const filterBase = [
    params.q ? `q=${encodeURIComponent(params.q)}` : '',
    params.from ? `from=${params.from}` : '',
    params.to ? `to=${params.to}` : '',
  ]
    .filter(Boolean)
    .join('&')
  const pageHref = (p: number) =>
    `/platform/audit?${[filterBase, `per=${per}`, `page=${p}`]
      .filter(Boolean)
      .join('&')}`
  const perHref = (p: number) =>
    `/platform/audit?${[filterBase, `per=${p}`].filter(Boolean).join('&')}`

  // Calculate statistics
  const stats = {
    total: events.length,
    filtered: filtered.length,
    companyEvents: events.filter(e => e.action === 'Company created').length,
    permitEvents: events.filter(e => e.action.includes('Permit')).length,
    userEvents: events.filter(e => e.action === 'User created').length,
    subscriptionEvents: events.filter(e => e.action.includes('Subscription')).length,
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/dashboard" label="Back to Platform" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <ScrollText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Platform Audit
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Read-only audit trail of platform activity
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Activity className="mr-1 h-3 w-3" />
            {stats.total} Events
          </Badge>
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Read-Only Audit Trail
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Events are derived from existing application tables. Failed authorization attempts are not logged. No passwords, tokens or secrets are ever displayed.
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Building2}
            label="Company Events"
            value={stats.companyEvents}
            color="blue"
          />
          <StatCard
            icon={FileText}
            label="Permit Events"
            value={stats.permitEvents}
            color="green"
          />
          <StatCard
            icon={Users}
            label="User Events"
            value={stats.userEvents}
            color="purple"
          />
          <StatCard
            icon={CreditCard}
            label="Subscription Events"
            value={stats.subscriptionEvents}
            color="orange"
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <form method="get" action="/platform/audit">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Search className="h-4 w-4 text-gray-400" />
                    Search
                  </label>
                  <input
                    type="text"
                    name="q"
                    defaultValue={params.q ?? ''}
                    placeholder="Actor, company, action..."
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    From
                  </label>
                  <input
                    type="date"
                    name="from"
                    defaultValue={params.from ?? ''}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    To
                  </label>
                  <input
                    type="date"
                    name="to"
                    defaultValue={params.to ?? ''}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                  >
                    <Filter className="h-4 w-4" />
                    Apply Filters
                  </button>

                  {hasActiveFilters && (
                    <Link
                      href="/platform/audit"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </Link>
                  )}
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Results Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {filtered.length} event{filtered.length === 1 ? '' : 's'}
            </Badge>
            {hasActiveFilters && (
              <span className="text-sm text-muted-foreground">
                (filtered from {stats.total} total)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Rows per page:</span>
            {PER_OPTIONS.map((opt) => (
              <Link
                key={opt}
                href={perHref(opt)}
                className={`rounded-md border px-2.5 py-1 ${
                  per === opt
                    ? 'bg-blue-600 font-medium text-white'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {opt}
              </Link>
            ))}
          </div>
        </div>

        {/* Audit Table */}
        <Card>
          <CardContent className="p-0">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                  <SearchX className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                  {hasActiveFilters
                    ? 'No Events Match Your Filters'
                    : 'No Audit Events Yet'}
                </h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {hasActiveFilters
                    ? 'Try adjusting or clearing the filters above.'
                    : 'Platform activity will appear here as it is recorded.'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Timestamp</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Actor</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Action</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Resource</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {shown.map((event) => (
                        <tr
                          key={event.key}
                          className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="whitespace-nowrap px-6 py-4 text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDateTimeMY(event.timestamp)}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-gray-400" />
                              <span className="font-medium text-gray-900 dark:text-white">
                                {event.actor}
                              </span>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                            {event.company}
                          </td>

                          <td className="px-6 py-4 text-gray-900 dark:text-white">
                            {event.action}
                          </td>

                          <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                            {event.resource}
                          </td>

                          <td className="px-6 py-4">
                            <ResultBadge result={event.result} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Pagination — shared component (ellipsis + keyboard/aria support)
            instead of rendering every page number, which overflowed the
            viewport for large derived result sets. */}
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          buildHref={(p) => pageHref(p)}
          totalItems={total}
          pageSize={per}
        />

        {/* Footer Note */}
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Info className="h-3.5 w-3.5" />
          Derived audit view — timestamps are the creation/update timestamps recorded by the application.
        </p>
      </div>
    </>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: 'blue' | 'green' | 'purple' | 'orange' }) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400",
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

/** Display name for a profile, preferring full_name and falling back to email. */
function actorLabel(profile: {
  full_name: string | null
  email: string | null
}): string {
  return profile.full_name ?? profile.email ?? 'Unknown user'
}

/**
 * Parses a YYYY-MM-DD form value into a UTC millisecond bound.
 * `endOfDay` pushes the bound to 23:59:59.999 so `to` includes the whole day.
 */
function parseDateBound(
  value: string | undefined,
  endOfDay = false
): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const base = `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
  const ms = new Date(base).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Small status pill reusing the app's badge styling. */
function ResultBadge({ result }: { result: string }) {
  const key = result.toLowerCase().replaceAll(' ', '_')

  const tones: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    issued: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    resubmitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    revised: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    pending_approval: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    suspended: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    expired: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    disabled: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    inactive: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    completed: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
    closed: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
    draft: 'bg-muted text-muted-foreground',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
        tones[key] ?? 'bg-muted text-muted-foreground'
      }`}
    >
      {result}
    </span>
  )
}