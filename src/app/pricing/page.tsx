import Link from 'next/link'
import { redirect } from 'next/navigation'
import { 
  Check, 
  Minus, 
  Sparkles, 
  Shield, 
  Building2, 
  Users, 
  FileCheck, 
  Database, 
  Clock, 
  ChevronRight,
  Star,
  Zap,
  Crown,
  ArrowRight,
  BadgeCheck,
  Info
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCompanyPlan, type Plan } from '@/lib/entitlements'
import { formatBytes, formatLimit, formatPrice } from '@/lib/entitlements/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type ComparisonRow = {
  label: string
  free: string
  pro: string
  category?: 'limits' | 'features'
}

function planRow(plan: Plan, key: keyof Plan): string {
  const value = plan[key]
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === null) return 'Unlimited'
  if (key === 'max_storage_bytes') return formatBytes(Number(value))
  return String(value)
}

function retentionLabel(plan: Plan | undefined): string {
  if (!plan) return '—'
  const years = plan.max_history_years
  if (years == null) return 'Unlimited'
  return `${years} ${years === 1 ? 'year' : 'years'}`
}

export default async function PricingPage() {
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

  const admin = createAdminClient()

  const { data: plans } = await admin
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  const freePlan = plans?.find((p) => p.code === 'free')
  const proPlan = plans?.find((p) => p.code === 'pro')

  let currentPlanCode: string | null = null

  if (profile?.company_id) {
    const current = await getCompanyPlan(admin, profile.company_id)
    currentPlanCode = current.code
  }

  const limitRows: ComparisonRow[] = [
    { label: 'Sites', free: planRow(freePlan, 'max_sites'), pro: planRow(proPlan, 'max_sites'), category: 'limits' },
    { label: 'Safety Managers', free: planRow(freePlan, 'max_safety_managers'), pro: planRow(proPlan, 'max_safety_managers'), category: 'limits' },
    { label: 'Safety Coordinators', free: planRow(freePlan, 'max_safety_coordinators'), pro: planRow(proPlan, 'max_safety_coordinators'), category: 'limits' },
    { label: 'Internal Staff', free: planRow(freePlan, 'max_internal_staff'), pro: planRow(proPlan, 'max_internal_staff'), category: 'limits' },
    { label: 'PTWs per calendar month', free: planRow(freePlan, 'max_monthly_permits'), pro: planRow(proPlan, 'max_monthly_permits'), category: 'limits' },
    { label: 'Active PTWs at one time', free: planRow(freePlan, 'max_active_permits'), pro: planRow(proPlan, 'max_active_permits'), category: 'limits' },
    { label: 'Attachment storage', free: planRow(freePlan, 'max_storage_bytes'), pro: planRow(proPlan, 'max_storage_bytes'), category: 'limits' },
    { label: 'Permit history retention', free: retentionLabel(freePlan), pro: retentionLabel(proPlan), category: 'limits' },
  ]

  const featureRows: ComparisonRow[] = [
    { label: 'JHA / JSA', free: planRow(freePlan, 'feature_jha'), pro: planRow(proPlan, 'feature_jha'), category: 'features' },
    { label: 'LOTO', free: planRow(freePlan, 'feature_loto'), pro: planRow(proPlan, 'feature_loto'), category: 'features' },
    { label: 'Gas Testing', free: planRow(freePlan, 'feature_gas_testing'), pro: planRow(proPlan, 'feature_gas_testing'), category: 'features' },
    { label: 'Safety Controls', free: 'Yes', pro: 'Yes', category: 'features' },
    { label: 'Contractor PTW', free: planRow(freePlan, 'feature_contractor_ptw'), pro: planRow(proPlan, 'feature_contractor_ptw'), category: 'features' },
    { label: 'Basic Dashboard', free: 'Yes', pro: 'Yes', category: 'features' },
    { label: 'Basic Reports', free: planRow(freePlan, 'feature_basic_reports'), pro: planRow(proPlan, 'feature_basic_reports'), category: 'features' },
    { label: 'Basic Notifications', free: planRow(freePlan, 'feature_notifications'), pro: planRow(proPlan, 'feature_notifications'), category: 'features' },
    { label: 'Printable Permit', free: planRow(freePlan, 'feature_printable_permit'), pro: planRow(proPlan, 'feature_printable_permit'), category: 'features' },
  ]

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-12">
        {/* Header */}
        <div className="text-center">
          <Badge variant="secondary" className="mb-4">
            <Sparkles className="mr-2 h-3 w-3" />
            Flexible Plans for Every Team
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            Simple, Transparent Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            Core safety functionality — PTW, JHA/JSA, LOTO, gas testing,
            safety controls, audit history and printable permits — is
            available on every plan. Plans differ in scale and advanced
            capabilities.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-8 md:grid-cols-2">
          {[freePlan, proPlan]
            .filter((plan): plan is Plan => Boolean(plan))
            .map((plan) => {
              const isCurrent = currentPlanCode === plan.code
              const isPro = plan.code === 'pro'
              
              return (
                <Card
                  key={plan.code}
                  className={cn(
                    "relative overflow-hidden transition-all duration-300",
                    isPro 
                      ? "border-blue-200 shadow-2xl shadow-blue-100/50 dark:border-blue-800 dark:shadow-blue-900/20" 
                      : "hover:shadow-lg",
                    isCurrent && "ring-2 ring-green-500/50"
                  )}
                >
                  {isPro && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2">
                      <Badge className="rounded-t-none rounded-b-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                        <Crown className="mr-1 h-3 w-3" />
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <CardHeader className={cn("pb-6", isPro && "pt-10")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "rounded-xl p-3",
                          isPro 
                            ? "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/20" 
                            : "bg-gray-100 dark:bg-gray-800"
                        )}>
                          {isPro ? (
                            <Zap className="h-6 w-6 text-white" />
                          ) : (
                            <Shield className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-2xl">
                            {plan.name}
                          </CardTitle>
                          {isCurrent && (
                            <Badge variant="success" className="mt-1">
                              <BadgeCheck className="mr-1 h-3 w-3" />
                              Current Plan
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-gray-900 dark:text-white">
                          {formatPrice(plan.price_monthly, plan.currency)}
                        </span>
                        <span className="text-lg text-gray-500 dark:text-gray-400">
                          /month
                        </span>
                      </div>
                      {isPro && (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Billed monthly · Cancel anytime
                        </p>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent>
                    <Separator className="mb-6" />

                    <div className="space-y-4">
                      <PlanFeature icon={Building2} label="Sites" value={formatLimit(plan.max_sites)} />
                      <PlanFeature icon={FileCheck} label="Monthly PTWs" value={formatLimit(plan.max_monthly_permits)} />
                      <PlanFeature icon={FileCheck} label="Active PTWs" value={formatLimit(plan.max_active_permits)} />
                      <PlanFeature icon={Database} label="Storage" value={formatBytes(plan.max_storage_bytes)} />
                      <PlanFeature icon={Clock} label="History retention" value={retentionLabel(plan)} />
                    </div>

                    <div className="mt-8">
                      {plan.code === 'pro' ? (
                        <>
                          {isCurrent ? (
                            <Link
                              href="/settings/subscription"
                              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              View Subscription
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          ) : (
                            <Link
                              href="/settings/subscription"
                              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-700/30"
                            >
                              Upgrade to Pro
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          )}
                          <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                            Online payment coming soon
                          </p>
                        </>
                      ) : (
                        <div className="rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-800">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Your Current Plan
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Free forever for small teams
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
        </div>

        {/* Comparison Tables */}
        <div className="space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Compare Plans in Detail
            </h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              See what's included in each plan
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                Plan Limits
              </CardTitle>
              <CardDescription>
                Capacity and usage limits for each plan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComparisonTable
                rows={limitRows}
                freeLabel={freePlan?.name ?? 'Free'}
                proLabel={proPlan?.name ?? 'Pro'}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-blue-600" />
                Features
              </CardTitle>
              <CardDescription>
                Available features and capabilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComparisonTable
                rows={featureRows}
                freeLabel={freePlan?.name ?? 'Free'}
                proLabel={proPlan?.name ?? 'Pro'}
              />
            </CardContent>
          </Card>
        </div>

        {/* FAQ / Help Section */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 p-8 dark:from-gray-800 dark:to-gray-800">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Need Help Choosing a Plan?
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Contact our team for a personalized recommendation
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-blue-600 shadow-sm transition-colors hover:bg-blue-50 dark:bg-gray-700 dark:text-blue-400 dark:hover:bg-gray-600"
            >
              Contact Sales
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}

function PlanFeature({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
          <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function ComparisonTable({
  rows,
  freeLabel,
  proLabel,
}: {
  rows: ComparisonRow[]
  freeLabel: string
  proLabel: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">
              Capability
            </th>
            <th className="px-6 py-4 text-center font-medium text-gray-900 dark:text-white">
              {freeLabel}
            </th>
            <th className="px-6 py-4 text-center font-medium text-blue-600 dark:text-blue-400">
              {proLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr 
              key={row.label} 
              className={cn(
                "transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50",
                index !== rows.length - 1 && "border-b border-gray-100 dark:border-gray-800"
              )}
            >
              <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                {row.label}
              </td>
              <td className="px-6 py-4 text-center">
                <ValueCell value={row.free} />
              </td>
              <td className="px-6 py-4 text-center">
                <ValueCell value={row.pro} highlight />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ValueCell({ value, highlight }: { value: string; highlight?: boolean }) {
  const yes = value === 'Yes'
  const no = value === 'No'
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5",
      highlight && "font-medium text-gray-900 dark:text-white"
    )}>
      {yes ? (
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ) : no ? (
        <Minus className="h-4 w-4 text-gray-400 dark:text-gray-600" />
      ) : (
        <Info className="h-4 w-4 text-gray-400 dark:text-gray-600" />
      )}
      {value}
    </span>
  )
}