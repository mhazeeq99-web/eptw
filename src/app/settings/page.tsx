import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SettingsManager } from '@/components/company/settings-manager'

export default function SettingsPage() {
  return (
    <DashboardShell>
      <SettingsManager />
    </DashboardShell>
  )
}
