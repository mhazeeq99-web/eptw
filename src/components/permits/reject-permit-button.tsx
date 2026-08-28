'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionSuccessDialog } from './action-success-dialog'

export function RejectPermitButton({
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

      setSuccess(true)
      router.refresh()
    } catch {
      setError('Unable to reject permit.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleReject}
        disabled={loading}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-destructive px-4 text-sm font-medium text-destructive shadow-sm transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Rejecting...' : 'Reject Permit'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <ActionSuccessDialog
        open={success}
        title="Permit Rejected"
        message="This permit has been rejected. The requester can revise and resubmit it."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </div>
  )
}
