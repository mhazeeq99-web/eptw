'use client'

import { useEffect, useState } from 'react'
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2, 
  AlertTriangle,
  RefreshCw,
  Shield,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type ReadinessResult = {
  ready: boolean
  blocking_reasons: string[]
}

type ReadinessState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'blocked'; reasons: string[] }
  | { status: 'pending' }
  | { status: 'error' }

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
  const [expanded, setExpanded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState({ status: 'loading' })

      try {
        const response = await fetch(
          `/api/permits/${permitId}/readiness`
        )

        if (!response.ok) {
          if (!cancelled) {
            setState({ status: 'error' })
          }
          return
        }

        const result = (await response.json()) as ReadinessResult

        if (cancelled) return

        if (result.ready === true) {
          setState({ status: 'ready' })
        } else {
          const reasons = Array.isArray(result.blocking_reasons)
            ? result.blocking_reasons
            : ['Not ready for safety approval.']
          
          setState({ status: 'blocked', reasons })
        }
      } catch {
        if (!cancelled) {
          setState({ status: 'error' })
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [permitId, retryCount])

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
  }

  if (state.status === 'loading') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Checking readiness...</span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-2">
        <Badge variant="destructive" className="gap-1.5">
          <AlertTriangle className="h-3 w-3" />
          Failed to check
        </Badge>
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    )
  }

  if (state.status === 'ready') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 dark:bg-green-900/50 dark:text-green-300">
        <CheckCircle2 className="h-4 w-4" />
        <span>Ready for Approval</span>
      </div>
    )
  }

  if (state.status === 'blocked') {
    return (
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-900/50 dark:text-red-300">
          <XCircle className="h-4 w-4" />
          <span>Blocked</span>
          <span className="rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-red-800">
            {state.reasons.length}
          </span>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Hide issues
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              View issues ({state.reasons.length})
            </>
          )}
        </button>

        {expanded && (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            {state.reasons.map((reason, index) => (
              <div key={index} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <p className="text-xs leading-snug text-red-700 dark:text-red-300">
                  {reason}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Pending state
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300">
      <Clock className="h-4 w-4" />
      <span>Pending Review</span>
    </div>
  )
}