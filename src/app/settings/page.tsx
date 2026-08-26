import Link from 'next/link'
import { UserRound, ShieldCheck } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SettingsManager } from '@/components/company/settings-manager'
import { NotificationPreferences } from '@/components/settings/notification-preferences'
import { createClient } from '@/lib/supabase/server'

/**
 * Role-aware Settings page.
 * - platform_admin: renders a PLATFORM ACCOUNT SETTINGS page (account info,
 *   account-level notification preferences, link to the Platform Control
 *   Centre). Company operational configuration is NOT shown to Platform Admin
 *   (it lives under the dedicated Configuration navigation instead).
 * - Company users (safety_manager / safety_coordinator / internal_staff):
 *   render the existing company-level configuration (SettingsManager +
 *   NotificationPreferences), scoped to their own company.
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
    <DashboardShell>
      {isPlatformAdmin ? (
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Settings
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Platform administrator account settings.
            </p>
          </div>

          {/* Account */}
          <section className="rounded-xl border bg-background">
            <div className="flex items-center gap-3 border-b px-6 py-4">
              <UserRound className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">Account</h2>
                <p className="text-sm text-muted-foreground">
                  Your platform administrator identity.
                </p>
              </div>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-6 py-4">
                <p className="text-sm font-medium">Display Name</p>
                <p className="text-sm text-muted-foreground">
                  {profile?.full_name ?? '—'}
                </p>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">
                  {profile?.email ?? '—'}
                </p>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <p className="text-sm font-medium">Role</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Platform Admin
                </span>
              </div>
            </div>
          </section>

          {/* Platform administration link */}
          <section className="flex flex-col gap-3 rounded-xl border bg-background p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">
                Platform Administration
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage the ePTW SaaS platform from the Platform
                Control Centre.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open Platform Dashboard
            </Link>
          </section>

          {/* Account-level notification preferences */}
          <NotificationPreferences />
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Company settings for company users (scoped to their own company). */}
          <SettingsManager />
          <NotificationPreferences />
        </div>
      )}
    </DashboardShell>
  )
}
