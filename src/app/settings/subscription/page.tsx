import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Building2, Gauge, ReceiptText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BillingActions, PaymentStatusNotice } from '@/components/billing/billing-actions'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCompanyEntitlements,
  type Entitlements,
} from '@/lib/entitlements'
import { getCompanySubscription } from '@/lib/billing'
import { formatBytes, formatPrice } from '@/lib/entitlements/format'
import { BackButton } from '@/components/ui/back-button'

type UsageRow = {
  label: string
  usage: number
  limit: number | null
  detail?: string
  /** Noun used in limit notes, e.g. "2 permits remaining this month". */
  noun: string
  /** Optional qualifier appended to the noun in limit notes. */
  scope?: string
}

function buildUsageRows(entitlements: Entitlements): UsageRow[] {
  const { plan, usage } = entitlements
  return [
    {
      label: 'PTWs this month',
      usage: usage.monthlyPermits,
      limit: plan.max_monthly_permits,
      noun: 'permits',
      scope: 'this month',
    },
    {
      label: 'Active PTWs',
      usage: usage.activePermits,
      limit: plan.max_active_permits,
      noun: 'active permits',
    },
    {
      label: 'Users',
      usage: usage.users.total,
      limit: plan.max_total_users,
      noun: 'user seats',
      detail: [
        `${usage.users.safety_manager} / ${plan.max_safety_managers} Safety Managers`,
        `${usage.users.safety_coordinator} / ${plan.max_safety_coordinators} Safety Coordinators`,
        `${usage.users.internal_staff} / ${plan.max_internal_staff} Internal Staff`,
      ].join(' · '),
    },
    {
      label: 'Storage',
      usage: usage.storageBytes,
      limit: plan.max_storage_bytes,
      noun: 'storage',
    },
    {
      label: 'Sites',
      usage: usage.sites,
      limit: plan.max_sites,
      noun: 'sites',
      detail:
        'Multi-site management is a future feature.',
    },
  ]
}

type PaymentRow = {
  id: number
  amount: string
  currency: string
  status: string
  paid_at: string | null
  created_at: string
}

