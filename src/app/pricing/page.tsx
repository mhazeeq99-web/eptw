import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, Minus } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCompanyPlan, type Plan } from '@/lib/entitlements'
import { formatBytes, formatLimit, formatPrice } from '@/lib/entitlements/format'

type ComparisonRow = {
  label: string
  free: string
  pro: string
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
    { label: 'Sites', free: planRow(freePlan, 'max_sites'), pro: planRow(proPlan, 'max_sites') },
    { label: 'Safety Managers', free: planRow(freePlan, 'max_safety_managers'), pro: planRow(proPlan, 'max_safety_managers') },
    { label: 'Safety Coordinators', free: planRow(freePlan, 'max_safety_coordinators'), pro: planRow(proPlan, 'max_safety_coordinators') },
    { label: 'Internal Staff', free: planRow(freePlan, 'max_internal_staff'), pro: planRow(proPlan, 'max_internal_staff') },
    { label: 'PTWs per calendar month', free: planRow(freePlan, 'max_monthly_permits'), pro: planRow(proPlan, 'max_monthly_permits') },
    { label: 'Active PTWs at one time', free: planRow(freePlan, 'max_active_permits'), pro: planRow(proPlan, 'max_active_permits') },
    { label: 'Attachment storage', free: planRow(freePlan, 'max_storage_bytes'), pro: planRow(proPlan, 'max_storage_bytes') },
    { label: 'Permit history retention', free: retentionLabel(freePlan), pro: retentionLabel(proPlan) },
  ]

  const featureRows: ComparisonRow[] = [
    { label: 'JHA / JSA', free: planRow(freePlan, 'feature_jha'), pro: planRow(proPlan, 'feature_jha') },
    { label: 'LOTO', free: planRow(freePlan, 'feature_loto'), pro: planRow(proPlan, 'feature_loto') },
    { label: 'Gas Testing', free: planRow(freePlan, 'feature_gas_testing'), pro: planRow(proPlan, 'feature_gas_testing') },
    { label: 'Safety Controls', free: 'Yes', pro: 'Yes' },
    { label: 'Contractor PTW', free: planRow(freePlan, 'feature_contractor_ptw'), pro: planRow(proPlan, 'feature_contractor_ptw') },
    { label: 'Basic Dashboard', free: 'Yes', pro: 'Yes' },
    { label: 'Basic Reports', free: planRow(freePlan, 'feature_basic_reports'), pro: planRow(proPlan, 'feature_basic_reports') },
    { label: 'Basic Notifications', free: planRow(freePlan, 'feature_notifications'), pro: planRow(proPlan, 'feature_notifications') },
    { label: 'Printable Permit', free: planRow(freePlan, 'feature_printable_permit'), pro: planRow(proPlan, 'feature_printable_permit') },
  ]

  return (
    <DashboardShell>
      <div className="max-w-4xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>
          <p className="mt-2 text-muted-foreground">
            Core safety functionality — PTW, JHA/JSA, LOTO, gas testing,
            safety controls, audit history and printable permits — is
            available on every plan. Plans differ in scale and advanced
            capabilities.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {[freePlan, proPlan]
            .filter((plan): plan is Plan => Boolean(plan))
            .map((plan) => {
              const isCurrent = currentPlanCode === plan.code
              return (
                <div
                  key={plan.code}
                  className="flex flex-col rounded-xl border bg-background p-6"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">{plan.name}</h2>
                    {isCurrent && (
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                        Current plan
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-3xl font-bold">
                    {formatPrice(plan.price_monthly, plan.currency)}
                    <span className="text-sm font-normal text-muted-foreground">
                      /month
                    </span>
                  </p>

                  <div className="mt-6 space-y-2 text-sm">
                    <Row label="Sites" value={formatLimit(plan.max_sites)} />
                    <Row label="Monthly PTWs" value={formatLimit(plan.max_monthly_permits)} />
                    <Row label="Active PTWs" value={formatLimit(plan.max_active_permits)} />
                    <Row label="Storage" value={formatBytes(plan.max_storage_bytes)} />
                    <Row label="Permit history retention" value={retentionLabel(plan)} />
                  </div>

                  {plan.code === 'pro' ? (
                    <div className="mt-6">
                      {isCurrent ? (
                        <Link
                          href="/settings/subscription"
                          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        >
                          View Subscription
                        </Link>
                      ) : (
                        <Link
                          href="/settings/subscription"
                          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        >
                          Upgrade to Pro
                        </Link>
                      )}
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        Online payment coming soon.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-6 rounded-md border p-3 text-center text-sm text-muted-foreground">
                      Your current plan
                    </p>
                  )}
                </div>
              )
            })}
        </div>

        <section className="rounded-xl border bg-background">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">Plan limits</h2>
          </div>
          <ComparisonTable
            rows={limitRows}
            freeLabel={freePlan?.name ?? 'Free'}
            proLabel={proPlan?.name ?? 'Pro'}
          />
        </section>

        <section className="rounded-xl border bg-background">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">Features</h2>
          </div>
          <ComparisonTable
            rows={featureRows}
            freeLabel={freePlan?.name ?? 'Free'}
            proLabel={proPlan?.name ?? 'Pro'}
          />
        </section>
      </div>
    </DashboardShell>
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
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="px-6 py-3 font-medium text-muted-foreground">Capability</th>
          <th className="px-6 py-3 font-medium">{freeLabel}</th>
          <th className="px-6 py-3 font-medium">{proLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b last:border-0">
            <td className="px-6 py-3">{row.label}</td>
            <td className="px-6 py-3">
              <ValueCell value={row.free} />
            </td>
            <td className="px-6 py-3">
              <ValueCell value={row.pro} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ValueCell({ value }: { value: string }) {
  const yes = value === 'Yes'
  const no = value === 'No'
  return (
    <span className="inline-flex items-center gap-1.5">
      {yes ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : no ? (
        <Minus className="h-4 w-4 text-muted-foreground" />
      ) : null}
      {value}
    </span>
  )
}
