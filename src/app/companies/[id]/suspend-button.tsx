'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  LoaderCircle, 
  PauseCircle, 
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ShieldAlert,
  RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Suspend / Reactivate control for a company, shown on the Platform Admin
 * company detail page.
 *
 * Suspension requires a confirmation and a non-empty reason; it only flips
 * `companies.is_active` via the API route and never deletes data.
 * Reactivation (shown when the company is already suspended) just re-enables
 * it.
 */
export function CompanySuspendButton({
  companyId,
  isActive,
  companyName,
}: {
  companyId: number
  isActive: boolean
  companyName: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleConfirm() {
    if (submitting) return

    setSubmitting(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch(
        `/api/admin/companies/${companyId}/suspend`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: isActive ? 'suspend' : 'reactivate',
            reason: reason.trim(),
          }),
        }
      )

      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        setError(
          payload?.error ??
            'Something went wrong. Please try again.'
        )
        setSubmitting(false)
        return
      }

      setSuccess(true)
      setConfirming(false)
      setReason('')
      setSubmitting(false)
      
      // Show success message briefly before refreshing
      setTimeout(() => {
        router.refresh()
      }, 1000)
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  function handleCancel() {
    setConfirming(false)
    setReason('')
    setError(null)
    setSuccess(false)
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            {isActive ? 'Company Suspended' : 'Company Reactivated'}
          </p>
          <p className="text-xs text-green-700 dark:text-green-300">
            {companyName} has been {isActive ? 'suspended' : 'reactivated'} successfully.
          </p>
        </div>
      </div>
    )
  }

  if (!confirming) {
    return (
      <Button
        variant={isActive ? 'destructive' : 'default'}
        disabled={submitting}
        onClick={() => {
          setConfirming(true)
          setError(null)
        }}
        className={cn(
          "gap-2",
          isActive 
            ? "bg-red-600 hover:bg-red-700" 
            : "bg-green-600 hover:bg-green-700"
        )}
      >
        {submitting ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : isActive ? (
          <PauseCircle className="h-4 w-4" />
        ) : (
          <PlayCircle className="h-4 w-4" />
        )}
        {isActive ? 'Suspend Company' : 'Reactivate Company'}
      </Button>
    )
  }

  return (
    <Card className={cn(
      "w-full border-2",
      isActive 
        ? "border-red-200 dark:border-red-800" 
        : "border-green-200 dark:border-green-800"
    )}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn(
            "rounded-full p-2",
            isActive 
              ? "bg-red-100 dark:bg-red-900/50" 
              : "bg-green-100 dark:bg-green-900/50"
          )}>
            {isActive ? (
              <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400" />
            ) : (
              <RotateCcw className="h-6 w-6 text-green-600 dark:text-green-400" />
            )}
          </div>
          <div>
            <h3 className={cn(
              "text-lg font-semibold",
              isActive 
                ? "text-red-700 dark:text-red-300" 
                : "text-green-700 dark:text-green-300"
            )}>
              {isActive ? 'Suspend This Company?' : 'Reactivate This Company?'}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {isActive
                ? `Suspending ${companyName} will disable access for all users. This action can be reversed at any time.`
                : `Reactivating ${companyName} will restore access for all users immediately.`}
            </p>
          </div>
        </div>

        {/* Warning Box */}
        {isActive && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Suspending a company will:
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>Prevent all users from logging in</li>
                <li>Stop new permit creation</li>
                <li>Not delete any existing data</li>
              </ul>
            </p>
          </div>
        )}

        {/* Reason Input */}
        {isActive && (
          <div className="mt-4">
            <label
              htmlFor="suspension-reason"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Reason for Suspension
              <span className="ml-1 text-red-500">*</span>
            </label>
            <textarea
              id="suspension-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Enter the reason for suspending this company..."
              rows={3}
              className={cn(
                "mt-2 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors",
                "placeholder:text-gray-400",
                "focus:border-red-500 focus:ring-2 focus:ring-red-500/20",
                error
                  ? "border-red-500"
                  : "border-gray-300 dark:border-gray-600",
                "dark:bg-gray-800 dark:text-gray-100"
              )}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {reason.length}/500 characters
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <XCircle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant={isActive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={submitting || (isActive && !reason.trim())}
            className={cn(
              "gap-2",
              isActive 
                ? "bg-red-600 hover:bg-red-700" 
                : "bg-green-600 hover:bg-green-700"
            )}
          >
            {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {isActive ? 'Confirm Suspension' : 'Confirm Reactivation'}
          </Button>

          <Button
            variant="outline"
            disabled={submitting}
            onClick={handleCancel}
            className="gap-2"
          >
            <XCircle className="h-4 w-4" />
            Cancel
          </Button>
        </div>

        {/* Info Note */}
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Info className="h-3.5 w-3.5" />
          This action is logged and can be reversed at any time.
        </div>
      </CardContent>
    </Card>
  )
}