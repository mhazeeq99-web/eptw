import { DashboardShell } from '@/components/layout/dashboard-shell'
import { ContractorsManager } from '@/components/contractors/contractors-manager'
import { BackButton } from '@/components/ui/back-button'

export default function ContractorsPage() {
  return (
    <DashboardShell>
      <div className="mb-6">
        <BackButton href="/settings" label="Back to Management" />
      </div>
      <ContractorsManager />
    </DashboardShell>
  )
}
