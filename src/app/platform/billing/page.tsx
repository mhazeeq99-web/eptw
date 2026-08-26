import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BarChart3,
  CreditCard,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import {
  formatBytes,
  formatLimit,
  formatPrice,
} from '@/lib/entitlements/format'

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
}> = [
  {
    id: 'plans',
    label: 'Plans',
    href: '/platform/billing?tab=plans',
    icon: CreditCard,
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    href: '/platform/billing?tab=subscriptions',
    icon: Receipt,
  },
  {
    id: 'payments',
    label: 'Payments',
    href: '/platform/billing?tab=payments',
    icon: BarChart3,
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
      <div className="mx-auto max-w-6xl space-y-6">
        <BackButton href="/dashboard" label="Back to Platform" />

        <header>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="mt-2 text-muted-foreground">
            Read-only platform view of plans, company subscriptions and
            payments.
          </p>
        </header>

        <TabBar active={tab} />

        {tab === 'plans' && <PlansSection supabase={supabase} />}
        {tab === 'subscriptions' && (
          <SubscriptionsSection supabase={supabase} />
        )}
        {tab === 'payments' && <PaymentsSection supabase={supabase} />}
      </div>
    </DashboardShell>
  )
}

/**
 * Tab bar driven by the `?tab=` query param. Rendered as `next/link`s
 * (server-compatible — no client JS required), active state derived from
 * the awaited searchParams.
 */
function TabBar({ active }: { active: BillingTab }) {
  return (
    <div
      role="tablist"
      aria-label="Billing sections"
      className="inline-flex flex-wrap items-center gap-1 rounded-xl border bg-background p-1"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === active
        return (
          <Link
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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

async function PlansSection({
  supabase,
}: {
  supabase: SupabaseClient
}) {
  // Pricing and limits come from the database — never hardcoded here.
  const { data: plans } = await supabase
    .from('plans')
    .select(
      'code, name, price_monthly, currency, is_active, max_sites, max_total_users, max_monthly_permits, max_active_permits, max_storage_bytes, feature_jha, feature_loto, feature_gas_testing, feature_contractor_ptw, feature_basic_reports, feature_advanced_reports, feature_advanced_analytics, feature_notifications, feature_printable_permit'
    )
    .order('price_monthly', { ascending: true })

  const rows = (plans ?? []) as PlanRow[]

  return (
    <section className="overflow-hidden rounded-xl border bg-background">
      <div className="border-b px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          Plans
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pricing and entitlements, as configured in the database.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-6 py-4 text-sm text-muted-foreground">
          No plans found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Code</th>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Price / month</th>
                <th className="px-6 py-3 font-medium">Currency</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Max sites</th>
                <th className="px-6 py-3 font-medium">Max users</th>
                <th className="px-6 py-3 font-medium">Monthly permits</th>
                <th className="px-6 py-3 font-medium">Active permits</th>
                <th className="px-6 py-3 font-medium">Storage</th>
                <th className="px-6 py-3 font-medium">Features</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((plan) => {
                const features = enabledFeatures(plan)
                return (
                  <tr
                    key={plan.code}
                    className="border-b last:border-0"
                  >
                    <td className="px-6 py-3 font-mono text-xs">
                      {plan.code}
                    </td>
                    <td className="px-6 py-3 font-medium">
                      {plan.name}
                    </td>
                    <td className="px-6 py-3">
                      {formatPrice(plan.price_monthly, plan.currency)}
                    </td>
                    <td className="px-6 py-3">{plan.currency}</td>
                    <td className="px-6 py-3">
                      <StatusBadge
                        tone={plan.is_active ? 'emerald' : 'muted'}
                        status={plan.is_active ? 'Active' : 'Inactive'}
                      />
                    </td>
                    <td className="px-6 py-3">
                      {formatLimit(plan.max_sites)}
                    </td>
                    <td className="px-6 py-3">
                      {formatLimit(plan.max_total_users)}
                    </td>
                    <td className="px-6 py-3">
                      {formatLimit(plan.max_monthly_permits)}
                    </td>
                    <td className="px-6 py-3">
                      {formatLimit(plan.max_active_permits)}
                    </td>
                    <td className="px-6 py-3">
                      {formatBytes(Number(plan.max_storage_bytes))}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className="block max-w-[280px] truncate text-xs text-muted-foreground"
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
      )}
    </section>
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
    <section className="overflow-hidden rounded-xl border bg-background">
      <div className="border-b px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          Subscriptions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Company subscriptions with their plan and billing period.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-6 py-4 text-sm text-muted-foreground">
          No subscriptions yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Company</th>
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Period start</th>
                <th className="px-6 py-3 font-medium">Period end</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((subscription) => (
                <tr
                  key={subscription.id}
                  className="border-b last:border-0"
                >
                  <td className="px-6 py-3">
                    <span className="block font-medium">
                      {subscription.companies?.name ?? '—'}
                    </span>
                    {subscription.companies?.code && (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {subscription.companies.code}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 font-mono text-xs">
                    {subscription.plans?.code ?? '—'}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge
                      tone={
                        SUBSCRIPTION_TONES[subscription.status] ??
                        'muted'
                      }
                      status={subscription.status}
                    />
                  </td>
                  <td className="px-6 py-3">
                    {formatDate(subscription.current_period_start)}
                  </td>
                  <td className="px-6 py-3">
                    {formatDate(subscription.current_period_end)}
                  </td>
                  <td className="px-6 py-3">
                    {formatDate(subscription.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
    <section className="overflow-hidden rounded-xl border bg-background">
      <div className="border-b px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Payments
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Payment history per company. Failed payments are highlighted.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-6 py-4 text-sm text-muted-foreground">
          No payments yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Company</th>
                <th className="px-6 py-3 font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Currency</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Provider payment ID</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <tr
                  key={payment.id}
                  className={`border-b last:border-0 ${
                    payment.status === 'failed' ? 'bg-red-500/5' : ''
                  }`}
                >
                  <td className="px-6 py-3">
                    <span className="block font-medium">
                      {payment.companies?.name ?? '—'}
                    </span>
                    {payment.companies?.code && (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {payment.companies.code}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 font-medium">
                    {Number(payment.amount).toFixed(2)}
                  </td>
                  <td className="px-6 py-3">{payment.currency}</td>
                  <td className="px-6 py-3">
                    <StatusBadge
                      tone={PAYMENT_TONES[payment.status] ?? 'muted'}
                      status={payment.status}
                    />
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                    {payment.provider_payment_id ?? '—'}
                  </td>
                  <td className="px-6 py-3">
                    {formatDate(payment.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
    emerald: 'bg-emerald-600/10 text-emerald-700',
    amber: 'bg-amber-600/10 text-amber-700',
    red: 'bg-red-600/10 text-red-700',
    muted: 'bg-muted text-muted-foreground',
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
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
