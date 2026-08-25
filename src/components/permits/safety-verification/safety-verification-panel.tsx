'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export type ReadinessItemData = {
  key: string
  label: string
  required: boolean
  status: 'complete' | 'incomplete' | 'not_required'
  reason: string | null
  priority: number
}

/**
 * Central Safety Verification readiness panel. Fetches the SAME readiness
 * evaluation that the approval API uses (GET /api/permits/[id]/readiness),
 * so the UI never re-implements the safety rules. The approve button is
 * disabled when not ready, and the API enforces it server-side regardless.
 */
export function SafetyVerificationPanel({
  permitId,
  canApprove,
}: {
  permitId: number
  canApprove: boolean
}) {
  const router = useRouter()

  const [items, setItems] = useState<ReadinessItemData[]>([])
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')

  async function loadReadiness() {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/permits/${permitId}/readiness`
      )
      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to load readiness.'
        )
        return
      }

      setItems(result.items ?? [])
      setReady(result.ready === true)
    } catch {
      setError('Unable to load readiness.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReadiness()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitId])

  async function handleApproveAndIssue() {
    if (!ready) return

    const confirmed = window.confirm(
      'Approve and issue this permit? The permit will become ACTIVE.'
    )

    if (!confirmed) return

    setApproving(true)
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/approve-and-issue`,
        { method: 'POST' }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Failed to approve and issue permit'
        )
        return
      }

      router.refresh()
    } catch {
      setError('Unable to approve and issue permit')
    } finally {
      setApproving(false)
    }
  }

  const displayItems = items.filter(
    (item) => item.status !== 'not_required'
  )

  const blocking = items.filter(
    (item) => item.required && item.status === 'incomplete'
  )

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Safety Verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Final readiness evaluation before safety approval.
          </p>
        </div>

        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
            ready
              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {ready ? '🟢 Ready' : '🔴 Not ready'}
        </span>
      </div>

      <div className="p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Checking readiness...
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {displayItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        item.status === 'complete'
                          ? 'bg-green-500'
                          : item.status === 'incomplete'
                            ? 'bg-red-500'
                            : 'bg-muted-foreground/40'
                      }`}
                    />
                    <span className="font-medium">
                      {item.label}
                    </span>
                    {!item.required && (
                      <span className="text-xs text-muted-foreground">
                        (optional)
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-xs font-medium ${
                      item.status === 'complete'
                        ? 'text-green-600'
                        : item.status === 'incomplete'
                          ? 'text-red-600'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {item.status === 'complete'
                      ? '🟢 Complete'
                      : item.status === 'incomplete'
                        ? '🔴 Incomplete'
                        : '⚪ Not required'}
                  </span>
                </div>
              ))}
            </div>

            {blocking.length > 0 && (
              <div className="mt-4 space-y-1 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-950 dark:bg-red-950/30">
                {blocking.map((item) => (
                  <p
                    key={item.key}
                    className="text-xs text-red-700 dark:text-red-300"
                  >
                    {item.reason ?? `${item.label} is incomplete.`}
                  </p>
                ))}
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}

            {canApprove && (
              <div className="mt-5 border-t pt-4">
                <div
                  className={`rounded-lg border p-4 text-center ${
                    ready
                      ? 'border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                      : 'border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/30'
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      ready
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}
                  >
                    {ready
                      ? '🟢 PERMIT READY FOR SAFETY APPROVAL'
                      : '🔴 NOT READY — complete the items above'}
                  </p>

                  <button
                    type="button"
                    onClick={handleApproveAndIssue}
                    disabled={!ready || approving}
                    className="mt-3 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {approving
                      ? 'Approving...'
                      : 'Approve & Issue'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
