'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ReviewPermit({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()

  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleReview(
    action: 'approved' | 'rejected'
  ) {
    if (
      action === 'rejected' &&
      !remarks.trim()
    ) {
      setError(
        'Please provide a reason before rejecting this permit.'
      )
      return
    }

    const message =
      action === 'approved'
        ? 'Approve this permit?'
        : 'Reject this permit?'

    if (!window.confirm(message)) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            remarks: remarks.trim(),
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Unable to process permit review.'
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
    <section className="mt-6 rounded-xl border bg-background">
      <div className="border-b px-6 py-4">
        <h2 className="font-semibold">
          Supervisor Review
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Review this permit before approving or rejecting it.
        </p>
      </div>

      <div className="space-y-4 p-6">

        <div>
          <label
            htmlFor="review-remarks"
            className="text-sm font-medium"
          >
            Review Remarks
          </label>

          <textarea
            id="review-remarks"
            value={remarks}
            onChange={(event) =>
              setRemarks(event.target.value)
            }
            placeholder="Enter your review remarks..."
            rows={4}
            disabled={loading}
            className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">

          <button
            type="button"
            onClick={() =>
              handleReview('rejected')
            }
            disabled={loading}
            className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Processing...'
              : 'Reject'}
          </button>

          <button
            type="button"
            onClick={() =>
              handleReview('approved')
            }
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Processing...'
              : 'Approve'}
          </button>

        </div>
      </div>
    </section>
  )
}