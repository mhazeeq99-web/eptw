import { DashboardShell } from '@/components/layout/dashboard-shell'
import { ListPageSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <DashboardShell>
      <ListPageSkeleton />
    </DashboardShell>
  )
}