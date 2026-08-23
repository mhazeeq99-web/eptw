'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RejectPermitButton({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleReject() {
    const remarks = window.prompt(
      'Enter the reason for rejecting this permit:'
    )

    if (remarks === null) {
      return
    }

    if (!remarks.trim()) {
      setError('A rejection reason is required.')
      return
    }

    const confirmed = window.confirm(
      'Reject this permit? The requester will need to revise and resubmit.'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/reject`,
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
          result.error || 'Unable to reject permit.'
        )
        return
      }

      router.refresh()
    } catch {
      setError('Unable to reject permit.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleReject}
        disabled={loading}
        className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Rejecting...' : 'Reject Permit'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
