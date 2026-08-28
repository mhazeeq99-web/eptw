import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { 
  Building2, 
  Gauge, 
  ReceiptText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Star,
  Zap,
  ChevronRight,
  Info,
  CreditCard,
  TrendingUp,
  Shield
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'

type UsageRow = {
  label: string
  usage: number
  limit: number | null
  detail?: string
  noun: string
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
      detail: 'Multi-site management is a future feature.',
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

          <Card>
            <CardContent className="p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <Building2 className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
                No Company Assigned
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Subscriptions belong to companies. Your account is not assigned to a company, so there is no company plan to show.
              </p>
            </CardContent>
          </Card>
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

  // Calculate usage percentage
  const totalUsage = rows.reduce((sum, row) => {
    const percent = barPercent(row)
    return sum + (percent ?? 0)
  }, 0)
  const avgUsage = rows.length > 0 ? Math.round(totalUsage / rows.length) : 0

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <BackButton href="/settings" label="Back to Settings" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <CreditCard className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Subscription
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Your company's plan, usage and billing
                </p>
              </div>
            </div>
          </div>

          <Badge variant={isPro ? 'success' : 'secondary'} className="self-start">
            {isPro && <Star className="mr-1 h-3 w-3" />}
            {plan.name}
          </Badge>
        </div>

        <Suspense fallback={null}>
          <PaymentStatusNotice />
        </Suspense>

        {/* Current Plan Card */}
        <Card className="overflow-hidden">
          <div className={`bg-gradient-to-r ${isPro ? 'from-blue-600 to-indigo-600' : 'from-gray-600 to-gray-700'} px-6 py-8 text-white`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  {isPro ? (
                    <Zap className="h-8 w-8" />
                  ) : (
                    <Shield className="h-8 w-8" />
                  )}
                  <div>
                    <h2 className="text-2xl font-bold">
                      {plan.name} Plan
                    </h2>
                    <p className="text-lg text-white/90">
                      {formatPrice(plan.price_monthly, plan.currency)}
                      <span className="text-sm text-white/70">/month</span>
                    </p>
                  </div>
                </div>

                {subscription?.current_period_end && isPro && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-white/80">
                    <Clock className="h-4 w-4" />
                    Next billing: {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                )}
              </div>

              <BillingActions
                isPro={isPro}
                periodEnd={subscription?.current_period_end}
              />
            </div>
          </div>

          <CardContent className="p-6">
            {pending && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Payment Confirmation Pending
                  </p>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    Your payment was submitted and Pro activation is being confirmed. This usually takes a few seconds.
                  </p>
                </div>
              </div>
            )}

            {cancelledOrExpired && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Subscription {subscription?.status}
                  </p>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    Contact support to reactivate your subscription.
                  </p>
                </div>
              </div>
            )}

            {!isPro && !pending && !cancelledOrExpired && (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    You're on the Free Plan
                  </p>
                  <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                    Upgrade to Pro for more capacity: more users, unlimited permits and more storage.
                  </p>
                  <Link
                    href="/pricing"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    View Pricing
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage Card */}
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Usage
            </CardTitle>
            <CardDescription>
              How your company is using the {plan.name} plan
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {rows.map((row) => {
                const percent = barPercent(row)
                const note = limitNote(row)

                return (
                  <div key={row.label}>
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white">{row.label}</p>
                        {row.detail && (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {row.detail}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {formatUsage(row)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {remainingText(row)}
                        </p>
                      </div>
                    </div>

                    {percent != null && (
                      <div className="mt-3">
                        <Progress 
                          value={percent} 
                          className="h-2"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {percent}% used
                        </p>
                      </div>
                    )}

                    {note && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        {note}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Payment History Card */}
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(payments ?? []).length === 0 ? (
              <p className="p-6 text-sm text-gray-600 dark:text-gray-400">
                No payments yet.
              </p>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {(payments ?? []).map((payment: PaymentRow) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {payment.currency} {Number(payment.amount).toFixed(2)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {new Date(payment.paid_at ?? payment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={payment.status === 'succeeded' ? 'success' : payment.status === 'failed' ? 'destructive' : 'warning'}>
                      {payment.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plan Status Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <div className={`rounded-lg p-2 ${isPro ? 'bg-green-100 dark:bg-green-900/50' : 'bg-gray-100 dark:bg-gray-800'}`}>
                {isPro ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Info className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Plan Status</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {isPro
                    ? 'Pro entitlements are active for this company.'
                    : pending
                      ? 'The Pro checkout is awaiting payment confirmation.'
                      : 'No paid subscription — the Free plan applies. Existing permits, users and records remain fully accessible.'}
                </p>
                {!isPro && !pending && (
                  <Link
                    href="/pricing"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Compare plans
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
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

function barPercent(row: UsageRow): number | null {
  if (row.limit == null || row.limit <= 0) return null
  return Math.min(100, Math.round((row.usage / row.limit) * 100))
}

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