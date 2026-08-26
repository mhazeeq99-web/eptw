import { DashboardShell } from '@/components/layout/dashboard-shell'
import { AreasManager } from '@/components/company/areas-manager'
import { BackButton } from '@/components/ui/back-button'

export default function AreasPage() {
  return (
    <DashboardShell>
      <div className="mb-6">
        <BackButton href="/settings" label="Back to Management" />
      </div>
      <AreasManager />
    </DashboardShell>
  )
}
