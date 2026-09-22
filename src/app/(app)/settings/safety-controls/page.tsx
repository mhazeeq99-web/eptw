import { ShieldCheck, Layers } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { SafetyControlsManager } from '@/components/settings/safety-controls-manager'

/**
 * Safety Controls settings page.
 *
 * Dedicated page for the Safety Controls catalogue AND the Required Controls
 * mapping (per permit type) together, as requested — previously rendered by
 * the monolithic SettingsManager. The Required Controls section uses a permit
 * type selector, with the Safety Controls catalogue below it.
 */
export default async function SafetyControlsSettingsPage() {
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
                <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Safety Controls
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Manage the safety controls library and which controls
                  each permit type requires
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Layers className="mr-1 h-3 w-3" />
            Company Configuration
          </Badge>
        </div>

        <SafetyControlsManager />
      </div>
    </>
  )
}
