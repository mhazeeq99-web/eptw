import Link from 'next/link'
import { 
  UserRound, 
  ShieldCheck,
  Settings,
  Building2,
  Bell,
  ChevronRight,
  Info,
  Mail,
  BadgeCheck,
  Layers,
  FileText
} from 'lucide-react'
import { NotificationPreferences } from '@/components/settings/notification-preferences'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

/**
 * Role-aware Settings page.
 * - platform_admin: renders a PLATFORM ACCOUNT SETTINGS page (account info,
 *   account-level notification preferences, link to the Platform Control
 *   Centre). Company operational configuration is NOT shown to Platform Admin
 *   (it lives under the dedicated Configuration navigation instead).
 * - Company users (safety_manager / safety_coordinator / internal_staff):
 *   render a Settings HUB: a grid of cards linking to the individual settings
 *   sub-pages that are NOT already in the sidebar (Permit Types, Safety
 *   Controls & Required Controls, Notification Preferences). Items already in
 *   the sidebar (Areas, Equipment, Contractors, Users, Subscription, Feedback)
 *   are intentionally not repeated here.
 */
export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, company_id')
    .eq('id', user.id)
    .single()

  const isPlatformAdmin = profile?.role === 'platform_admin'

  return (
    <>
      {isPlatformAdmin ? (
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                  <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Settings
                  </h1>
                  <p className="mt-1 text-muted-foreground">
                    Platform administrator account settings
                  </p>
                </div>
              </div>
            </div>

            <Badge variant="secondary" className="self-start">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Platform Admin
            </Badge>
          </div>

          {/* Account Card */}
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Account
              </CardTitle>
              <CardDescription>
                Your platform administrator identity
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
                      <UserRound className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Display Name</p>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {profile?.full_name ?? '—'}
                  </p>
                </div>
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
                      <Mail className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</p>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {profile?.email ?? '—'}
                  </p>
                </div>
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
                      <BadgeCheck className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Role</p>
                  </div>
                  <Badge variant="info">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Platform Admin
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Platform Administration Link */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/50">
                    <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-white">
                      Platform Administration
                    </h2>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Manage the ePTW SaaS platform from the Platform Control Centre.
                    </p>
                  </div>
                </div>
                <Link
                  href="/dashboard"
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  Open Platform Dashboard
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <NotificationPreferences />
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                  <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Settings
                  </h1>
                  <p className="mt-1 text-muted-foreground">
                    Company configuration and preferences
                  </p>
                </div>
              </div>
            </div>

            <Badge variant="secondary" className="self-start">
              <Building2 className="mr-1 h-3 w-3" />
              Company Settings
            </Badge>
          </div>

          {/* Info Notice */}
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Company Configuration
              </p>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                Manage your company&apos;s operational settings, including permit types, areas, equipment, and safety configurations.
              </p>
            </div>
          </div>

          {/* Settings Hub */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HubCard
              href="/settings/permit-types"
              icon={<FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              title="Permit Types"
              description="Permit categories and their document requirements"
            />
            <HubCard
              href="/settings/safety-controls"
              icon={<ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              title="Safety Controls & Required Controls"
              description="Safety control library and per-permit-type requirements"
            />
            <HubCard
              href="/settings/notification-preferences"
              icon={<Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              title="Notification Preferences"
              description="Choose which events send you email notifications"
            />
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Link-style card used in the company Settings hub grid.
 */
function HubCard({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border bg-background p-5 shadow-sm transition-all hover:shadow-md"
    >
      <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-medium text-gray-900 dark:text-white">{title}</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
      <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-1" />
    </Link>
  )
}
