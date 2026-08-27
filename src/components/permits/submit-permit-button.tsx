'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionSuccessDialog } from './action-success-dialog'

type SubmissionError = {
  field: string
  message: string
}

export function SubmitPermitButton({
  permitId,
  permitNo,
}: {
  permitId: number
  permitNo?: string
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<SubmissionError[]>([])
  const [success, setSuccess] = useState(false)

  async function handleSubmit() {
    const confirmed = window.confirm(
      'Are you sure you want to submit this permit for review?'
    )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setError('')
    setErrors([])

    try {
      const response = await fetch(
        `/api/permits/${permitId}/submit`,
        {
          method: 'POST',
        }
      )

      const result = await response.json()

      if (!response.ok) {
        if (Array.isArray(result.errors)) {
          setErrors(result.errors)
        } else {
          setError(result.error || 'Failed to submit permit')
        }
        setLoading(false)
        return
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError('Unable to submit permit')
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Submitting...' : 'Submit Permit'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {errors.length > 0 && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">
            The following must be completed before submission:
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-destructive/90">
            {errors.map((item, index) => (
              <li key={index}>{item.message}</li>
            ))}
          </ul>
        </div>
      )}

      <ActionSuccessDialog
        open={success}
        title="Permit Submitted"
        message="Your permit has been submitted and is now pending safety approval."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </div>
  )
}