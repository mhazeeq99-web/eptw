import Link from 'next/link'
import { redirect } from 'next/navigation'
import { 
  Check, 
  Minus, 
  Shield, 
  Building2, 
  FileCheck, 
  Database, 
  Clock, 
  ChevronRight,
  Star,
  ArrowRight,
  BadgeCheck,
  HardDrive,
  Camera,
  FileText,
  FolderOpen,
  Layers,
  Users,
  ClipboardCheck,
  AlertCircle,
  BarChart3,
  Bell,
  Printer,
  LayoutDashboard
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCompanyPlan, type Plan } from '@/lib/entitlements'
import { formatBytes, formatPrice } from '@/lib/entitlements/format'
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

function storageLabel(plan: Plan | undefined): string {
  if (!plan) return '—'
  const bytes = plan.max_storage_bytes ?? 0
  if (bytes <= 0) return 'Not included'
  return formatBytes(bytes)
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
    { label: 'Attachment storage', free: storageLabel(freePlan), pro: storageLabel(proPlan), category: 'limits' },
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
    { label: 'Photos & document attachments', free: 'Not included', pro: 'Yes', category: 'features' },
  ]

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-14 text-center">
          <Badge 
            variant="outline" 
            className="mb-4 border-blue-200 bg-blue-50/60 px-3 py-0.5 text-xs font-medium uppercase tracking-wider text-blue-700 dark:border-blue-800/30 dark:bg-blue-950/20 dark:text-blue-400"
          >
            Pricing
          </Badge>
          
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Simple, transparent pricing for digital PTW
          </h1>
          
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-400">
            Start with the core PTW workflow. Upgrade when your operation needs 
            more capacity and supporting evidence.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          {[freePlan, proPlan]
            .filter((plan): plan is Plan => Boolean(plan))
            .map((plan) => {
              const isCurrent = currentPlanCode === plan.code
              const isPro = plan.code === 'pro'
              const isFree = plan.code === 'free'
              
              return (
                <div
                  key={plan.code}
                  className={cn(
                    "relative flex flex-col rounded-xl border bg-white transition-shadow duration-200 dark:bg-gray-900",
                    isPro 
                      ? "border-blue-200 shadow-md dark:border-blue-800/40 dark:shadow-blue-900/5" 
                      : "border-gray-200 shadow-sm dark:border-gray-700",
                    isCurrent && "ring-2 ring-emerald-500/40 ring-offset-1",
                    "hover:shadow-md"
                  )}
                >
                  {/* Pro accent line */}
                  {isPro && (
                    <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-blue-600 dark:bg-blue-500" />
                  )}

                  {/* Pro badge */}
                  {isPro && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-blue-600 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm dark:bg-blue-700">
                        Recommended
                      </Badge>
                    </div>
                  )}

                  <div className={cn(
                    "flex flex-1 flex-col p-6 sm:p-8",
                    isPro && "pt-7"
                  )}>
                    {/* Plan header */}
                    <div className="mb-5 flex items-start justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                          {plan.name}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {isFree ? 'Start digitising your PTW process' : 'Complete digital PTW management'}
                        </p>
                      </div>
                      {isCurrent && (
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                          <BadgeCheck className="mr-1 h-3 w-3" />
                          Current
                        </Badge>
                      )}
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline">
                        <span className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                          {formatPrice(plan.price_monthly, plan.currency)}
                        </span>
                        <span className="ml-1.5 text-base font-medium text-gray-500 dark:text-gray-400">
                          /month
                        </span>
                      </div>
                      
                      {isFree ? (
                        <p className="mt-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          Free forever
                        </p>
                      ) : (
                        <div className="mt-1.5 space-y-0.5">
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            or {plan.price_annual != null
                              ? `${plan.currency} ${Number(plan.price_annual).toLocaleString('en-MY')}`
                              : ''} /year
                          </p>
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50/60 text-[11px] text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400">
                            Save RM298/year
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Feature list */}
                    <div className="mb-8 flex-1 space-y-3">
                      {isFree ? (
                        <div className="space-y-2.5">
                          <FeatureItem icon={ClipboardCheck} label="Core PTW workflow" />
                          <FeatureItem icon={FileCheck} label="JHA / JSA" />
                          <FeatureItem icon={Shield} label="LOTO" />
                          <FeatureItem icon={AlertCircle} label="Gas Testing" />
                          <FeatureItem icon={Layers} label="Safety Controls" />
                          <FeatureItem icon={LayoutDashboard} label="Basic Dashboard" />
                          <FeatureItem icon={BarChart3} label="Basic Reports" />
                          <FeatureItem icon={Bell} label="Basic Notifications" />
                          <FeatureItem icon={Printer} label="Printable Permit" />
                          <FeatureItem icon={Users} label="Contractor PTW" />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded-lg bg-gray-50/80 p-3 dark:bg-gray-800/50">
                            <FeatureItem icon={Check} label="Everything in Free" emphasized />
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <Separator className="flex-1" />
                            <span className="text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
                              Plus
                            </span>
                            <Separator className="flex-1" />
                          </div>
                          
                          <div className="space-y-2.5">
                            {/* Star feature */}
                            <div className="rounded-lg border border-blue-200/60 bg-blue-50/60 p-3 dark:border-blue-800/30 dark:bg-blue-950/20">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex-shrink-0">
                                  <Camera className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                    Photos & document attachments
                                  </div>
                                  <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
                                    Attach photos and supporting documents directly to your PTW records
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                            <FeatureItem icon={HardDrive} label="More storage" />
                            <FeatureItem icon={Building2} label="More sites" />
                            <FeatureItem icon={FileCheck} label="Higher PTW limits" />
                            <FeatureItem icon={Clock} label="Longer history retention" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* CTA */}
                    <div className="mt-auto">
                      {isPro ? (
                        <>
                          {isCurrent ? (
                            <Link
                              href="/settings/subscription"
                              className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                              View Subscription
                            </Link>
                          ) : (
                            <Link
                              href="/settings/subscription"
                              className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-700 dark:hover:bg-blue-800"
                            >
                              Start Pro
                            </Link>
                          )}
                        </>
                      ) : (
                        <Link
                          href="/settings/subscription"
                          className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          {isCurrent ? 'Current Plan' : 'Get Started'}
                        </Link>
                      )}
                      
                      {isFree && !isCurrent && (
                        <p className="mt-2.5 text-center text-xs text-gray-500 dark:text-gray-400">
                          No credit card required
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
        </div>

        {/* Reassurance strip */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-200 pt-8 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>No credit card required</span>
          </div>
          <span className="hidden text-gray-300 dark:text-gray-600 sm:inline">·</span>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Free forever</span>
          </div>
          <span className="hidden text-gray-300 dark:text-gray-600 sm:inline">·</span>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Upgrade anytime</span>
          </div>
        </div>

        {/* Why upgrade to Pro section */}
        <div className="mt-16">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Why upgrade to Pro?
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              The key difference that matters for operational safety
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* PTW record mockup */}
            <div className="lg:col-span-3">
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Permit Record
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      PTW-2026-00124
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-200 text-[11px] text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
                    Active
                  </Badge>
                </div>
                
                {/* Details */}
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="w-16 font-medium text-gray-500 dark:text-gray-400">Work:</span>
                    <span className="text-gray-900 dark:text-white">Pump Maintenance — Line 3</span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <span className="w-16 font-medium text-gray-500 dark:text-gray-400">Location:</span>
                    <span className="text-gray-900 dark:text-white">North Plant, Area B</span>
                  </div>
                  
                  <Separator className="my-1.5" />
                  
                  {/* Safety checks */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-gray-700 dark:text-gray-300">JHA / JSA completed</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-gray-700 dark:text-gray-300">Safety Controls verified</span>
                    </div>
                  </div>
                  
                  <Separator className="my-1.5" />
                  
                  {/* Attachments - strongest visual subsection */}
                  <div className="rounded-lg border border-blue-200/60 bg-blue-50/60 p-3 dark:border-blue-800/30 dark:bg-blue-950/20">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="text-[10px] font-medium uppercase tracking-wider text-blue-700 dark:text-blue-400">
                        Attachments
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                        <Camera className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        3 photos
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                        <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        2 documents
                      </span>
                    </div>
                  </div>

                  <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                    Illustrative example only
                  </div>
                </div>
              </div>
            </div>

            {/* Value proposition */}
            <div className="lg:col-span-2">
              <div className="flex h-full flex-col justify-center space-y-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                      <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Keep permit evidence together
                    </h3>
                  </div>
                  
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    Attach photos and supporting documents directly to your PTW records. 
                    The permit, safety documentation, and supporting evidence stay 
                    together in one place.
                  </p>
                </div>
                
                <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-700">
                  <div className="mt-0.5 flex-shrink-0 rounded-full bg-emerald-100 p-1 dark:bg-emerald-900/30">
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Complete digital records
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Build a complete trail for compliance and audit purposes
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PTW Flow Visualization - Improved mobile */}
          <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-5 dark:border-gray-700 dark:bg-gray-800/50">
            {/* Desktop: Horizontal */}
            <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-0">
              <FlowStep icon={ClipboardCheck} label="PTW" variant="core" />
              <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={FileCheck} label="JHA / JSA" variant="core" />
              <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={Layers} label="Safety Controls" variant="core" />
              <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={Camera} label="Photos" variant="pro" />
              <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={FileText} label="Documents" variant="pro" />
              <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={FolderOpen} label="Permit Record" variant="pro" />
            </div>

            {/* Mobile: Vertical */}
            <div className="flex flex-col items-center gap-2 sm:hidden">
              <FlowStep icon={ClipboardCheck} label="PTW" variant="core" />
              <ArrowDown className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={FileCheck} label="JHA / JSA" variant="core" />
              <ArrowDown className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={Layers} label="Safety Controls" variant="core" />
              <ArrowDown className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={Camera} label="Photos" variant="pro" />
              <ArrowDown className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={FileText} label="Documents" variant="pro" />
              <ArrowDown className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <FlowStep icon={FolderOpen} label="Permit Record" variant="pro" />
            </div>
            
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[10px] text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                Core workflow
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                Pro features
              </span>
            </div>
          </div>
        </div>

        {/* Comparison Tables */}
        <div className="mt-16 space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Compare plans in detail
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              See what's included in each plan
            </p>
          </div>

          <Card className="overflow-hidden border-gray-200 shadow-sm dark:border-gray-700">
            <CardHeader className="border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-100 p-1.5 dark:bg-blue-900/30">
                  <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-base font-semibold">Plan limits</CardTitle>
              </div>
              <CardDescription className="text-sm">
                Capacity and usage limits for each plan
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ComparisonTable
                rows={limitRows}
                freeLabel={freePlan?.name ?? 'Free'}
                proLabel={proPlan?.name ?? 'Pro'}
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-gray-200 shadow-sm dark:border-gray-700">
            <CardHeader className="border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-100 p-1.5 dark:bg-blue-900/30">
                  <Star className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-base font-semibold">Core features</CardTitle>
              </div>
              <CardDescription className="text-sm">
                Available features and capabilities
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ComparisonTable
                rows={featureRows}
                freeLabel={freePlan?.name ?? 'Free'}
                proLabel={proPlan?.name ?? 'Pro'}
              />
            </CardContent>
          </Card>
        </div>

        {/* Contact section */}
        <div className="mt-16 rounded-xl border border-gray-200 bg-gray-50/80 p-6 text-center dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Not sure which plan fits your operation?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We'll help you choose the right setup for your PTW workflow.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-5 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-blue-800/30 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-gray-700"
            >
              Talk to us
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}

// Helper Components

function FeatureItem({ 
  icon: Icon, 
  label, 
  emphasized = false
}: { 
  icon: any
  label: string
  emphasized?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0">
        <Icon className={cn(
          "h-4 w-4",
          emphasized ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"
        )} />
      </div>
      <span className={cn(
        "text-sm",
        emphasized ? "font-medium text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400"
      )}>
        {label}
      </span>
    </div>
  )
}

function FlowStep({ 
  icon: Icon, 
  label,
  variant = 'core'
}: { 
  icon: any
  label: string
  variant?: 'core' | 'pro'
}) {
  const isPro = variant === 'pro'
  
  return (
    <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5">
      <div className={cn(
        "rounded p-1",
        isPro ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-gray-700"
      )}>
        <Icon className={cn(
          "h-3.5 w-3.5",
          isPro ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
        )} />
      </div>
      <span className={cn(
        "text-sm font-medium",
        isPro ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
      )}>
        {label}
      </span>
    </div>
  )
}

function ArrowDown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M19 12l-7 7-7-7" />
    </svg>
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
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-4 py-3.5 text-left font-medium text-gray-500 dark:text-gray-400">
              Capability
            </th>
            <th className="px-4 py-3.5 text-center font-medium text-gray-700 dark:text-gray-300">
              <div className="text-sm">{freeLabel}</div>
              <div className="text-[10px] font-normal text-gray-400 dark:text-gray-500">Core PTW</div>
            </th>
            <th className="px-4 py-3.5 text-center font-medium text-blue-700 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/15">
              <div className="text-sm">{proLabel}</div>
              <div className="text-[10px] font-normal text-blue-600 dark:text-blue-400">Recommended</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr 
              key={row.label} 
              className={cn(
                "transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/30",
                index !== rows.length - 1 && "border-b border-gray-100 dark:border-gray-800"
              )}
            >
              <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">
                {row.label}
              </td>
              <td className="px-4 py-3.5 text-center">
                <ValueCell value={row.free} />
              </td>
              <td className="px-4 py-3.5 text-center bg-blue-50/5 dark:bg-blue-950/5">
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
  const notIncluded = value === 'Not included'
  
  let displayValue = value
  if (notIncluded) displayValue = '—'
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5",
      highlight && "font-medium",
      yes && "text-emerald-600 dark:text-emerald-400",
      (no || notIncluded) && "text-gray-400 dark:text-gray-500",
      highlight && !yes && !no && !notIncluded && "text-gray-900 dark:text-white"
    )}>
      {yes ? (
        <Check className="h-3.5 w-3.5" />
      ) : (no || notIncluded) ? (
        <Minus className="h-3.5 w-3.5" />
      ) : null}
      {displayValue}
    </span>
  )
}
