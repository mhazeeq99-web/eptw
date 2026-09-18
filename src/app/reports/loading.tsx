import { DashboardShell } from '@/components/layout/dashboard-shell'
import { DashboardSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <DashboardShell>
      <DashboardSkeleton />
    </DashboardShell>
  )
}