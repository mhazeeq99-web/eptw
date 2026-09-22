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
  Info,
  Activity,
  Server,
  Shield,
  Wifi,
  Settings
} from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

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
  category: 'core' | 'integration' | 'communication'
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
      category: 'core',
    },
    {
      id: 'database',
      name: 'Database & Auth (Supabase)',
      icon: <Database className="h-5 w-5" />,
      status: dbConfigured ? 'ok' : 'warn',
      statusLabel: dbConfigured ? 'Operational' : 'Not configured',
      detail: dbConfigured
        ? 'NEXT_PUBLIC_SUPABASE_URL is configured.'
        : 'NEXT_PUBLIC_SUPABASE_URL is not set.',
      category: 'core',
    },
    {
      id: 'storage',
      name: 'Storage (attachments)',
      icon: <HardDrive className="h-5 w-5" />,
      status: storageOperational ? 'ok' : 'warn',
      statusLabel: storageOperational ? 'Operational' : 'Not configured',
      detail: storageReachable
        ? `${storageBucketCount} bucket${storageBucketCount === 1 ? '' : 's'} reachable; permit-attachments ${storageBucketPresent ? 'present' : 'missing'}.`
        : dbConfigured
          ? 'Supabase URL is configured but the bucket check could not be completed.'
          : 'NEXT_PUBLIC_SUPABASE_URL is not set.',
      category: 'core',
    },
    {
      id: 'hitpay',
      name: 'HitPay (Payments)',
      icon: <CreditCard className="h-5 w-5" />,
      status: hitpayConfigured ? 'ok' : 'warn',
      statusLabel: hitpayConfigured ? 'Configured' : 'Not configured',
      detail: hitpayConfigured
        ? 'HITPAY_API_KEY and HITPAY_WEBHOOK_SALT are configured.'
        : 'HITPAY_API_KEY and HITPAY_WEBHOOK_SALT are required.',
      category: 'integration',
    },
    {
      id: 'email',
      name: 'Email (SMTP)',
      icon: <Mail className="h-5 w-5" />,
      status: smtpConfigured ? 'ok' : 'warn',
      statusLabel: smtpConfigured ? 'Configured' : 'Not configured',
      detail: smtpConfigured
        ? 'SMTP_HOST is configured — transactional email can be sent.'
        : 'SMTP_HOST is not set.',
      category: 'communication',
    },
    {
      id: 'invitations',
      name: 'Invitation emails',
      icon: <UserPlus className="h-5 w-5" />,
      status: smtpConfigured ? 'ok' : 'warn',
      statusLabel: smtpConfigured ? 'Operational' : 'Not configured',
      detail: smtpConfigured
        ? 'User invitations will be delivered via SMTP.'
        : 'Requires SMTP_HOST (same as Email above).',
      category: 'communication',
    },
    {
      id: 'password-reset',
      name: 'Password reset',
      icon: <KeyRound className="h-5 w-5" />,
      status: smtpConfigured ? 'ok' : 'warn',
      statusLabel: smtpConfigured ? 'Operational' : 'Not configured',
      detail: smtpConfigured
        ? 'Password reset emails will be delivered via SMTP.'
        : 'Requires SMTP_HOST (same as Email above).',
      category: 'communication',
    },
  ]

  // Calculate statistics
  const stats = {
    total: services.length,
    operational: services.filter(s => s.status === 'ok').length,
    warnings: services.filter(s => s.status === 'warn').length,
    coreOperational: services.filter(s => s.category === 'core' && s.status === 'ok').length,
    coreTotal: services.filter(s => s.category === 'core').length,
  }

  const coreServices = services.filter(s => s.category === 'core')
  const integrationServices = services.filter(s => s.category === 'integration')
  const communicationServices = services.filter(s => s.category === 'communication')

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/dashboard" label="Back to Platform" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-100 p-3 dark:bg-green-900/50">
                <HeartPulse className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  System Health
                </h1>
                <p className="mt-1 text-muted-foreground">
                  High-level status of the services ePTW depends on
                </p>
              </div>
            </div>
          </div>

          <Badge variant={stats.warnings === 0 ? 'success' : 'warning'} className="self-start">
            <Activity className="mr-1 h-3 w-3" />
            {stats.operational}/{stats.total} Operational
          </Badge>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={Server}
            label="Total Services"
            value={stats.total}
            color="blue"
          />
          <StatCard
            icon={CheckCircle2}
            label="Operational"
            value={stats.operational}
            color="green"
          />
          <StatCard
            icon={AlertTriangle}
            label="Warnings"
            value={stats.warnings}
            color="orange"
          />
        </div>

        {/* Core Services */}
        <ServiceSection
          title="Core Services"
          description="Essential services required for basic operation"
          icon={Server}
          services={coreServices}
        />

        {/* Integration Services */}
        <ServiceSection
          title="Integration Services"
          description="Third-party integrations and payment processing"
          icon={Settings}
          services={integrationServices}
        />

        {/* Communication Services */}
        <ServiceSection
          title="Communication Services"
          description="Email and notification delivery"
          icon={Mail}
          services={communicationServices}
        />

        {/* Info Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              About This Page
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Checks run at request time against the current environment. Marking a service "Operational" means the required configuration is present — it does not guarantee that upstream providers are reachable. No keys, passwords or secrets are displayed.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

function ServiceSection({
  title,
  description,
  icon: Icon,
  services,
}: {
  title: string
  description: string
  icon: any
  services: Service[]
}) {
  const operationalCount = services.filter(s => s.status === 'ok').length
  const allOperational = operationalCount === services.length

  return (
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
              <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Badge variant={allOperational ? 'success' : 'warning'}>
            {operationalCount}/{services.length} Operational
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {services.map((service) => (
            <div
              key={service.id}
              className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-gray-800/50"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className={`rounded-lg p-2 ${
                  service.status === 'ok'
                    ? 'bg-green-100 dark:bg-green-900/50'
                    : 'bg-amber-100 dark:bg-amber-900/50'
                }`}>
                  {service.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {service.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {service.detail}
                  </p>
                </div>
              </div>
              <StatusPill status={service.status} label={service.statusLabel} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: 'blue' | 'green' | 'orange' }) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400",
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

function StatusPill({
  status,
  label,
}: {
  status: ServiceStatus
  label: string
}) {
  const ok = status === 'ok'

  return (
    <Badge variant={ok ? 'success' : 'warning'} className="shrink-0">
      {ok ? (
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
      )}
      {label}
    </Badge>
  )
}