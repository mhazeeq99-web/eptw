'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionSuccessDialog } from './action-success-dialog'

export function CompletePermitButton({
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

  async function handleComplete() {
    const remarks = window.prompt(
      'Enter the completion remark:'
    )

    if (remarks === null) {
      return
    }

    if (!remarks.trim()) {
      setError('A completion remark is required.')
      return
    }

    const confirmed = window.confirm(
      'Mark this permit as completed?'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/complete`,
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
            'Unable to complete permit.'
        )
        return
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError(
        'Unable to complete permit.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleComplete}
        disabled={loading}
        className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? 'Completing...'
          : 'Complete Work'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}

      <ActionSuccessDialog
        open={success}
        title="Permit Completed"
        message="This permit has been marked as completed."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </div>
  )
}