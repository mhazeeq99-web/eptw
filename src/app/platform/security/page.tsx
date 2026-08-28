import { redirect } from 'next/navigation'
import {
  ShieldAlert,
  UserX,
  Building2,
  Receipt,
  FileX,
  Info,
  CheckCircle2,
  AlertTriangle,
  Users,
  XCircle,
  Clock,
  Search
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { formatDateTimeMY } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Platform Security Events — a read-only view of derivable security signals.
 *
 * Failed authorization / rejected attempts are NOT logged in-app, so this
 * page surfaces only what the data can tell us:
 *   - disabled accounts  (profiles.is_active = false)
 *   - suspended companies (companies.is_active = false)
 *   - cancelled / expired subscriptions (company_subscriptions.status)
 *   - rejected permits   (permits.status = 'rejected')
 *
 * Strictly read-only: there is deliberately NO mechanism here to re-enable,
 * reactivate, override or bypass any security control.
 */

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

type PermitRow = {
  id: number
  permit_no: string
  work_title: string
  status: string
  company_id: number | null
  requester_id: string | null
  created_at: string
  rejection_reason: string | null
}

export default async function PlatformSecurityPage() {
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
  // Fetch each derivable security signal (all read-only).
  // RLS grants platform_admin cross-tenant read access.
  // ---------------------------------------------------------

  const [companiesResult, profilesResult, subsResult, plansResult, permitsResult] =
    await Promise.all([
      supabase
        .from('companies')
        .select('id, name, code, is_active, created_at'),
      supabase
        .from('profiles')
        .select(
          'id, full_name, email, role, company_id, is_active, created_at'
        )
        .eq('is_active', false),
      supabase
        .from('company_subscriptions')
        .select(
          'id, company_id, plan_id, status, created_at, updated_at'
        )
        .in('status', ['cancelled', 'expired']),
      supabase
        .from('plans')
        .select('id, code, name')
        .limit(50),
      supabase
        .from('permits')
        .select(
          'id, permit_no, work_title, status, company_id, requester_id, created_at, rejection_reason'
        )
        .eq('status', 'rejected'),
    ])

  const companies = (companiesResult.data ?? []) as unknown as CompanyRow[]
  const disabledProfiles = (profilesResult.data ?? []) as unknown as ProfileRow[]
  const badSubscriptions = (subsResult.data ?? []) as unknown as SubscriptionRow[]
  const plans = (plansResult.data ?? []) as unknown as PlanRow[]
  const rejectedPermits = (permitsResult.data ?? []) as unknown as PermitRow[]

  const companyById = new Map<number, CompanyRow>()
  for (const company of companies) {
    companyById.set(company.id, company)
  }

  const planById = new Map<number, PlanRow>()
  for (const plan of plans) {
    planById.set(plan.id, plan)
  }

  // Resolve requester display names for rejected permits.
  const requesterIds = Array.from(
    new Set(
      rejectedPermits
        .map((permit) => permit.requester_id)
        .filter((id): id is string => Boolean(id))
    )
  )

  const requesterNameById = new Map<string, string>()
  if (requesterIds.length > 0) {
    const { data: requesters } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', requesterIds)

    for (const requester of requesters ?? []) {
      requesterNameById.set(
        requester.id,
        requester.full_name ?? requester.email ?? 'Unknown user'
      )
    }
  }

  const suspendedCompanies = companies.filter(
    (company) => !company.is_active
  )

  // Calculate statistics
  const stats = {
    disabledAccounts: disabledProfiles.length,
    suspendedCompanies: suspendedCompanies.length,
    badSubscriptions: badSubscriptions.length,
    rejectedPermits: rejectedPermits.length,
    total: disabledProfiles.length + suspendedCompanies.length + badSubscriptions.length + rejectedPermits.length,
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/dashboard" label="Back to Platform" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-100 p-3 dark:bg-red-900/50">
                <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Security Events
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Derivable security signals across the platform
                </p>
              </div>
            </div>
          </div>

          <Badge variant="destructive" className="self-start">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {stats.total} Events
          </Badge>
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Read-Only Security View
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Failed authorization attempts are not logged in-app. This page shows derivable signals: disabled accounts, suspended companies, cancelled subscriptions, and rejected permits. No mechanism to modify these states is provided here.
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={UserX}
            label="Disabled Accounts"
            value={stats.disabledAccounts}
            color="red"
          />
          <StatCard
            icon={Building2}
            label="Suspended Companies"
            value={stats.suspendedCompanies}
            color="orange"
          />
          <StatCard
            icon={Receipt}
            label="Bad Subscriptions"
            value={stats.badSubscriptions}
            color="yellow"
          />
          <StatCard
            icon={FileX}
            label="Rejected Permits"
            value={stats.rejectedPermits}
            color="purple"
          />
        </div>

        {/* Disabled Accounts */}
        <SecuritySection
          icon={UserX}
          title="Disabled Accounts"
          description="Profiles marked inactive (cannot sign in or act)"
          count={disabledProfiles.length}
          tone="red"
          isEmpty={disabledProfiles.length === 0}
          emptyMessage="No disabled accounts."
        >
          {disabledProfiles.length > 0 && (
            <ScrollArea className="h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">User</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Role</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {disabledProfiles.map((profile) => (
                      <tr key={profile.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <UserX className="h-4 w-4 text-red-500" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {profile.full_name ?? '—'}
                              </p>
                              {profile.email && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {profile.email}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <RoleBadge role={profile.role} />
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {profile.company_id != null
                            ? companyById.get(profile.company_id)?.name ?? '—'
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {formatDateTimeMY(profile.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </SecuritySection>

        {/* Suspended Companies */}
        <SecuritySection
          icon={Building2}
          title="Suspended Companies"
          description="Companies marked inactive"
          count={suspendedCompanies.length}
          tone="orange"
          isEmpty={suspendedCompanies.length === 0}
          emptyMessage="No suspended companies."
        >
          {suspendedCompanies.length > 0 && (
            <ScrollArea className="h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Code</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {suspendedCompanies.map((company) => (
                      <tr key={company.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-orange-500" />
                            <span className="font-medium text-gray-900 dark:text-white">{company.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {company.code ?? '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {formatDateTimeMY(company.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </SecuritySection>

        {/* Bad Subscriptions */}
        <SecuritySection
          icon={Receipt}
          title="Cancelled / Expired Subscriptions"
          description="Companies without an active paid plan"
          count={badSubscriptions.length}
          tone="yellow"
          isEmpty={badSubscriptions.length === 0}
          emptyMessage="No cancelled or expired subscriptions."
        >
          {badSubscriptions.length > 0 && (
            <ScrollArea className="h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Plan</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {badSubscriptions.map((sub) => (
                      <tr key={sub.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                          {companyById.get(sub.company_id)?.name ?? '—'}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary">
                            {sub.plan_id != null
                              ? planById.get(sub.plan_id)?.name ?? '—'
                              : '—'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={sub.status === 'cancelled' ? 'destructive' : 'warning'}>
                            {sub.status.replaceAll('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {formatDateTimeMY(sub.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </SecuritySection>

        {/* Rejected Permits */}
        <SecuritySection
          icon={FileX}
          title="Rejected Permits"
          description="Permit applications rejected by safety review"
          count={rejectedPermits.length}
          tone="purple"
          isEmpty={rejectedPermits.length === 0}
          emptyMessage="No rejected permits."
        >
          {rejectedPermits.length > 0 && (
            <ScrollArea className="h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Work</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Requester</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Rejection Reason</th>
                      <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {rejectedPermits.map((permit) => (
                      <tr key={permit.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-6 py-4">
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {permit.permit_no}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {permit.work_title}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {permit.company_id != null
                            ? companyById.get(permit.company_id)?.name ?? '—'
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {permit.requester_id
                            ? requesterNameById.get(permit.requester_id) ?? '—'
                            : '—'}
                        </td>
                        <td className="max-w-[280px] px-6 py-4">
                          <p className="line-clamp-2 text-gray-600 dark:text-gray-400">
                            {permit.rejection_reason ?? '—'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {formatDateTimeMY(permit.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </SecuritySection>

        {/* Footer Note */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <ShieldAlert className="h-3.5 w-3.5" />
          Security view is read-only. Changes to these states can only be made through the appropriate management flows.
        </div>
      </div>
    </DashboardShell>
  )
}

function SecuritySection({
  icon: Icon,
  title,
  description,
  count,
  tone,
  isEmpty,
  emptyMessage,
  children,
}: {
  icon: any
  title: string
  description: string
  count: number
  tone: 'red' | 'orange' | 'yellow' | 'purple'
  isEmpty: boolean
  emptyMessage: string
  children: React.ReactNode
}) {
  const toneClasses = {
    red: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400",
    yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400",
  }

  const countClasses = {
    red: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  }

  return (
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${toneClasses[tone]}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Badge className={countClasses[tone]}>
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isEmpty ? (
          <div className="px-6 py-8 text-center text-sm text-gray-600 dark:text-gray-400">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: 'red' | 'orange' | 'yellow' | 'purple' }) {
  const colorClasses = {
    red: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400",
    yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400",
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

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-6 py-8 text-center text-sm text-gray-600 dark:text-gray-400">
      {message}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="secondary">
      {role.replaceAll('_', ' ')}
    </Badge>
  )
}