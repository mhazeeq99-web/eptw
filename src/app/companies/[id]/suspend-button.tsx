'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, PauseCircle, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Suspend / Reactivate control for a company, shown on the Platform Admin
 * company detail page.
 *
 * Suspension requires a confirmation and a non-empty reason; it only flips
 * `companies.is_active` via the API route and never deletes data.
 * Reactivation (shown when the company is already suspended) just re-enables
 * it.
 */
export function CompanySuspendButton({
  companyId,
  isActive,
  companyName,
}: {
  companyId: number
  isActive: boolean
  companyName: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/admin/companies/${companyId}/suspend`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: isActive ? 'suspend' : 'reactivate',
            reason: reason.trim(),
          }),
        }
      )

      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        setError(
          payload?.error ??
            'Something went wrong. Please try again.'
        )
        setSubmitting(false)
        return
      }

      setConfirming(false)
      setReason('')
      setSubmitting(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  if (!confirming) {
    return (
      <Button
        variant={isActive ? 'destructive' : 'default'}
        disabled={submitting}
        onClick={() => {
          setConfirming(true)
          setError(null)
        }}
      >
        {isActive ? (
          <PauseCircle />
        ) : (
          <PlayCircle />
        )}
        {isActive ? 'Suspend Company' : 'Reactivate'}
      </Button>
    )
  }

  return (
    <div className="w-full rounded-xl border bg-background p-4 sm:max-w-sm">
      <p className="font-semibold">
        {isActive ? 'Suspend this company?' : 'Reactivate this company?'}
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        {isActive
          ? `Suspending ${companyName} disables the company on the platform. No data will be deleted.`
          : `Reactivating ${companyName} re-enables the company on the platform.`}
      </p>

      {isActive && (
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason for suspension (required)..."
          rows={3}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={isActive ? 'destructive' : 'default'}
          onClick={handleConfirm}
          disabled={submitting || (isActive && !reason.trim())}
        >
          {submitting && <LoaderCircle className="animate-spin" />}
          {isActive ? 'Confirm Suspension' : 'Confirm Reactivation'}
        </Button>

        <Button
          variant="outline"
          disabled={submitting}
          onClick={() => {
            setConfirming(false)
            setReason('')
            setError(null)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
