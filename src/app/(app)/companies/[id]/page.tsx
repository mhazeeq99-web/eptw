import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  Building2,
  CreditCard,
  FileText,
  HardDrive,
  Link2,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { formatDateMY } from '@/lib/dates'
import { formatBytes } from '@/lib/entitlements/format'
import { CompanySuspendButton } from './suspend-button'

type SubscriptionRow = {
  status: string
  current_period_start: string | null
  current_period_end: string | null
  plan: {
    name: string
    code: string
  } | null
}

/**
 * Platform Admin — company detail. Suspended/active status and per-company
 * usage (users, permits, active permits, storage) plus quick links into the
 * company's own management pages.
 */
export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const companyId = Number(id)

  if (!Number.isInteger(companyId) || companyId <= 0) {
    notFound()
  }

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
    return (
      <>
        <div className="flex flex-col items-center justify-center rounded-xl border bg-background p-12 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Access restricted</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only Platform Admins can manage companies.
          </p>
        </div>
      </>
    )
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, code, ssm_registration_no, is_active, created_at')
    .eq('id', companyId)
    .single()

  if (companyError || !company) {
    notFound()
  }

  const { data: subscription } = await supabase
    .from('company_subscriptions')
    .select(
      'status, current_period_start, current_period_end, plan:plans(name, code)'
    )
    .eq('company_id', companyId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Counts use exact, head-only queries (no row payloads). Storage usage is
  // the total size of permit attachments owned by the company's permits.
  const [userCount, permitCount, activePermitCount, attachments] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true),
      supabase
        .from('permits')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),
      supabase
        .from('permits')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['active', 'suspended']),
      supabase
        .from('permit_attachments')
        .select(
          'size_bytes, permits!permit_attachments_permit_id_fkey(company_id)'
        )
        .eq('permits.company_id', companyId),
    ])

  const storageBytes = (attachments.data ?? []).reduce(
    (sum, row) => sum + Number(row.size_bytes ?? 0),
    0
  )

  const subscriptionRow = subscription as unknown as
    | SubscriptionRow
    | null

  const planName = subscriptionRow?.plan?.name ?? 'Free'
  const period =
    subscriptionRow?.current_period_start &&
    subscriptionRow?.current_period_end
      ? `${formatDateMY(
          subscriptionRow.current_period_start
        )} – ${formatDateMY(subscriptionRow.current_period_end)}`
      : '—'

  const registeredOn = formatDateMY(company.created_at)

  return (
    <>
      <div className="space-y-6">
        <div>
          <BackButton href="/companies" label="Back to Companies" />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {company.name}
              </h1>
              <StatusBadge active={company.is_active} />
            </div>

            <p className="mt-2 text-muted-foreground">
              {[
                company.code ? `Code ${company.code}` : null,
                company.ssm_registration_no
                  ? `SSM ${company.ssm_registration_no}`
                  : null,
                registeredOn !== '—'
                  ? `Registered ${registeredOn}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <CompanySuspendButton
            companyId={company.id}
            isActive={company.is_active}
            companyName={company.name}
          />
        </div>

        {!company.is_active && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">
                Company suspended
              </p>
              <p className="text-sm text-red-700 dark:text-red-400">
                This company has been suspended by a Platform Admin. No data
                has been deleted.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-background p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Building2 className="h-4 w-4" />
              Company
            </h2>

            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="Legal name" value={company.name} />
              <DetailRow label="Company code" value={company.code ?? '—'} />
              <DetailRow
                label="SSM registration no."
                value={company.ssm_registration_no ?? '—'}
              />
              <DetailRow
                label="Status"
                value={company.is_active ? 'Active' : 'Suspended'}
              />
              <DetailRow label="Registered on" value={registeredOn} />
            </dl>
          </section>

          <section className="rounded-xl border bg-background p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <CreditCard className="h-4 w-4" />
              Subscription
            </h2>

            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="Plan" value={planName} />
              <DetailRow
                label="Subscription status"
                value={
                  subscriptionRow
                    ? subscriptionRow.status
                    : 'None (Free plan)'
                }
              />
              <DetailRow label="Current period" value={period} />
            </dl>
          </section>

          <section className="rounded-xl border bg-background p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4" />
              Usage
            </h2>

            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow
                label="Users"
                value={String(userCount.count ?? 0)}
              />
              <DetailRow
                label="Permits"
                value={String(permitCount.count ?? 0)}
              />
              <DetailRow
                label="Active permits"
                value={String(activePermitCount.count ?? 0)}
              />
              <DetailRow
                label="Storage usage"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatBytes(storageBytes)}
                  </span>
                }
              />
            </dl>
          </section>

          <section className="rounded-xl border bg-background p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Link2 className="h-4 w-4" />
              Quick links
            </h2>

            <ul className="mt-4 space-y-1 text-sm">
              <QuickLink
                href="/company/users"
                icon={<Users className="h-4 w-4" />}
              >
                View Users
              </QuickLink>
              <QuickLink
                href={`/permits?company=${company.id}`}
                icon={<FileText className="h-4 w-4" />}
              >
                View Permits
              </QuickLink>
              <QuickLink
                href="/settings/subscription"
                icon={<CreditCard className="h-4 w-4" />}
              >
                Subscription
              </QuickLink>
              <QuickLink
                href="/settings"
                icon={<Settings className="h-4 w-4" />}
              >
                Company Settings
              </QuickLink>
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Active
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Suspended
    </span>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-muted/60 pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}

function QuickLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 rounded-md px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {icon}
        <span className="font-medium">{children}</span>
      </Link>
    </li>
  )
}
