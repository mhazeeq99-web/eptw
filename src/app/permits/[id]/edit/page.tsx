import { notFound } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import EditPermitForm from '@/components/permits/edit-permit-form'
import { BackButton } from '@/components/ui/back-button'

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
      <div className="mb-6">
        <BackButton href={`/permits/${id}`} label="Back to Permit" />
      </div>
      <EditPermitForm permitId={permitId} />
    </DashboardShell>
  )
}