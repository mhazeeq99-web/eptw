'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SubmitPermitButton({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    const confirmed = window.confirm(
      'Are you sure you want to submit this permit for review?'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/submit`,
        {
          method: 'POST',
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to submit permit')
        setLoading(false)
        return
      }

      router.refresh()
    } catch {
      setError('Unable to submit permit')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Submitting...' : 'Submit Permit'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}