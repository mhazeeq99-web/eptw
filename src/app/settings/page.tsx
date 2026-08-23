import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SettingsManager } from '@/components/company/settings-manager'
import { NotificationPreferences } from '@/components/settings/notification-preferences'

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <SettingsManager />
        <NotificationPreferences />
      </div>
    </DashboardShell>
  )
}
