import { notFound } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import EditPermitForm from '@/components/permits/edit-permit-form'
import { BackButton } from '@/components/ui/back-button'
import { 
  FileText, 
  Edit, 
  Info,
  AlertTriangle
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

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
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="mb-6">
          <BackButton href={`/permits/${id}`} label="Back to Permit" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Edit className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Edit Permit
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Update permit details and information
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <FileText className="mr-1 h-3 w-3" />
            Permit #{id}
          </Badge>
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Editing Permit
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Update the permit information below. Changes will be saved to the draft and can be submitted for approval when ready.
            </p>
          </div>
        </div>

        {/* Main Form */}
        <Card>
          <CardContent className="p-6">
            <EditPermitForm permitId={permitId} />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}