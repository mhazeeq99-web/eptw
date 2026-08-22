import { DashboardShell } from '@/components/layout/dashboard-shell'
import { ContractorsManager } from '@/components/contractors/contractors-manager'

export default function ContractorsPage() {
  return (
    <DashboardShell>
      <ContractorsManager />
    </DashboardShell>
  )
}
