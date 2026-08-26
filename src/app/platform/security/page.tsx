import { redirect } from 'next/navigation'
import {
  ShieldAlert,
  UserX,
  Building2,
  Receipt,
  FileX,
  Info,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { formatDateTimeMY } from '@/lib/dates'

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

  return (
    <DashboardShell>
      <div className="space-y-6">
        <BackButton href="/dashboard" label="Back to Platform" />

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Security Events
          </h1>

          <p className="mt-2 text-muted-foreground">
            Derivable security signals across the platform.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />

          <p>
            Failed authorization or rejected access attempts are not logged
            in-app, so this page shows what IS derivable from current data:
            disabled accounts, suspended companies, cancelled/expired
            subscriptions and rejected permits. This is a read-only view —
            it provides no mechanism to re-enable, reactivate or bypass any
            security control.
          </p>
        </div>

        {/* Disabled accounts */}
        <section className="overflow-hidden rounded-xl border bg-background">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md border p-2">
                <UserX className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold">Disabled accounts</h2>
                <p className="text-xs text-muted-foreground">
                  Profiles marked inactive (cannot sign in or act).
                </p>
              </div>
            </div>

            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {disabledProfiles.length}
            </span>
          </div>

          {disabledProfiles.length === 0 ? (
            <EmptyRow message="No disabled accounts." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">User</th>
                    <th className="px-6 py-3 text-left font-medium">Role</th>
                    <th className="px-6 py-3 text-left font-medium">Company</th>
                    <th className="px-6 py-3 text-left font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {disabledProfiles.map((profile) => (
                    <tr
                      key={profile.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium">
                          {profile.full_name ?? '—'}
                        </p>
                        {profile.email && (
                          <p className="text-xs text-muted-foreground">
                            {profile.email}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <RoleBadge role={profile.role} />
                      </td>
                      <td className="px-6 py-4">
                        {profile.company_id != null
                          ? companyById.get(profile.company_id)?.name ?? '—'
                          : '—'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatDateTimeMY(profile.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Suspended companies */}
        <section className="overflow-hidden rounded-xl border bg-background">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md border p-2">
                <Building2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold">Suspended companies</h2>
                <p className="text-xs text-muted-foreground">
                  Companies marked inactive.
                </p>
              </div>
            </div>

            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {suspendedCompanies.length}
            </span>
          </div>

          {suspendedCompanies.length === 0 ? (
            <EmptyRow message="No suspended companies." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Company</th>
                    <th className="px-6 py-3 text-left font-medium">Code</th>
                    <th className="px-6 py-3 text-left font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suspendedCompanies.map((company) => (
                    <tr
                      key={company.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-6 py-4 font-medium">
                        {company.name}
                      </td>
                      <td className="px-6 py-4">
                        {company.code ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatDateTimeMY(company.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Cancelled / expired subscriptions */}
        <section className="overflow-hidden rounded-xl border bg-background">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md border p-2">
                <Receipt className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold">
                  Cancelled / expired subscriptions
                </h2>
                <p className="text-xs text-muted-foreground">
                  Companies without an active paid plan.
                </p>
              </div>
            </div>

            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {badSubscriptions.length}
            </span>
          </div>

          {badSubscriptions.length === 0 ? (
            <EmptyRow message="No cancelled or expired subscriptions." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Company</th>
                    <th className="px-6 py-3 text-left font-medium">Plan</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-left font-medium">Last updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {badSubscriptions.map((sub) => (
                    <tr
                      key={sub.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-6 py-4 font-medium">
                        {companyById.get(sub.company_id)?.name ?? '—'}
                      </td>
                      <td className="px-6 py-4">
                        {sub.plan_id != null
                          ? planById.get(sub.plan_id)?.name ?? '—'
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
                            sub.status === 'cancelled'
                              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
                          }`}
                        >
                          {sub.status.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatDateTimeMY(sub.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Rejected permits */}
        <section className="overflow-hidden rounded-xl border bg-background">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md border p-2">
                <FileX className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold">Rejected permits</h2>
                <p className="text-xs text-muted-foreground">
                  Permit applications rejected by safety review.
                </p>
              </div>
            </div>

            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {rejectedPermits.length}
            </span>
          </div>

          {rejectedPermits.length === 0 ? (
            <EmptyRow message="No rejected permits." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Permit</th>
                    <th className="px-6 py-3 text-left font-medium">Work</th>
                    <th className="px-6 py-3 text-left font-medium">Company</th>
                    <th className="px-6 py-3 text-left font-medium">Requester</th>
                    <th className="px-6 py-3 text-left font-medium">Rejection reason</th>
                    <th className="px-6 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rejectedPermits.map((permit) => (
                    <tr
                      key={permit.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-6 py-4 font-medium text-primary">
                        {permit.permit_no}
                      </td>
                      <td className="px-6 py-4">
                        {permit.work_title}
                      </td>
                      <td className="px-6 py-4">
                        {permit.company_id != null
                          ? companyById.get(permit.company_id)?.name ?? '—'
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        {permit.requester_id
                          ? requesterNameById.get(permit.requester_id) ?? '—'
                          : '—'}
                      </td>
                      <td className="max-w-[280px] px-6 py-4 text-muted-foreground">
                        <span className="line-clamp-2">
                          {permit.rejection_reason ?? '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatDateTimeMY(permit.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />
          Security view is read-only. Changes to these states can only be made
          through the appropriate management flows.
        </p>
      </div>
    </DashboardShell>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-6 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {role.replaceAll('_', ' ')}
    </span>
  )
}
