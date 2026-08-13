'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CompletePermitButton({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    </div>
  )
}