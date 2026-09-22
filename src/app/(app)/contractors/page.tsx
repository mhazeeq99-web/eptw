import { ContractorsManager } from '@/components/contractors/contractors-manager'
import { BackButton } from '@/components/ui/back-button'
import { 
  Building2, 
  Users, 
  HardHat,
  Shield,
  Info
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export default function ContractorsPage() {
  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-6">
          <BackButton href="/settings" label="Back to Management" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Contractors
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Manage contractor companies and their access
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Users className="mr-1 h-3 w-3" />
            Contractor Management
          </Badge>
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              About Contractors
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Contractors are external companies authorized to submit permits on behalf of your organization. You can manage their access, assign them to specific companies, and control their permit submission permissions.
            </p>
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardContent className="p-6">
            <ContractorsManager />
          </CardContent>
        </Card>
      </div>
    </>
  )
}