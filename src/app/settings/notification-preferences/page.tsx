import { Bell, Mail } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { NotificationPreferences } from '@/components/settings/notification-preferences'

/**
 * Notification Preferences settings page.
 *
 * Dedicated page for the NotificationPreferences component (previously
 * rendered inline on the monolithic /settings page).
 */
export default async function NotificationPreferencesSettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <BackButton href="/settings" label="Back to Settings" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Notification Preferences
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Choose which events send you email notifications
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Mail className="mr-1 h-3 w-3" />
            Email Notifications
          </Badge>
        </div>

        <NotificationPreferences />
      </div>
    </DashboardShell>
  )
}
