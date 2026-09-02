'use client'

import { useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Standardized "Verify" button for the top-right of safety sections.
 *
 * - verified   -> green pill with a tick and "Verified"
 * - canVerify  -> normal "Verify" button
 * - otherwise  -> yellow "Pending" pill (visible to non-verifiers, e.g.
 *                 internal staff / contractor admin, so the section state is
 *                 always visible)
 *
 * The parent supplies an async `onVerify` that performs the actual
 * verification (server call) and returns success; the button manages its own
 * loading state and refreshes after the call.
 */
export function SectionVerifyButton({
  verified,
  onVerify,
  label = 'Verify',
  className,
  canVerify = true,
}: {
  verified: boolean
  onVerify: () => Promise<boolean>
  label?: string
  className?: string
  /** When false, the button is hidden and a "Pending" pill is shown instead. */
  canVerify?: boolean
}) {
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    if (verifying) return
    setVerifying(true)
    setError('')
    try {
      await onVerify()
    } catch {
      setError('Unable to verify')
    } finally {
      setVerifying(false)
    }
  }

  if (verified) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300",
          className
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Verified
      </span>
    )
  }

  if (!canVerify) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
          className
        )}
      >
        <Circle className="h-3 w-3" />
        Pending
      </span>
    )
  }

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        size="sm"
        onClick={handleClick}
        disabled={verifying}
      >
        {verifying ? 'Verifying...' : label}
      </Button>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
