'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Shield, 
  ArrowRight,
  RefreshCw,
  Lock,
  FileCheck,
  ChevronRight
} from 'lucide-react'
import { ActionSuccessDialog } from '../action-success-dialog'
import { PERMIT_CHANGED_EVENT } from '@/lib/permit-changed'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export type ReadinessItemData = {
  key: string
  label: string
  required: boolean
  status: 'complete' | 'incomplete' | 'not_required' | 'failed'
  reason: string | null
  priority: number
  sectionId?: string
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
  permitNo,
}: {
  permitId: number
  canApprove: boolean
  permitNo?: string
}) {
  const router = useRouter()

  const [items, setItems] = useState<ReadinessItemData[]>([])
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showAllItems, setShowAllItems] = useState(false)

  async function loadReadiness() {
    setLoading(true)
    setError('')
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

    const handleChange = () => {
      loadReadiness()
    }
    window.addEventListener(PERMIT_CHANGED_EVENT, handleChange)
    return () => {
      window.removeEventListener(PERMIT_CHANGED_EVENT, handleChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitId])

  async function handleApproveAndIssue() {
    if (!ready) return

    const confirmed = window.confirm(
      `Approve & Issue Permit ${permitNo || ''}\n\n` +
      'This will make the permit ACTIVE and authorize the work to proceed.\n\n' +
      'Do you want to continue?'
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
          result.error || 'Failed to approve and issue permit'
        )
        return
      }

      setSuccess(true)
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
  
  const completeItems = displayItems.filter(
    (item) => item.status === 'complete'
  )
  
  const incompleteItems = displayItems.filter(
    (item) => item.status === 'incomplete'
  )
  
  const failedItems = displayItems.filter(
    (item) => item.status === 'failed'
  )
  
  const blockingItems = displayItems.filter(
    (item) => item.required && (item.status === 'incomplete' || item.status === 'failed')
  )
  
  const totalRequired = displayItems.filter(item => item.required).length
  const completedRequired = displayItems.filter(
    item => item.required && item.status === 'complete'
  ).length

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Add a brief highlight
      element.classList.add('ring-2', 'ring-blue-500')
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500')
      }, 2000)
    }
  }

  return (
    <section className="mt-6 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4 bg-blue-50/50 dark:bg-blue-950/20">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-lg">
            <Shield className="h-6 w-6 text-blue-600" />
            Safety Approval Gate
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Final safety readiness check before approval.
          </p>
        </div>

        <ApprovalStatusBadge ready={ready} />
      </div>

      <div className="p-6">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={loadReadiness} />
        ) : (
          <>
            {/* Readiness Summary Banner */}
            <div className={cn(
              "rounded-lg border-2 p-6 text-center mb-6",
              ready 
                ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30" 
                : "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30"
            )}>
              {ready ? (
                <>
                  <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-3" />
                  <h3 className="text-xl font-bold text-green-700 dark:text-green-300 mb-1">
                    READY FOR SAFETY APPROVAL
                  </h3>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    All required safety controls are complete
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle className="mx-auto h-12 w-12 text-yellow-600 mb-3" />
                  <h3 className="text-xl font-bold text-yellow-700 dark:text-yellow-300 mb-1">
                    NOT READY FOR APPROVAL
                  </h3>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    {blockingItems.length} item{blockingItems.length !== 1 ? 's' : ''} require{blockingItems.length === 1 ? 's' : ''} attention
                  </p>
                </>
              )}
              
              {/* Completion count */}
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 dark:bg-gray-800">
                <span className="text-sm font-semibold">
                  {completedRequired} / {totalRequired} required complete
                </span>
                <div className="h-2 w-24 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
                  <div 
                    className={cn(
                      "h-full transition-all",
                      ready ? "bg-green-500" : "bg-yellow-500"
                    )}
                    style={{ 
                      width: `${totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0}%` 
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Quick status grid */}
            {ready ? (
              /* Compressed view when ready */
              <div className="mb-6">
                <div className="flex flex-wrap gap-2 justify-center">
                  {completeItems.map((item) => (
                    <Badge key={item.key} variant="success" className="text-sm">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      {item.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              /* Detailed view when not ready */
              <div className="mb-6 space-y-2">
                {displayItems.map((item) => (
                  <ReadinessItemRow
                    key={item.key}
                    item={item}
                    onNavigate={item.sectionId ? () => scrollToSection(item.sectionId) : undefined}
                  />
                ))}
              </div>
            )}

            {/* Blocking items */}
            {!ready && blockingItems.length > 0 && (
              <div className="mb-6">
                <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300 mb-3">
                    <XCircle className="h-5 w-5" />
                    {blockingItems.length} item{blockingItems.length !== 1 ? 's' : ''} block safety approval
                  </h4>
                  
                  <div className="space-y-3">
                    {blockingItems.map((item) => (
                      <div key={item.key} className="rounded-lg border border-red-200 bg-white p-3 dark:border-red-800 dark:bg-gray-800">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {item.label}
                            </p>
                            {item.reason && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {item.reason}
                              </p>
                            )}
                          </div>
                          {item.sectionId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => scrollToSection(item.sectionId!)}
                              className="shrink-0"
                            >
                              Review
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="mb-4 text-sm text-destructive">{error}</p>
            )}

            {/* Approval action */}
            {canApprove && (
              <div className="border-t pt-6">
                {ready ? (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      You are about to approve and issue:
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      {permitNo || `Permit #${permitId}`}
                    </p>
                    <Button
                      size="lg"
                      onClick={handleApproveAndIssue}
                      disabled={!ready || approving}
                      className="px-8"
                    >
                      <FileCheck className="mr-2 h-5 w-5" />
                      {approving ? 'Approving...' : 'Approve & Issue Permit'}
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Lock className="mx-auto h-6 w-6 text-gray-400 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Approval unavailable until all required items are complete
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ActionSuccessDialog
        open={success}
        title="Permit Approved & Issued"
        message="This permit is now ACTIVE and the work may proceed."
        permitNo={permitNo}
        permitId={permitId}
        onClose={() => setSuccess(false)}
      />
    </section>
  )
}

/* =========================================================
   READINESS ITEM ROW
   ========================================================= */

function ReadinessItemRow({
  item,
  onNavigate,
}: {
  item: ReadinessItemData
  onNavigate?: () => void
}) {
  const getStatusConfig = () => {
    switch (item.status) {
      case 'complete':
        return {
          icon: CheckCircle2,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-50/50 dark:bg-green-950/20',
          borderColor: 'border-green-200 dark:border-green-800',
          label: 'Complete',
          labelColor: 'text-green-700 dark:text-green-300',
        }
      case 'failed':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50/50 dark:bg-red-950/20',
          borderColor: 'border-red-200 dark:border-red-800',
          label: 'Failed',
          labelColor: 'text-red-700 dark:text-red-300',
        }
      case 'incomplete':
        return {
          icon: AlertTriangle,
          iconColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50/50 dark:bg-yellow-950/20',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          label: 'Action required',
          labelColor: 'text-yellow-700 dark:text-yellow-300',
        }
      default:
        return {
          icon: AlertTriangle,
          iconColor: 'text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-800',
          borderColor: 'border-gray-200 dark:border-gray-700',
          label: 'Not required',
          labelColor: 'text-gray-500 dark:text-gray-400',
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-lg border p-3",
      config.bgColor,
      config.borderColor
    )}>
      <div className="flex items-center gap-3 flex-1">
        <Icon className={cn("h-5 w-5 shrink-0", config.iconColor)} />
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {item.label}
          </p>
          {item.reason && item.status !== 'complete' && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.reason}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={cn(
          "text-xs font-medium",
          config.labelColor
        )}>
          {config.label}
        </span>
        {onNavigate && item.status !== 'complete' && (
          <button
            type="button"
            onClick={onNavigate}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            Review
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

/* =========================================================
   STATUS BADGE
   ========================================================= */

function ApprovalStatusBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold uppercase",
        ready
          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
      )}
    >
      {ready ? (
        <>
          <CheckCircle2 className="h-4 w-4" />
          Ready
        </>
      ) : (
        <>
          <AlertTriangle className="h-4 w-4" />
          Not Ready
        </>
      )}
    </span>
  )
}

/* =========================================================
   LOADING STATE
   ========================================================= */

function LoadingState() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 bg-gray-200 rounded-lg dark:bg-gray-700" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg dark:bg-gray-800" />
        ))}
      </div>
    </div>
  )
}

/* =========================================================
   ERROR STATE
   ========================================================= */

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="text-center py-8">
      <AlertTriangle className="mx-auto h-12 w-12 text-yellow-600 mb-3" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
        Unable to determine permit readiness
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Safety readiness could not be verified. Please refresh or try again.
      </p>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  )
}
