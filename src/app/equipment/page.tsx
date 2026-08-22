import { DashboardShell } from '@/components/layout/dashboard-shell'
import { EquipmentManager } from '@/components/company/equipment-manager'

export default function EquipmentPage() {
  return (
    <DashboardShell>
      <EquipmentManager />
    </DashboardShell>
  )
}
