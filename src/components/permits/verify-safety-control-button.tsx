'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function VerifySafetyControlButton({
  permitId,
  controlId,
}: {
  permitId: number
  controlId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleVerify() {
    setError('')
    setLoading(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/safety-controls/${controlId}/verify`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Failed to verify safety control'
        )
        return
      }

      router.refresh()
    } catch {
      setError(
        'Unable to verify safety control'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleVerify}
        disabled={loading}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Verifying...' : 'Verify'}
      </button>

      {error && (
        <p className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
