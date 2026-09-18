import { DashboardShell } from '@/components/layout/dashboard-shell'
import { DetailPageSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <DashboardShell>
      <DetailPageSkeleton />
    </DashboardShell>
  )
}