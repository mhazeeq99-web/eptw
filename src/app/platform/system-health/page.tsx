import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  HeartPulse,
  Database,
  HardDrive,
  CreditCard,
  Mail,
  UserPlus,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'

/**
 * Platform Admin — System Health.
 *
 * High-level service status derived from server-side environment/config
 * checks. Only configuration booleans are shown — no key, password or
 * secret values are ever rendered.
 */

export const dynamic = 'force-dynamic'

type ServiceStatus = 'ok' | 'warn'

type Service = {
  id: string
  name: string
  icon: ReactNode
  status: ServiceStatus
  statusLabel: string
  detail: string
}

export default async function SystemHealthPage() {
  const dbConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hitpayConfigured = Boolean(
    process.env.HITPAY_API_KEY && process.env.HITPAY_WEBHOOK_SALT
  )
  const smtpConfigured = Boolean(process.env.SMTP_HOST)

  // The Supabase client can only be built when its env vars exist; when they
  // are missing the page still renders, reporting the services as
  // "Not configured" (a health page must stay visible during outages).
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null

  try {
    supabase = await createClient()
  } catch {
    // Supabase env not configured — render configuration statuses below.
  }

  if (supabase) {
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
  }

  // Storage probe: bucket existence (best-effort, never fatal).
  let storageReachable = false
  let storageBucketPresent: boolean | null = null
  let storageBucketCount = 0

  if (supabase) {
    try {
      const { data: buckets, error } =
        await supabase.storage.listBuckets()

      if (!error && buckets) {
        storageReachable = true
        storageBucketCount = buckets.length
        storageBucketPresent = buckets.some(
          (bucket) => bucket.name === 'permit-attachments'
        )
      }
    } catch {
      // Bucket probe failed — fall back to "Not configured".
    }
  }

  const storageOperational =
    storageReachable && storageBucketPresent === true

  const services: Service[] = [
    {
      id: 'app',
      name: 'ePTW Application',
      icon: <HeartPulse className="h-5 w-5" />,
      status: 'ok',
      statusLabel: 'Operational',
      detail: 'The application is serving requests.',
    },
    {
      id: 'database',
      name: 'Database & Auth (Supabase)',
      icon: <Database className="h-5 w-5" />,
      status: dbConfigured ? 'ok' : 'warn',
      statusLabel: dbConfigured
        ? 'Operational'
        : 'Not configured',
      detail: dbConfigured
        ? 'NEXT_PUBLIC_SUPABASE_URL is configured.'
        : 'NEXT_PUBLIC_SUPABASE_URL is not set.',
    },
    {
      id: 'storage',
      name: 'Storage (attachments)',
      icon: <HardDrive className="h-5 w-5" />,
      status: storageOperational ? 'ok' : 'warn',
      statusLabel: storageOperational
        ? 'Operational'
        : 'Not configured',
      detail: storageReachable
        ? `${storageBucketCount} bucket${storageBucketCount === 1 ? '' : 's'} reachable; permit-attachments ${storageBucketPresent ? 'present' : 'missing'}.`
        : dbConfigured
          ? 'Supabase URL is configured but the bucket check could not be completed.'
          : 'NEXT_PUBLIC_SUPABASE_URL is not set.',
    },
    {
      id: 'hitpay',
      name: 'HitPay (Payments)',
      icon: <CreditCard className="h-5 w-5" />,
      status: hitpayConfigured ? 'ok' : 'warn',
      statusLabel: hitpayConfigured
        ? 'HitPay Configured'
        : 'Not configured',
      detail: hitpayConfigured
        ? 'HITPAY_API_KEY and HITPAY_WEBHOOK_SALT are configured.'
        : 'HITPAY_API_KEY and HITPAY_WEBHOOK_SALT are required.',
    },
    {
      id: 'email',
      name: 'Email (SMTP)',
      icon: <Mail className="h-5 w-5" />,
      status: smtpConfigured ? 'ok' : 'warn',
      statusLabel: smtpConfigured
        ? 'Configured'
        : 'Not configured',
      detail: smtpConfigured
        ? 'SMTP_HOST is configured — transactional email can be sent.'
        : 'SMTP_HOST is not set.',
    },
    {
      id: 'invitations',
      name: 'Invitation emails',
      icon: <UserPlus className="h-5 w-5" />,
      status: smtpConfigured ? 'ok' : 'warn',
      statusLabel: smtpConfigured
        ? 'Operational'
        : 'Not configured',
      detail: smtpConfigured
        ? 'User invitations will be delivered via SMTP.'
        : 'Requires SMTP_HOST (same as Email above).',
    },
    {
      id: 'password-reset',
      name: 'Password reset',
      icon: <KeyRound className="h-5 w-5" />,
      status: smtpConfigured ? 'ok' : 'warn',
      statusLabel: smtpConfigured
        ? 'Operational'
        : 'Not configured',
      detail: smtpConfigured
        ? 'Password reset emails will be delivered via SMTP.'
        : 'Requires SMTP_HOST (same as Email above).',
    },
  ]

  return (
    <DashboardShell>
      <div className="max-w-4xl space-y-6">
        <div>
          <BackButton href="/dashboard" label="Back to Platform" />
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            System Health
          </h1>

          <p className="mt-2 text-muted-foreground">
            High-level status of the services ePTW depends on, based
            on server-side configuration checks.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-background">
          <div className="border-b px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <HeartPulse className="h-5 w-5 text-muted-foreground" />
              Service status
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Configuration status only — no keys, passwords or
              secrets are displayed.
            </p>
          </div>

          <div className="divide-y">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-md border p-2">
                    {service.icon}
                  </div>

                  <div className="min-w-0">
                    <p className="font-medium">{service.name}</p>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {service.detail}
                    </p>
                  </div>
                </div>

                <StatusPill
                  status={service.status}
                  label={service.statusLabel}
                />
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Checks run at request time against the current environment.
          Marking a service “Operational” means the required
          configuration is present — it does not guarantee that
          upstream providers are reachable.
        </p>
      </div>
    </DashboardShell>
  )
}

function StatusPill({
  status,
  label,
}: {
  status: ServiceStatus
  label: string
}) {
  const ok = status === 'ok'

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        ok
          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
      }`}
    >
      {ok ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5" />
          ✓ {label}
        </>
      ) : (
        <>
          <AlertTriangle className="h-3.5 w-3.5" />
          ⚠ {label}
        </>
      )}
    </span>
  )
}
