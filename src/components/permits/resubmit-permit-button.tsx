'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionSuccessDialog } from './action-success-dialog'

export function ResubmitPermitButton({
  permitId,
  permitNo,
}: {
  permitId: number
  permitNo?: string
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleResubmit() {
    const confirmed = window.confirm(
      'Resubmit this permit for supervisor approval?'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/resubmit`,
        {
          method: 'POST',
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Unable to resubmit permit.'
        )
        setLoading(false)
        return
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError(
        'Unable to connect to the server.'
      )
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleResubmit}
        disabled={loading}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? 'Resubmitting...'
          : 'Resubmit Permit'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <ActionSuccessDialog
        open={success}
        title="Permit Resubmitted"
        message="This permit has been resubmitted for review."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </div>
  )
}