import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BarChart3,
  CreditCard,
  Receipt,
  type LucideIcon,
  Info,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Layers,
  Star
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import {
  formatBytes,
  formatLimit,
  formatPrice,
} from '@/lib/entitlements/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Platform billing — read-only management view for platform admins.
 *
 * All data comes straight from the database (`plans`,
 * `company_subscriptions`, `payments` joined to `companies`). No payment
 * provider credentials, card numbers or HitPay secrets are ever selected
 * or rendered here. Only Platform Admin role users may access the page.
 */

type BillingTab = 'plans' | 'subscriptions' | 'payments'

type PlanRow = {
  code: string
  name: string
  price_monthly: number
  currency: string
  is_active: boolean
  max_sites: number
  max_total_users: number
  max_monthly_permits: number | null
  max_active_permits: number | null
  max_storage_bytes: number
  feature_jha: boolean
  feature_loto: boolean
  feature_gas_testing: boolean
  feature_contractor_ptw: boolean
  feature_basic_reports: boolean
  feature_advanced_reports: boolean
  feature_advanced_analytics: boolean
  feature_notifications: boolean
  feature_printable_permit: boolean
}

type SubscriptionRow = {
  id: number
  status: string
  current_period_start: string | null
  current_period_end: string | null
  created_at: string
  companies: { name: string; code: string | null } | null
  plans: { code: string } | null
}

type PaymentRow = {
  id: number
  amount: number
  currency: string
  status: string
  provider_payment_id: string | null
  created_at: string
  companies: { name: string; code: string | null } | null
}

type BadgeTone = 'emerald' | 'amber' | 'red' | 'muted'

const TABS: Array<{
  id: BillingTab
  label: string
  href: string
  icon: LucideIcon
  description: string
}> = [
  {
    id: 'plans',
    label: 'Plans',
    href: '/platform/billing?tab=plans',
    icon: CreditCard,
    description: 'Pricing and entitlements',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    href: '/platform/billing?tab=subscriptions',
    icon: Receipt,
    description: 'Company subscription status',
  },
  {
    id: 'payments',
    label: 'Payments',
    href: '/platform/billing?tab=payments',
    icon: BarChart3,
    description: 'Payment history',
  },
]

const FEATURE_LABELS: Array<[keyof PlanRow, string]> = [
  ['feature_jha', 'JHA / JSA'],
  ['feature_loto', 'LOTO'],
  ['feature_gas_testing', 'Gas testing'],
  ['feature_contractor_ptw', 'Contractor PTW'],
  ['feature_basic_reports', 'Basic reports'],
  ['feature_advanced_reports', 'Advanced reports'],
  ['feature_advanced_analytics', 'Advanced analytics'],
  ['feature_notifications', 'Notifications'],
  ['feature_printable_permit', 'Printable permit'],
]

const SUBSCRIPTION_TONES: Record<string, BadgeTone> = {
  active: 'emerald',
  pending: 'amber',
  cancelled: 'muted',
  expired: 'muted',
}

const PAYMENT_TONES: Record<string, BadgeTone> = {
  succeeded: 'emerald',
  pending: 'amber',
  failed: 'red',
  refunded: 'muted',
}

