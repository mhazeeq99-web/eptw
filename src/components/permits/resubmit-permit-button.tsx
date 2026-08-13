'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ResubmitPermitButton({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

      router.refresh()
    } catch {
      setError(
        'Unable to connect to the server.'
      )
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleResubmit}
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? 'Resubmitting...'
          : 'Resubmit Permit'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}