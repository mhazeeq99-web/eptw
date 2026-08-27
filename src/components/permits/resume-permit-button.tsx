'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionSuccessDialog } from './action-success-dialog'

export function ResumePermitButton({
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

  async function handleResume() {
    const remarks = window.prompt(
      'Enter the reason for resuming this permit:'
    )

    if (remarks === null) {
      return
    }

    if (!remarks.trim()) {
      setError('A resume reason is required.')
      return
    }

    const confirmed = window.confirm(
      'Resume this permit and allow work to continue?'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/resume`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            remarks: remarks.trim(),
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Unable to resume permit.'
        )
        return
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError(
        'Unable to resume permit.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleResume}
        disabled={loading}
        className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Resuming...' : 'Resume Work'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}

      <ActionSuccessDialog
        open={success}
        title="Permit Resumed"
        message="Work may now continue under this permit."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </div>
  )
}