import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SettingsManager } from '@/components/company/settings-manager'
import { NotificationPreferences } from '@/components/settings/notification-preferences'

export default function SettingsPage() {
  return (
    <DashboardShell>
      {/* SettingsManager renders the page title plus the labelled Company,
          Permit Types, Required Controls and Safety Controls cards.
          NotificationPreferences renders its own card. The column is
          constrained so the wide tables stay readable on large screens. */}
      <div className="mx-auto max-w-5xl space-y-6">
        <SettingsManager />
        <NotificationPreferences />
      </div>
    </DashboardShell>
  )
}
