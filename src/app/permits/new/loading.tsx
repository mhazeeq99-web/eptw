import { DashboardShell } from '@/components/layout/dashboard-shell'
import { FormPageSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <DashboardShell>
      <FormPageSkeleton />
    </DashboardShell>
  )
}