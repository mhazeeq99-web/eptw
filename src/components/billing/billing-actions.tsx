'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

/**
 * Checkout + cancellation controls for the subscription page.
 * All billing actions are server-side; these buttons only call the API and
 * follow the returned URL. The company is never upgraded client-side.
 */
export function BillingActions({
  isPro,
  periodEnd,
}: {
  isPro: boolean
  periodEnd?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function startCheckout() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.url) {
        window.location.href = body.url
        return
      }
      setError(
        body.error ??
          'Unable to start the Pro checkout. Please try again.'
      )
    } catch {
      setError('Unable to start the Pro checkout. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelPro() {
    if (
      !window.confirm(
        'Cancel the Pro subscription? Your company will revert to the Free plan. Existing permits and data remain accessible.'
      )
    ) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Unable to cancel the subscription.')
        return
      }
      router.refresh()
    } catch {
      setError('Unable to cancel the subscription. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {isPro ? (
        <button
          type="button"
          onClick={cancelPro}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Cancel Pro
        </button>
      ) : (
        <button
          type="button"
          onClick={startCheckout}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Start Pro Checkout
        </button>
      )}

      {periodEnd && isPro && (
        <p className="text-xs text-muted-foreground">
          Next billing date:{' '}
          {new Date(periodEnd).toLocaleDateString()}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

/**
 * Transient notice shown after the customer returns from HitPay.
 * A browser redirect is NEVER treated as payment confirmation — this banner
 * only tells the user the webhook confirmation is pending, with a refresh
 * that re-reads the real (server-side) subscription state.
 */
export function PaymentStatusNotice() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const reference = searchParams.get('reference')
  const status = searchParams.get('status')

  if (!reference) return null

  return (
    <div className="flex items-start gap-3 rounded-md border bg-emerald-600/5 p-4">
      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
      <div className="flex-1">
        <p className="font-medium">Payment submitted</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {status && status !== 'completed'
            ? 'Your Pro subscription is being confirmed.'
            : 'Your Pro subscription is being confirmed.'}{' '}
          Once HitPay confirms the payment, your company will switch to Pro.
          If it does not update within a minute, click refresh below.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh status
        </button>
      </div>
    </div>
  )
}
