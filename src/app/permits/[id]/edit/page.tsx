import { notFound } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import EditPermitForm from '@/components/permits/edit-permit-form'

export default async function EditPermitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const permitId = Number(id)

  if (!Number.isInteger(permitId) || permitId <= 0) {
    notFound()
  }

  return (
    <DashboardShell>
      <EditPermitForm permitId={permitId} />
    </DashboardShell>
  )
}