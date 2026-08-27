'use client'

import Link from 'next/link'

/**
 * Reusable success confirmation dialog shown after a permit action completes
 * (submit, approve, cancel, reject, suspend, resume, complete, close, etc.).
 *
 * Renders a modal with a green check, the action title, the affected permit
 * number and a short message. The user can continue to the permit or close.
 */
export function ActionSuccessDialog({
  open,
  title,
  message,
  permitNo,
  permitId,
  onClose,
}: {
  open: boolean
  title: string
  message?: string
  permitNo?: string
  permitId?: number
  onClose: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-lg"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700 dark:bg-green-950 dark:text-green-300">
          ✓
        </div>

        <h2 className="mt-4 text-xl font-bold">
          {title}
        </h2>

        {permitNo && (
          <p className="mt-2 text-lg font-semibold text-primary">
            {permitNo}
          </p>
        )}

        {message && (
          <p className="mt-1 text-sm text-muted-foreground">
            {message}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          {permitId && (
            <Link
              href={`/permits/${permitId}`}
              onClick={onClose}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              View Permit
            </Link>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-5 py-2 text-sm font-medium hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
