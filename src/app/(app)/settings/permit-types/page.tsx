import { FileText, Layers } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { PermitTypesManager } from '@/components/settings/permit-types-manager'

/**
 * Permit Types settings page.
 *
 * Dedicated page for the Permit Types section previously rendered by the
 * monolithic SettingsManager: the catalogue table with add / toggle-active /
 * delete, plus the per-type document requirement flags.
 */
export default async function PermitTypesSettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6">
        <BackButton href="/settings" label="Back to Settings" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Permit Types
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Permit categories for your company and their document
                  requirements
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Layers className="mr-1 h-3 w-3" />
            Company Configuration
          </Badge>
        </div>

        <PermitTypesManager />
      </div>
    </>
  )
}
