import Link from 'next/link'
import {
  FileText,
  ClipboardList,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  Archive,
  XCircle,
  Clock,
  AlertTriangle,
  Banknote,
  Building2,
  CreditCard,
  HardDrive,
  Layers,
  Repeat,
  Star,
  Users,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import {
  notifyExpiringPermits,
  notifyExpiredPermits,
} from '@/lib/notifications'
import {
  StatusBadge,
  getExpiryState,
} from '@/components/permits/status-badge'

type PermitRow = {
  id: number
  permit_no: string
  work_title: string
  status: string
  planned_start: string | null
  planned_end: string | null
  valid_until: string | null
  permit_type: {
    name: string
  } | null
  requester: {
    full_name: string
  } | null
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

// Shape of an active subscription joined to its plan (platform dashboard).
type ActiveSubscriptionWithPlan = {
  plan: {
    code: string | null
    price_monthly: number | null
  } | null
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, company_id, full_name')
    .eq('id', user.id)
    .single()

  // Platform admins get the platform/SaaS admin dashboard (aggregate
  // platform-level metrics only). Return before the operational permit
  // queries so the operational dashboard is never built for them.
  if (profile?.role === 'platform_admin') {
    return <PlatformAdminDashboard />
  }

  // Scope: company users see their company's permits; contractor
  // users (no company) see the permits they requested.
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
        name
      ),

      requester:profiles!permits_requester_id_fkey (
        full_name
      )
    `)

  if (profile?.company_id) {
    query = query.eq('company_id', profile.company_id)
  } else {
    query = query.eq('requester_id', user.id)
  }

  const { data: permits, error } = await query

  if (error) {
    console.error('Failed to load dashboard permits:', error)
  }

  // Best-effort: notify about permits expiring within the next 24h and
  // permits whose validity window has ended (each deduplicated per permit).
  if (profile?.company_id) {
    await notifyExpiringPermits(supabase, profile.company_id)
    await notifyExpiredPermits(supabase, profile.company_id)
  }

  // ---------------------------------------------------------
  // First-time setup check: company has no permit types yet
  // ---------------------------------------------------------

  let needsSetup = false

  if (profile?.company_id) {
    const { data: types } = await supabase
      .from('permit_types')
      .select('id')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .limit(1)

    needsSetup = !types || types.length === 0
  }

  const rows = (permits ?? []) as unknown as PermitRow[]

  const counts: Record<string, number> = {}

  for (const status of STATUS_ORDER) {
    counts[status] = rows.filter(
      (permit) => permit.status === status
    ).length
  }

  // Derived validity states (Phase F): an ACTIVE permit is additionally
  // EXPIRING SOON or EXPIRED based on the central validity window.
  const activeRows = rows.filter((permit) => permit.status === 'active')
  counts.expiring_soon = activeRows.filter(
    (permit) =>
      getExpiryState(
        permit.status,
        permit.valid_until,
        permit.planned_end
      ) === 'expiring_soon'
  ).length
  counts.expired = activeRows.filter(
    (permit) =>
      getExpiryState(
        permit.status,
        permit.valid_until,
        permit.planned_end
      ) === 'expired'
  ).length

  const recentPermits = [...rows]
    .sort(
      (a, b) =>
        new Date(b.planned_start ?? 0).getTime() -
        new Date(a.planned_start ?? 0).getTime()
    )
    .slice(0, 5)

  return (
    <DashboardShell>
      <div className="space-y-6">
        {needsSetup && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30">
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Complete your company setup
              </p>

              <p className="text-sm text-amber-700 dark:text-amber-400">
                Add permit types and safety controls so your team can
                start creating permits.
              </p>
            </div>

            <Link
              href="/settings"
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to Settings
            </Link>
          </div>
        )}

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {profile?.full_name
              ? `Welcome, ${profile.full_name.split(' ')[0]}`
              : 'Dashboard'}
          </h1>

          <p className="mt-2 text-muted-foreground">
            Overview of your permit-to-work activity.
          </p>
        </div>

        {/* Status counts */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Draft"
            value={counts.draft ?? 0}
            href="/permits?status=draft"
            icon={<FileText className="h-4 w-4" />}
            tone="muted"
          />

          <DashboardCard
            title="Pending Approval"
            value={counts.pending_approval ?? 0}
            href="/permits?status=pending_approval"
            icon={<ClipboardList className="h-4 w-4" />}
            tone="yellow"
          />

          <DashboardCard
            title="Active"
            value={counts.active ?? 0}
            href="/permits?status=active"
            icon={<PlayCircle className="h-4 w-4" />}
            tone="green"
          />

          <DashboardCard
            title="Expiring Soon"
            value={counts.expiring_soon ?? 0}
            href="/permits?status=active&expiry=expiring_soon"
            icon={<Clock className="h-4 w-4" />}
            tone="orange"
          />

          <DashboardCard
            title="Expired"
            value={counts.expired ?? 0}
            href="/permits?status=active&expiry=expired"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="red"
          />

          <DashboardCard
            title="Suspended"
            value={counts.suspended ?? 0}
            href="/permits?status=suspended"
            icon={<PauseCircle className="h-4 w-4" />}
            tone="orange"
          />

          <DashboardCard
            title="Completed"
            value={counts.completed ?? 0}
            href="/permits?status=completed"
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="gray"
          />

          <DashboardCard
            title="Closed"
            value={counts.closed ?? 0}
            href="/permits?status=closed"
            icon={<Archive className="h-4 w-4" />}
            tone="gray"
          />

          <DashboardCard
            title="Rejected"
            value={counts.rejected ?? 0}
            href="/permits?status=rejected"
            icon={<XCircle className="h-4 w-4" />}
            tone="red"
          />

          <DashboardCard
            title="Cancelled"
            value={counts.cancelled ?? 0}
            href="/permits?status=cancelled"
            icon={<XCircle className="h-4 w-4" />}
            tone="red"
          />
        </div>

        {/* Recent permits */}
        <div className="overflow-hidden rounded-xl border bg-background">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-semibold">Recent Permits</h2>

            <Link
              href="/permits"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {recentPermits.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />

              <h3 className="mt-4 font-semibold">
                No permits yet
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Create your first permit-to-work application.
              </p>

              <Link
                href="/permits/new"
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {profile?.role === 'contractor_admin'
                  ? 'Create Contractor PTW'
                  : 'Create Permit'}
              </Link>
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
                      Requester
                    </th>
                    <th className="px-6 py-3 text-left font-medium">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {recentPermits.map((permit) => (
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
                      </td>

                      <td className="px-6 py-4 font-medium">
                        {permit.work_title}
                      </td>

                      <td className="px-6 py-4">
                        {permit.permit_type?.name ?? '—'}
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

function DashboardCard({
  title,
  value,
  href,
  icon,
  tone,
}: {
  title: string
  value: number
  href: string
  icon: React.ReactNode
  tone: 'muted' | 'yellow' | 'green' | 'orange' | 'gray' | 'red'
}) {
  const tones: Record<typeof tone, string> = {
    muted: 'bg-muted/40 text-muted-foreground',
    yellow:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    green:
      'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    orange:
      'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  }

  return (
    <Link
      href={href}
      className="rounded-xl border bg-background p-5 shadow-sm transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {title}
        </p>

        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${tones[tone]}`}
        >
          {icon}
        </span>
      </div>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Platform / SaaS admin dashboard (platform_admin role only).
//
// Renders aggregate platform-level metrics across ALL companies. Platform
// Admin RLS grants platform-wide visibility, so plain selects work. Only
// aggregate counts are shown — customer-sensitive data (company names,
// individual permits, approvals, requests) is never exposed, and there are
// no operational permit action buttons here.
// ---------------------------------------------------------------------------
async function PlatformAdminDashboard() {
  const supabase = await createClient()

  // Start of the current calendar month (UTC) — permits.created_at is UTC.
  const now = new Date()
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString()

  const [
    totalCompaniesResult,
    activeCompaniesResult,
    activeSubscriptionsResult,
    monthlyPtwsResult,
    activeUsersResult,
    attachmentsResult,
    failedPaymentsResult,
    activeSubscriptionsWithPlansResult,
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('company_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('permits')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('role', 'platform_admin'),
    supabase
      .from('permit_attachments')
      .select('size_bytes'),
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed'),
    // Active subscriptions with their plan (embedded plans join; RLS only
    // returns active plans, which covers the seeded Free/Pro plans).
    supabase
      .from('company_subscriptions')
      .select('plan:plans(code, price_monthly)')
      .eq('status', 'active'),
  ])

  const totalCompanies = totalCompaniesResult.count ?? 0
  const activeCompanies = activeCompaniesResult.count ?? 0
  const activeSubscriptions = activeSubscriptionsResult.count ?? 0
  const monthlyPtws = monthlyPtwsResult.count ?? 0
  const activeUsers = activeUsersResult.count ?? 0
  const failedPayments = failedPaymentsResult.count ?? 0

  // The supabase client has no generated Database schema, so embedded
  // resources come back loosely typed; cast to the shape PostgREST returns
  // (a to-one FK join yields a single plan object, not an array).
  const subscriptionRows = (
    activeSubscriptionsWithPlansResult.data ?? []
  ) as unknown as ActiveSubscriptionWithPlan[]

  const proSubscriptions = subscriptionRows.filter(
    (sub) => sub.plan?.code === 'pro'
  )

  // One active subscription per company (partial unique index enforces it),
  // so the Pro company count equals the Pro subscription count today.
  const proCompanies = proSubscriptions.length
  const freeCompanies = Math.max(0, totalCompanies - proCompanies)
  const proSubscriptionCount = proSubscriptions.length

  const monthlyRecurringRevenue = proSubscriptions.reduce(
    (sum, sub) => sum + Number(sub.plan?.price_monthly ?? 0),
    0
  )

  const storageBytes = (attachmentsResult.data ?? []).reduce(
    (sum: number, attachment: { size_bytes?: number | null }) =>
      sum + Number(attachment.size_bytes ?? 0),
    0
  )

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              Platform Admin
            </h1>

            <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground">
              ePTW SaaS
            </span>
          </div>

          <p className="mt-2 text-muted-foreground">
            Platform-level aggregate metrics across all companies.
          </p>
        </div>

        {/* Clear distinction: this is platform-level data, not customer
            operational data. */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
            Platform Metrics
          </span>

          <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
            Customer Operational Data — Not Shown
          </span>
        </div>

        {/* Platform metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Companies"
            value={totalCompanies}
            icon={<Building2 className="h-4 w-4" />}
            tone="muted"
          />

          <MetricCard
            title="Active Companies"
            value={activeCompanies}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="green"
          />

          <MetricCard
            title="Free Companies"
            value={freeCompanies}
            subtitle="Includes companies with no active subscription"
            icon={<Layers className="h-4 w-4" />}
            tone="muted"
          />

          <MetricCard
            title="Pro Companies"
            value={proCompanies}
            icon={<Star className="h-4 w-4" />}
            tone="blue"
          />

          <MetricCard
            title="Active Subscriptions"
            value={activeSubscriptions}
            icon={<CreditCard className="h-4 w-4" />}
            tone="muted"
          />

          <MetricCard
            title="Monthly PTWs"
            value={monthlyPtws}
            subtitle="Permits created this month, all companies"
            icon={<FileText className="h-4 w-4" />}
            tone="orange"
          />

          <MetricCard
            title="Active Users"
            value={activeUsers}
            subtitle="Active profiles, excluding platform admins"
            icon={<Users className="h-4 w-4" />}
            tone="green"
          />

          <MetricCard
            title="Storage Usage"
            value={formatStorageBytes(storageBytes)}
            subtitle="Sum of permit attachment sizes"
            icon={<HardDrive className="h-4 w-4" />}
            tone="muted"
          />

          <MetricCard
            title="Pro Subscription Count"
            value={proSubscriptionCount}
            icon={<Repeat className="h-4 w-4" />}
            tone="blue"
          />

          <MetricCard
            title="Monthly Recurring Revenue"
            value={`MYR ${monthlyRecurringRevenue.toFixed(2)}`}
            subtitle="Active Pro subscriptions"
            icon={<Banknote className="h-4 w-4" />}
            tone="green"
          />

          <MetricCard
            title="Failed Payments"
            value={failedPayments}
            icon={<XCircle className="h-4 w-4" />}
            tone="red"
          />
        </div>

        <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            Platform level only
          </p>

          <p className="mt-1">
            This dashboard shows aggregate SaaS metrics only. Customer
            operational data — individual permits, approvals, requests and
            attachments — is not exposed at platform level, and no
            operational permit actions are available here.
          </p>
        </div>
      </div>
    </DashboardShell>
  )
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  tone = 'muted',
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  tone?: 'muted' | 'green' | 'orange' | 'blue' | 'red'
}) {
  const tones: Record<string, string> = {
    muted: 'bg-muted/40 text-muted-foreground',
    green:
      'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    orange:
      'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  }

  return (
    <div className="rounded-xl border bg-background p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {title}
        </p>

        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${tones[tone]}`}
        >
          {icon}
        </span>
      </div>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>

      {subtitle ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

function formatStorageBytes(bytes: number): string {
  const gb = 1024 ** 3
  const mb = 1024 ** 2
  const kb = 1024

  if (bytes >= gb) return `${(bytes / gb).toFixed(2)} GB`
  if (bytes >= mb) return `${(bytes / mb).toFixed(1)} MB`
  if (bytes >= kb) return `${(bytes / kb).toFixed(1)} KB`
  return `${bytes} B`
}