export default async function SubscriptionPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return (
      <DashboardShell>
        <div className="max-w-3xl">
          <div className="mb-6">
            <BackButton href="/settings" label="Back to Settings" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight">
            Subscription
          </h1>
          <p className="mt-2 text-muted-foreground">
            Subscriptions belong to companies. Your account is not
            assigned to a company, so there is no company plan to show.
          </p>
        </div>
      </DashboardShell>
    )
  }

  const admin = createAdminClient()
  const entitlements = await getCompanyEntitlements(
    admin,
    profile.company_id
  )
  const subscription = await getCompanySubscription(
    admin,
    profile.company_id
  )

  const { plan } = entitlements
  const rows = buildUsageRows(entitlements)
  const isPro = plan.code === 'pro'

  const { data: payments } = await admin
    .from('payments')
    .select(
      'id, amount, currency, status, paid_at, created_at'
    )
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(50)

  const pending = subscription?.status === 'pending'
  const cancelledOrExpired =
    subscription != null &&
    (subscription.status === 'cancelled' ||
      subscription.status === 'expired')

  return (
    <DashboardShell>
      <div className="max-w-3xl space-y-6">
        <BackButton href="/settings" label="Back to Settings" />

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Subscription
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your company&apos;s plan, usage and billing.
          </p>
        </div>

        <Suspense fallback={null}>
          <PaymentStatusNotice />
        </Suspense>

        <div className="rounded-xl border bg-background p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md border p-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">
                    {plan.name}
                  </h2>
                  {isPro && (
                    <span className="rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-medium text-emerald-700">
                      Active
                    </span>
                  )}
                  {pending && (
                    <span className="rounded-full bg-amber-600/10 px-3 py-1 text-xs font-medium text-amber-700">
                      Confirming payment…
                    </span>
                  )}
                  {cancelledOrExpired && (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      {subscription?.status}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatPrice(plan.price_monthly, plan.currency)}
                  /month
                </p>
                {subscription?.current_period_end && isPro && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Next billing date:{' '}
                    {new Date(
                      subscription.current_period_end
                    ).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            <BillingActions
              isPro={isPro}
              periodEnd={subscription?.current_period_end}
            />
          </div>

          {pending && (
            <p className="mt-4 rounded-md border bg-amber-600/5 p-3 text-sm text-muted-foreground">
              Your payment was submitted and Pro activation is being
              confirmed by the payment provider. This usually takes a
              few seconds. Refresh this page to see the latest status.
            </p>
          )}

          {!isPro && !pending && (
            <p className="mt-4 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              You&apos;re on the Free plan. Upgrade to Pro for more
              capacity: more users, unlimited permits and more storage.
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-background">
          <div className="border-b px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Gauge className="h-5 w-5 text-muted-foreground" />
              Usage
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              How your company is using the {plan.name} plan.
            </p>
          </div>
          <div className="divide-y">
            {rows.map((row) => {
              const percent = barPercent(row)
              const note = limitNote(row)

              return (
                <div key={row.label} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-medium">{row.label}</p>
                      {row.detail && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.detail}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatUsage(row)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {remainingText(row)}
                      </p>
                    </div>
                  </div>

                  {percent != null && (
                    <div
                      className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={row.limit ?? 0}
                      aria-valuenow={row.usage}
                      aria-label={row.label}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}

                  {note && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {note}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-background">
          <div className="border-b px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ReceiptText className="h-5 w-5 text-muted-foreground" />
              Payment history
            </h2>
          </div>
          {(payments ?? []).length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No payments yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments ?? []).map(
                    (payment: PaymentRow) => (
                      <tr
                        key={payment.id}
                        className="border-b last:border-0"
                      >
                        <td className="px-6 py-3">
                          {new Date(
                            payment.paid_at ??
                              payment.created_at
                          ).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3">
                          {payment.currency}{' '}
                          {Number(payment.amount).toFixed(2)}
                        </td>
                        <td className="px-6 py-3">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Plan status</p>
          <p className="mt-1">
            {isPro
              ? 'Pro entitlements are active for this company.'
              : pending
                ? 'The Pro checkout is awaiting payment confirmation.'
                : 'No paid subscription — the Free plan applies. Existing permits, users and records remain fully accessible.'}
          </p>
          {!isPro && !pending && (
            <Link
              href="/pricing"
              className="mt-2 inline-block text-sm font-medium text-primary"
            >
              Compare plans on the pricing page
            </Link>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}

function formatUsage(row: UsageRow): string {
  if (row.limit == null) {
    return formatBytesIfStorage(row.label, row.usage)
  }
  return `${formatBytesIfStorage(row.label, row.usage)} / ${formatBytesIfStorage(row.label, row.limit)}`
}

function remainingText(row: UsageRow): string {
  if (row.limit == null) return 'Unlimited'
  const remaining = Math.max(row.limit - row.usage, 0)
  return `${formatBytesIfStorage(row.label, remaining)} remaining`
}

/** Fill percentage for the progress bar, or null when there is no limit. */
function barPercent(row: UsageRow): number | null {
  if (row.limit == null || row.limit <= 0) return null
  return Math.min(100, Math.round((row.usage / row.limit) * 100))
}

/**
 * Subtle note shown only when a limit is near (>= 80% used) or reached.
 * Wording is derived entirely from the row's own usage/limit numbers.
 */
function limitNote(row: UsageRow): string | null {
  const { label, usage, limit, noun, scope } = row
  if (limit == null || limit <= 0) return null

  const pct = usage / limit
  if (pct < 0.8) return null

  const scopeText = scope ? ` ${scope}` : ''

  if (usage >= limit) {
    return `${formatBytesIfStorage(label, usage)} of ${formatBytesIfStorage(label, limit)} ${noun} used${scopeText}`
  }

  const remaining = limit - usage
  return `${formatBytesIfStorage(label, remaining)} ${noun} remaining${scopeText}`
}

function formatBytesIfStorage(
  label: string,
  value: number
): string {
  return label === 'Storage' ? formatBytes(value) : String(value)
}
