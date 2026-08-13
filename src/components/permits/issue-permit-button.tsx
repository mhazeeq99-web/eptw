'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function IssuePermitButton({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleIssue() {
    const confirmed = window.confirm(
      'Issue this permit for work execution?'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/issue`,
        {
          method: 'POST',
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Unable to issue permit.'
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
        onClick={handleIssue}
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? 'Issuing...'
          : 'Issue Permit'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}