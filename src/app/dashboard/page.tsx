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
  Plus,
  ArrowRight,
  TrendingUp,
  Activity,
  Shield,
  ChevronRight,
  Info,
  Zap,
  BarChart3
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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'

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

  // Calculate completion percentage for dashboard
  const totalActive = counts.active ?? 0
  const totalCompleted = (counts.completed ?? 0) + (counts.closed ?? 0)
  const totalProcessed = totalActive + totalCompleted
  const completionRate = totalProcessed > 0 
    ? Math.round((totalCompleted / totalProcessed) * 100)
    : 0

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-7">
        {/* Setup Alert */}
        {needsSetup && (
          <div className="flex flex-col gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  Complete your company setup
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Add permit types and safety controls so your team can start creating permits.
                </p>
              </div>
            </div>
            <Link
              href="/settings"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Go to Settings
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {profile?.full_name
                ? `Welcome, ${profile.full_name.split(' ')[0]}`
                : 'Dashboard'}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Overview of your permit-to-work activity
            </p>
          </div>

          <Link
            href="/permits/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-blue-700/30"
          >
            <Plus className="h-4 w-4" />
            Create Permit
          </Link>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Pending Approval"
            value={counts.pending_approval ?? 0}
            href="/permits?status=pending_approval"
            icon={<ClipboardList className="h-4 w-4" />}
            tone="yellow"
            description="Awaiting review"
          />
          <DashboardCard
            title="Active"
            value={counts.active ?? 0}
            href="/permits?status=active"
            icon={<PlayCircle className="h-4 w-4" />}
            tone="green"
            description="In progress"
          />
          <DashboardCard
            title="Expiring Soon"
            value={counts.expiring_soon ?? 0}
            href="/permits?status=active&expiry=expiring_soon"
            icon={<Clock className="h-4 w-4" />}
            tone="orange"
            description="Within 24 hours"
          />
          <DashboardCard
            title="Completion Rate"
            value={`${completionRate}%`}
            href="/permits?status=completed"
            icon={<TrendingUp className="h-4 w-4" />}
            tone="blue"
            description="Completed vs active"
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Draft"
            value={counts.draft ?? 0}
            href="/permits?status=draft"
            icon={<FileText className="h-4 w-4" />}
            tone="muted"
          />
          <DashboardCard
            title="Suspended"
            value={counts.suspended ?? 0}
            href="/permits?status=suspended"
            icon={<PauseCircle className="h-4 w-4" />}
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
            title="Completed"
            value={counts.completed ?? 0}
            href="/permits?status=completed"
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="gray"
          />
        </div>

        {/* Recent Permits */}
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Permits</CardTitle>
                <CardDescription>
                  Latest permit-to-work applications
                </CardDescription>
              </div>
              <Link
                href="/permits"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentPermits.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                  <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                  No Permits Yet
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Create your first permit-to-work application to get started.
                </p>
                <Link
                  href="/permits/new"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  {profile?.role === 'contractor_admin'
                    ? 'Create Contractor PTW'
                    : 'Create Permit'}
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {recentPermits.map((permit) => (
                  <Link
                    key={permit.id}
                    href={`/permits/${permit.id}`}
                    className="group flex items-center justify-between p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <div className="flex flex-1 items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-blue-600 group-hover:underline dark:text-blue-400">
                            {permit.permit_no}
                          </p>
                          <StatusBadge
                            status={permit.status}
                            expiry={getExpiryState(
                              permit.status,
                              permit.valid_until,
                              permit.planned_end
                            )}
                          />
                        </div>
                        <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                          {permit.work_title}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span>{permit.permit_type?.name ?? '—'}</span>
                          <span>•</span>
                          <span>{permit.requester?.full_name ?? '—'}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid gap-4 sm:grid-cols-3">
          <QuickLinkCard
            href="/permits/active"
            icon={<Activity className="h-5 w-5 text-green-600 dark:text-green-400" />}
            title="Active Permits"
            description="View permits in progress"
          />
          <QuickLinkCard
            href="/permits/history"
            icon={<Archive className="h-5 w-5 text-gray-600 dark:text-gray-400" />}
            title="Permit History"
            description="Review past permits"
          />
          <QuickLinkCard
            href="/permits/suspended"
            icon={<PauseCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />}
            title="Suspended Permits"
            description="View stopped work"
          />
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
  description,
}: {
  title: string
  value: number | string
  href: string
  icon: React.ReactNode
  tone: 'muted' | 'yellow' | 'green' | 'orange' | 'gray' | 'red' | 'blue'
  description?: string
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
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  }

  return (
    <Link
      href={href}
      className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
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
      <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>
      {description && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
    </Link>
  )
}

function QuickLinkCard({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-700">
        {icon}
      </div>
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{title}</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
      <ChevronRight className="ml-auto h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Platform / SaaS admin dashboard (platform_admin role only).
// ---------------------------------------------------------------------------
async function PlatformAdminDashboard() {
  const supabase = await createClient()

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

  const subscriptionRows = (
    activeSubscriptionsWithPlansResult.data ?? []
  ) as unknown as ActiveSubscriptionWithPlan[]

  const proSubscriptions = subscriptionRows.filter(
    (sub) => sub.plan?.code === 'pro'
  )

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
      <div className="mx-auto max-w-7xl space-y-7">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Platform Admin
              </h1>
              <Badge variant="info">
                <Zap className="mr-1 h-3 w-3" />
                ePTW SaaS
              </Badge>
            </div>
            <p className="mt-2 text-muted-foreground">
              Platform-level aggregate metrics across all companies
            </p>
          </div>
        </div>

        {/* Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Platform Metrics Only
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Customer operational data is not shown at platform level.
            </p>
          </div>
        </div>

        {/* Key Metrics */}
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
            title="Monthly PTWs"
            value={monthlyPtws}
            subtitle="Permits created this month"
            icon={<FileText className="h-4 w-4" />}
            tone="orange"
          />
          <MetricCard
            title="Active Users"
            value={activeUsers}
            subtitle="Excluding platform admins"
            icon={<Users className="h-4 w-4" />}
            tone="green"
          />
        </div>

        {/* Revenue Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Free Companies"
            value={freeCompanies}
            subtitle="Includes no active subscription"
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
            title="MRR"
            value={`MYR ${monthlyRecurringRevenue.toFixed(2)}`}
            subtitle="Active Pro subscriptions"
            icon={<Banknote className="h-4 w-4" />}
            tone="green"
          />
        </div>

        {/* Additional Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Pro Subscription Count"
            value={proSubscriptionCount}
            icon={<Repeat className="h-4 w-4" />}
            tone="blue"
          />
          <MetricCard
            title="Storage Usage"
            value={formatStorageBytes(storageBytes)}
            subtitle="Permit attachment sizes"
            icon={<HardDrive className="h-4 w-4" />}
            tone="muted"
          />
          <MetricCard
            title="Failed Payments"
            value={failedPayments}
            icon={<XCircle className="h-4 w-4" />}
            tone="red"
          />
        </div>

        {/* Info Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Platform Level Only
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  This dashboard shows aggregate SaaS metrics only. Customer operational data — individual permits, approvals, requests and attachments — is not exposed at platform level, and no operational permit actions are available here.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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
      <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>
      {subtitle ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