export default async function PlatformBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (
    profile?.role !== 'platform_admin' ||
    profile?.is_active === false
  ) {
    redirect('/dashboard')
  }

  const params = await searchParams
  const tab = normalizeTab(params.tab)

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/dashboard" label="Back to Platform" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <CreditCard className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Billing
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Read-only platform view of plans, subscriptions and payments
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <DollarSign className="mr-1 h-3 w-3" />
            Platform Billing
          </Badge>
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Read-Only View
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              All data is read-only. No payment provider credentials, card numbers or secrets are displayed here.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <Card>
          <CardContent className="p-2">
            <div
              role="tablist"
              aria-label="Billing sections"
              className="grid gap-2 sm:grid-cols-3"
            >
              {TABS.map((tabItem) => {
                const Icon = tabItem.icon
                const isActive = tabItem.id === tab
                return (
                  <Link
                    key={tabItem.id}
                    href={tabItem.href}
                    role="tab"
                    aria-selected={isActive}
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

        {/* Tab Content */}
        {tab === 'plans' && <PlansSection supabase={supabase} />}
        {tab === 'subscriptions' && (
          <SubscriptionsSection supabase={supabase} />
        )}
        {tab === 'payments' && <PaymentsSection supabase={supabase} />}
      </div>
    </DashboardShell>
  )
}

async function PlansSection({
  supabase,
}: {
  supabase: SupabaseClient
}) {
  const { data: plans } = await supabase
    .from('plans')
    .select(
      'code, name, price_monthly, currency, is_active, max_sites, max_total_users, max_monthly_permits, max_active_permits, max_storage_bytes, feature_jha, feature_loto, feature_gas_testing, feature_contractor_ptw, feature_basic_reports, feature_advanced_reports, feature_advanced_analytics, feature_notifications, feature_printable_permit'
    )
    .order('price_monthly', { ascending: true })

  const rows = (plans ?? []) as PlanRow[]

  return (
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Plans
        </CardTitle>
        <CardDescription>
          Pricing and entitlements, as configured in the database
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
            No plans found.
          </p>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Code</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Name</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Price / month</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Currency</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Status</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Max sites</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Max users</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Monthly permits</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Active permits</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Storage</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Features</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((plan) => {
                    const features = enabledFeatures(plan)
                    return (
                      <tr
                        key={plan.code}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-6 py-4 font-mono text-xs text-gray-900 dark:text-white">
                          {plan.code}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                          {plan.name}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                          {formatPrice(plan.price_monthly, plan.currency)}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{plan.currency}</td>
                        <td className="px-6 py-4">
                          <StatusBadge
                            tone={plan.is_active ? 'emerald' : 'muted'}
                            status={plan.is_active ? 'Active' : 'Inactive'}
                          />
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {formatLimit(plan.max_sites)}
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {formatLimit(plan.max_total_users)}
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {formatLimit(plan.max_monthly_permits)}
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {formatLimit(plan.max_active_permits)}
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {formatBytes(Number(plan.max_storage_bytes))}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="block max-w-[280px] truncate text-xs text-gray-500 dark:text-gray-400"
                            title={features.join(' · ')}
                          >
                            {features.join(' · ') || '—'}
                          </span>
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
  )
}

async function SubscriptionsSection({
  supabase,
}: {
  supabase: SupabaseClient
}) {
  const { data: subscriptions } = await supabase
    .from('company_subscriptions')
    .select(
      'id, status, current_period_start, current_period_end, created_at, companies(name, code), plans(code)'
    )
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (subscriptions ?? []) as unknown as SubscriptionRow[]

  return (
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Subscriptions
        </CardTitle>
        <CardDescription>
          Company subscriptions with their plan and billing period
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
            No subscriptions yet.
          </p>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Company</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Plan</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Status</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Period start</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Period end</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((subscription) => (
                    <tr
                      key={subscription.id}
                      className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          <div>
                            <span className="block font-medium text-gray-900 dark:text-white">
                              {subscription.companies?.name ?? '—'}
                            </span>
                            {subscription.companies?.code && (
                              <span className="block font-mono text-xs text-gray-500 dark:text-gray-400">
                                {subscription.companies.code}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="secondary">
                          <Star className="mr-1 h-3 w-3" />
                          {subscription.plans?.code ?? '—'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge
                          tone={
                            SUBSCRIPTION_TONES[subscription.status] ??
                            'muted'
                          }
                          status={subscription.status}
                        />
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                        {formatDate(subscription.current_period_start)}
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                        {formatDate(subscription.current_period_end)}
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                        {formatDate(subscription.created_at)}
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
  )
}

async function PaymentsSection({
  supabase,
}: {
  supabase: SupabaseClient
}) {
  const { data: payments } = await supabase
    .from('payments')
    .select(
      'id, amount, currency, status, provider_payment_id, created_at, companies(name, code)'
    )
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (payments ?? []) as unknown as PaymentRow[]

  return (
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Payments
        </CardTitle>
        <CardDescription>
          Payment history per company. Failed payments are highlighted
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
            No payments yet.
          </p>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Company</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Currency</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Status</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Provider payment ID</th>
                    <th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((payment) => (
                    <tr
                      key={payment.id}
                      className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                        payment.status === 'failed' ? 'bg-red-50/50 dark:bg-red-900/10' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          <div>
                            <span className="block font-medium text-gray-900 dark:text-white">
                              {payment.companies?.name ?? '—'}
                            </span>
                            {payment.companies?.code && (
                              <span className="block font-mono text-xs text-gray-500 dark:text-gray-400">
                                {payment.companies.code}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                        {Number(payment.amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{payment.currency}</td>
                      <td className="px-6 py-4">
                        <StatusBadge
                          tone={PAYMENT_TONES[payment.status] ?? 'muted'}
                          status={payment.status}
                        />
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {payment.provider_payment_id ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                        {formatDate(payment.created_at)}
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
  )
}

function StatusBadge({
  status,
  tone,
}: {
  status: string
  tone: BadgeTone
}) {
  const tones: Record<BadgeTone, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    muted: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  }
  
  const icons = {
    emerald: CheckCircle2,
    amber: AlertTriangle,
    red: AlertTriangle,
    muted: Info,
  }
  
  const Icon = icons[tone]
  
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  )
}

function enabledFeatures(plan: PlanRow): string[] {
  return FEATURE_LABELS.filter(
    ([key]) => plan[key] === true
  ).map(([, label]) => label)
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

function normalizeTab(value: string | string[] | undefined): BillingTab {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'subscriptions' || raw === 'payments'
    ? raw
    : 'plans'
}