import { notFound } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import EditPermitForm from '@/components/permits/edit-permit-form'
import { BackButton } from '@/components/ui/back-button'
import { 
  FileText, 
  Edit, 
  Info,
  AlertTriangle,
  Clock,
  Save
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

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

  // Fetch permit details for context
  const supabase = await createClient()
  const { data: permit, error } = await supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      work_title,
      status,
      updated_at
    `)
    .eq('id', permitId)
    .single()

  if (error || !permit) {
    notFound()
  }

  const isDraft = permit.status === 'draft'
  const isRejected = permit.status === 'rejected'
  const canEdit = isDraft || isRejected

  if (!canEdit) {
    notFound()
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="mb-6">
          <BackButton href={`/permits/${id}`} label="Back to Permit" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Edit Permit
              </h1>
              <p className="mt-1 text-muted-foreground">
                Update the permit details before submitting for approval.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={permit.status} />
              <Badge variant="secondary">
                <FileText className="mr-1 h-3 w-3" />
                {permit.permit_no}
              </Badge>
            </div>
          </div>

          {/* Last updated */}
          {permit.updated_at && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last updated {formatDate(permit.updated_at)}
            </p>
          )}
        </div>

        {/* Workflow Info Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {isRejected ? 'Revising rejected permit' : 'Draft editing'}
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              {isRejected ? (
                <>
                  Address the rejection reasons and update the permit details. 
                  Once complete, return to the permit page to resubmit for approval.
                </>
              ) : (
                <>
                  Save your changes here. When the permit is complete, 
                  return to the permit page to submit it for approval and 
                  complete the safety verification process.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Rejection reasons if applicable */}
        {isRejected && permit.rejection_reason && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Rejection Reason
              </p>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {permit.rejection_reason}
              </p>
            </div>
          </div>
        )}

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

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    draft: {
      label: 'Draft',
      className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    },
    rejected: {
      label: 'Rejected',
      className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    },
  }

  const config = configs[status] || configs.draft

  return (
    <Badge variant="secondary" className={config.className}>
      {config.label}
    </Badge>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
