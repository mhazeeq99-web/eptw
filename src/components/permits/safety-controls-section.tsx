'use client'

import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { SafetyStatusPill } from './safety-status-pill'
import { SectionVerifyButton } from './section-verify-button'
import { AddSafetyControlButton } from './add-safety-control-button'

type Control = {
  id: number
  is_required: boolean
  status: string
  safety_control: { id: number; name: string } | null
}

/**
 * Safety Controls section. Shows each required/selected control with a status
 * pill, and a SINGLE "Verify" button in the top-right that bulk-verifies all
 * required controls at once (instead of verifying one by one).
 */
export function SafetyControlsSection({
  permitId,
  controls,
  canVerify,
  canAdd,
}: {
  permitId: number
  controls: Control[]
  canVerify: boolean
  canAdd: boolean
}) {
  const router = useRouter()

  const allVerified =
    controls.length > 0 &&
    controls.every(
      (c) => !c.is_required || c.status === 'verified'
    )

  async function handleVerify(): Promise<boolean> {
    const response = await fetch(
      `/api/permits/${permitId}/safety-controls/verify`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Unable to verify safety controls')
    }
    notifyPermitChanged()
    router.refresh()
    return true
  }

  return (
    <section id="controls-section" className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Shield className="h-5 w-5 text-blue-600" />
            Safety Controls
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Required and selected safety controls for this permit
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && (
            <AddSafetyControlButton permitId={permitId} canAdd={canAdd} />
          )}
          <SectionVerifyButton
            verified={allVerified}
            canVerify={canVerify}
            onVerify={handleVerify}
          />
        </div>
      </div>
      <div className="p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {controls.length ? (
            controls.map((control) => (
              <div
                key={control.id}
                className={`rounded-lg border p-4 transition-colors ${
                  control.status === 'verified'
                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {control.safety_control?.name ?? 'Safety Control'}
                    </p>
                    {control.is_required && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Required
                      </p>
                    )}
                  </div>
                  <SafetyStatusPill status={control.status} />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground col-span-full">
              No safety controls configured for this permit.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
