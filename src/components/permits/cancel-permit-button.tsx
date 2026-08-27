'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionSuccessDialog } from './action-success-dialog'

export function CancelPermitButton({
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

  async function handleCancel() {
    const remarks = window.prompt(
      'Enter the reason for cancelling this permit:'
    )

    if (remarks === null) {
      return
    }

    if (!remarks.trim()) {
      setError('A cancellation reason is required.')
      return
    }

    const confirmed = window.confirm(
      'Cancel this permit? This action cannot be undone.'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/cancel`,
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
            'Unable to cancel permit.'
        )
        return
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError(
        'Unable to cancel permit.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleCancel}
        disabled={loading}
        className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Cancelling...' : 'Cancel Permit'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}

      <ActionSuccessDialog
        open={success}
        title="Permit Cancelled"
        message="This permit has been cancelled and is no longer active."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </div>
  )
}
