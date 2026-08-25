'use client'

import { useEffect, useState } from 'react'

type ReadinessResult = {
  ready: boolean
  blocking_reasons: string[]
}

type ReadinessState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'blocked'; reason: string }
  | { status: 'pending' }

/**
 * Readiness badge for a single pending permit.
 *
 * Fetches the SAME server-side safety-readiness evaluation that the approval
 * API uses (GET /api/permits/[id]/readiness), so the badge always reflects
 * the server's authoritative `ready` / `blocking_reasons` — readiness is
 * never computed on the client.
 */
export function ReadinessBadge({
  permitId,
}: {
  permitId: number
}) {
  const [state, setState] = useState<ReadinessState>({
    status: 'loading',
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch(
          `/api/permits/${permitId}/readiness`
        )
        const result = (await response.json()) as ReadinessResult

        if (cancelled) return

        if (!response.ok) {
          setState({ status: 'pending' })
          return
        }

        if (result.ready === true) {
          setState({ status: 'ready' })
        } else {
          const reason =
            Array.isArray(result.blocking_reasons) &&
            result.blocking_reasons.length > 0
              ? result.blocking_reasons[0]
              : 'Not ready for safety approval.'
          setState({ status: 'blocked', reason })
        }
      } catch {
        if (!cancelled) {
          setState({ status: 'pending' })
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [permitId])

  if (state.status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold uppercase text-green-700 dark:bg-green-950 dark:text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Ready
      </span>
    )
  }

  if (state.status === 'blocked') {
    return (
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold uppercase text-red-700 dark:bg-red-950 dark:text-red-300">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Blocked
        </span>

        <p className="max-w-[240px] text-xs leading-snug text-red-700 dark:text-red-300">
          {state.reason}
        </p>
      </div>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase text-amber-700 dark:bg-amber-950 dark:text-amber-300">
      <span
        className={`h-1.5 w-1.5 rounded-full bg-amber-500 ${
          state.status === 'loading' ? 'animate-pulse' : ''
        }`}
      />
      {state.status === 'loading' ? 'Checking' : 'Pending'}
    </span>
  )
}
