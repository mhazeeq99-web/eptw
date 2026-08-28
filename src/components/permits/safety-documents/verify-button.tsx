'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifyPermitChanged } from '@/lib/permit-changed'

export function VerifySafetyDocButton({
  permitId,
  kind,
  docId,
}: {
  permitId: number
  kind: 'jha' | 'loto' | 'gas-test'
  docId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const pathMap: Record<typeof kind, string> = {
    jha: 'jha',
    loto: 'loto',
    'gas-test': 'gas-tests',
  }

  async function handleVerify() {
    if (!window.confirm('Verify this item?')) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/${pathMap[kind]}/${docId}/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'verified',
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to verify.'
        )
        return
      }

      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to verify.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleVerify}
        disabled={loading}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Verifying...' : 'Verify'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
