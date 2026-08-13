'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SuspendPermitButton({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSuspend}
        disabled={loading}
        className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Suspending...' : 'Suspend Permit'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}