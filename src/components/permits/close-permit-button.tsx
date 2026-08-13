'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ClosePermitButton({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClose() {
    const remarks = window.prompt(
      'Enter the closing remark:'
    )

    if (remarks === null) {
      return
    }

    if (!remarks.trim()) {
      setError('A closing remark is required.')
      return
    }

    const confirmed = window.confirm(
      'Close this permit? This indicates the permit has been fully closed.'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/close`,
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
            'Unable to close permit.'
        )
        return
      }

      router.refresh()
    } catch {
      setError(
        'Unable to close permit.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleClose}
        disabled={loading}
        className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Closing...' : 'Close Permit'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}