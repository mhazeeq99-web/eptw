'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionSuccessDialog } from './action-success-dialog'

export function ApproveAndIssueButton({
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

  async function handleApproveAndIssue() {
    const confirmed = window.confirm(
      'Approve and issue this permit? The permit will become ACTIVE.'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/approve-and-issue`,
        {
          method: 'POST',
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Failed to approve and issue permit'
        )
        return
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError(
        'Unable to approve and issue permit'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleApproveAndIssue}
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? 'Approving...'
          : 'Approve & Issue'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <ActionSuccessDialog
        open={success}
        title="Permit Approved & Issued"
        message="This permit is now ACTIVE and the work may proceed."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </div>
  )
}
