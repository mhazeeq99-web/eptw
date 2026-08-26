import { DashboardShell } from '@/components/layout/dashboard-shell'
import { EquipmentManager } from '@/components/company/equipment-manager'
import { BackButton } from '@/components/ui/back-button'

export default function EquipmentPage() {
  return (
    <DashboardShell>
      <div className="mb-6">
        <BackButton href="/settings" label="Back to Management" />
      </div>
      <EquipmentManager />
    </DashboardShell>
  )
}
