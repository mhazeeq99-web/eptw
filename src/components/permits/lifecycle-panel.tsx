'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDateTimeMY } from '@/lib/dates'

type ChecklistItem = {
  item_key: string
  label: string
  status?: string
  is_required?: boolean
  completed?: boolean
  verified_by?: string | null
  verified_at?: string | null
  remarks?: string | null
}

type LifecycleData = {
  validity: {
    state: 'none' | 'active' | 'expiring_soon' | 'expired'
    valid_from: string | null
    valid_until: string | null
    minutes_remaining: number | null
  }
  resume_checklist: ChecklistItem[]
  completion_checklist: ChecklistItem[]
  closure_checklist: ChecklistItem[]
}

/**
 * Phase F lifecycle panel: shows the central validity state and drives the
 * resume (revalidation) / completion / closure checklists with the SAME
 * server-side rules (GET /api/permits/[id]/lifecycle + the lifecycle APIs).
 */
export function LifecyclePanel({
  permitId,
  status,
  canAct,
}: {
  permitId: number
  status: string
  canAct: boolean
}) {
  const router = useRouter()

  const [data, setData] = useState<LifecycleData | null>(null)
  const [resumeState, setResumeState] = useState<Record<string, string>>({})
  const [completionState, setCompletionState] = useState<
    Record<string, boolean>
  >({})
  const [closureState, setClosureState] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')

  async function loadLifecycle() {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/permits/${permitId}/lifecycle`
      )
      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Unable to load lifecycle.')
        return
      }

      setData(result)

      const resume: Record<string, string> = {}
      for (const item of result.resume_checklist ?? []) {
        resume[item.item_key] = item.status ?? 'applicable'
      }
      setResumeState(resume)

      const completion: Record<string, boolean> = {}
      for (const item of result.completion_checklist ?? []) {
        completion[item.item_key] = item.completed === true
      }
      setCompletionState(completion)

      const closure: Record<string, boolean> = {}
      for (const item of result.closure_checklist ?? []) {
        closure[item.item_key] = item.completed === true
      }
      setClosureState(closure)
    } catch {
      setError('Unable to load lifecycle.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLifecycle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitId])

  const validity = data?.validity
  const validityLabel = (() => {
    switch (validity?.state) {
      case 'active':
        return {
          text: '🟢 Valid',
          cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
        }
      case 'expiring_soon':
        return {
          text: `🟠 Expiring soon${validity.minutes_remaining !== null ? ` — ${validity.minutes_remaining} min` : ''}`,
          cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        }
      case 'expired':
        return {
          text: '🔴 Expired',
          cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
        }
      default:
        return null
    }
  })()

  async function act(
    action: 'resume' | 'complete' | 'close',
    body: Record<string, unknown>
  ) {
    if (!window.confirm(`Confirm ${action}?`)) return
    setError('')
    setActing(true)
    try {
      const response = await fetch(
        `/api/permits/${permitId}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || `Unable to ${action} permit.`)
        return
      }
      router.refresh()
    } catch {
      setError(`Unable to ${action} permit.`)
    } finally {
      setActing(false)
    }
  }

  function handleResume() {
    const remarks = window.prompt('Reason for resuming this permit:')
    if (remarks === null) return
    if (!remarks.trim()) {
      setError('A resume reason is required.')
      return
    }
    act(
      'resume',
      {
        remarks: remarks.trim(),
        checklist: Object.entries(resumeState).map(
          ([item_key, itemStatus]) => ({
            item_key,
            status: itemStatus,
          })
        ),
      }
    )
  }

  function handleComplete() {
    const remarks = window.prompt('Completion remark:')
    if (remarks === null) return
    if (!remarks.trim()) {
      setError('A completion remark is required.')
      return
    }
    act(
      'complete',
      {
        remarks: remarks.trim(),
        checklist: Object.entries(completionState).map(
          ([item_key, completed]) => ({ item_key, completed })
        ),
      }
    )
  }

  function handleClose() {
    const remarks = window.prompt('Closing remark:')
    if (remarks === null) return
    if (!remarks.trim()) {
      setError('A closing remark is required.')
      return
    }
    act(
      'close',
      {
        remarks: remarks.trim(),
        checklist: Object.entries(closureState).map(
          ([item_key, completed]) => ({ item_key, completed })
        ),
      }
    )
  }

  const showResume = status === 'suspended'
  const showComplete = status === 'active'
  const showClose = status === 'completed'

  if (!showResume && !showComplete && !showClose) {
    return null
  }

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Permit Lifecycle</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Validity and work-state checklist for this permit.
          </p>
        </div>

        {validityLabel && (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${validityLabel.cls}`}
          >
            {validityLabel.text}
          </span>
        )}
      </div>

      <div className="p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading lifecycle...
          </p>
        ) : (
          <>
            {data?.validity?.state !== 'none' && data?.validity && (
              <div className="mb-4 rounded-md border bg-muted/30 p-3 text-sm">
                <p>
                  <span className="font-medium">Valid from:</span>{' '}
                  {formatDate(data.validity.valid_from)}
                </p>
                <p>
                  <span className="font-medium">Valid until:</span>{' '}
                  {formatDate(data.validity.valid_until)}
                </p>
              </div>
            )}

            {showResume && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  Resume / Revalidation Checklist
                </p>
                <p className="text-xs text-muted-foreground">
                  Applicable safety conditions must be re-confirmed before
                  work can resume.
                </p>

                <div className="space-y-2">
                  {data?.resume_checklist.map((item) => {
                    const state = resumeState[item.item_key] ?? 'applicable'
                    return (
                      <div
                        key={item.item_key}
                        className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-sm">{item.label}</span>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!canAct}
                            onClick={() =>
                              setResumeState((current) => ({
                                ...current,
                                [item.item_key]: 'completed',
                              }))
                            }
                            className={`rounded-md border px-3 py-1 text-xs font-medium ${
                              state === 'completed'
                                ? 'border-green-600 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                                : 'hover:bg-muted'
                            }`}
                          >
                            ✓ Completed
                          </button>
                          <button
                            type="button"
                            disabled={!canAct}
                            onClick={() =>
                              setResumeState((current) => ({
                                ...current,
                                [item.item_key]: 'not_applicable',
                              }))
                            }
                            className={`rounded-md border px-3 py-1 text-xs font-medium ${
                              state === 'not_applicable'
                                ? 'border-muted bg-muted/40 text-muted-foreground'
                                : 'hover:bg-muted'
                            }`}
                          >
                            Not Applicable
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {canAct && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleResume}
                      disabled={acting}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {acting ? 'Resuming...' : 'Resume Work'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {showComplete && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Work Completion</p>
                <p className="text-xs text-muted-foreground">
                  Confirm that the work has actually ended. Required items
                  must be completed.
                </p>

                <div className="space-y-2">
                  {data?.completion_checklist.map((item) => (
                    <label
                      key={item.item_key}
                      className="flex items-center gap-3 rounded-md border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={completionState[item.item_key] === true}
                        disabled={!canAct}
                        onChange={(event) =>
                          setCompletionState((current) => ({
                            ...current,
                            [item.item_key]: event.target.checked,
                          }))
                        }
                      />
                      {item.label}
                      {item.is_required && (
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          Required
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                {canAct && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleComplete}
                      disabled={acting}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {acting ? 'Completing...' : 'Complete Work'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {showClose && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Permit Closure</p>
                <p className="text-xs text-muted-foreground">
                  Final administrative confirmation. All items must be
                  completed.
                </p>

                <div className="space-y-2">
                  {data?.closure_checklist.map((item) => (
                    <label
                      key={item.item_key}
                      className="flex items-center gap-3 rounded-md border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={closureState[item.item_key] === true}
                        disabled={!canAct}
                        onChange={(event) =>
                          setClosureState((current) => ({
                            ...current,
                            [item.item_key]: event.target.checked,
                          }))
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                </div>

                {canAct && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={acting}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {acting ? 'Closing...' : 'Close Permit'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function formatDate(value: string | null) {
  return formatDateTimeMY(value)
}
