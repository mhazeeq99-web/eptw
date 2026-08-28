'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionSuccessDialog } from './action-success-dialog'

export function SuspendPermitButton({
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

  async function handleSuspend() {
    const remarks = window.prompt(
      'Enter the reason for suspending this permit:'
    )

    if (remarks === null) {
      return
    }

    if (!remarks.trim()) {
      setError('A suspension reason is required.')
      return
    }

    const confirmed = window.confirm(
      'Suspend this permit? Work must stop until the permit is resumed.'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/suspend`,
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
            'Unable to suspend permit.'
        )
        return
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError(
        'Unable to suspend permit.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSuspend}
        disabled={loading}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-destructive px-4 text-sm font-medium text-destructive shadow-sm transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Suspending...' : 'Suspend Permit'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <ActionSuccessDialog
        open={success}
        title="Permit Suspended"
        message="Work has been suspended and must stop until the permit is resumed."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </div>
  )
}