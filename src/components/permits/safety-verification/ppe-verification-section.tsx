'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type PpeVerificationItem = {
  ppe_item_id: number
  name: string
  category: string
  requirement: 'required' | 'recommended'
  is_selected: boolean
  verified: boolean
}

export function PpeVerificationSection({
  permitId,
  canEdit,
  initialItems,
}: {
  permitId: number
  canEdit: boolean
  initialItems: PpeVerificationItem[]
}) {
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const requiredItems = initialItems.filter(
    (item) => item.requirement === 'required'
  )
  const hasRequired = requiredItems.length > 0
  const allRequiredVerified =
    hasRequired &&
    requiredItems.every(
      (item) => item.is_selected && item.verified
    )

  async function handleVerify() {
    setError('')
    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/ppe-verification`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ verified: true }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to update PPE verification.'
        )
        return
      }

      router.refresh()
    } catch {
      setError('Unable to update PPE verification.')
    } finally {
      setSaving(false)
    }
  }

  if (!hasRequired) {
    return null
  }

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">PPE Verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmation that required PPE is available for this work.
            Recommended PPE never blocks approval.
          </p>
        </div>

        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
            allRequiredVerified
              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
          }`}
        >
          {allRequiredVerified
            ? 'Verified'
            : 'Not verified'}
        </span>
      </div>

      <div className="p-6">
        <div className="space-y-2">
          {initialItems.map((item) => (
            <div
              key={item.ppe_item_id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {item.name}
                </span>
                {item.requirement === 'required' ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    Required
                  </span>
                ) : (
                  <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    Recommended
                  </span>
                )}
              </div>

              <span
                className={`text-xs font-medium uppercase ${
                  item.requirement === 'required'
                    ? item.is_selected && item.verified
                      ? 'text-green-600'
                      : 'text-yellow-600'
                    : 'text-muted-foreground'
                }`}
              >
                {item.requirement === 'required'
                  ? item.is_selected && item.verified
                    ? '🟢 Available / Verified'
                    : item.is_selected
                      ? 'Selected — not verified'
                      : 'Not selected'
                  : '⚪ Recommended'}
              </span>
            </div>
          ))}
        </div>

        {canEdit && (
          <>
            {error && (
              <p className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleVerify}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : allRequiredVerified
                    ? 'Re-verify Required PPE'
                    : 'Verify Required PPE Available'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
