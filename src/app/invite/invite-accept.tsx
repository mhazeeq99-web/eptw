'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Accepts a staff invitation in-app.
 *
 * Why this exists: Supabase's hosted verify page (the raw action_link) signs
 * the user in with IMPLICIT-grant tokens in the URL hash, but this app's
 * browser client (@supabase/ssr) forces PKCE and REJECTS implicit tokens
 * (AuthPKCEGrantCodeExchangeError). The invited user's session would never be
 * created, and the /update-password step would then act on whichever session
 * already existed (e.g. the Safety Manager's own logged-in browser) — setting
 * the wrong account's password.
 *
 * Instead we verify the invite token directly with `verifyOtp` (type: invite),
 * which returns a session through the PKCE-safe endpoint and saves it to the
 * app's cookies. The user then continues to /update-password as THEMSELVES.
 */
export function InviteAccept({ token }: { token: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [state, setState] = useState<
    'idle' | 'working' | 'success' | 'error'
  >('idle')
  const [message, setMessage] = useState('')

  async function handleAccept() {
    if (state === 'working') return
    setState('working')
    setMessage('')

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        type: 'invite',
        token_hash: token,
      })

      if (error) {
        setMessage(
          error.message === 'Email link is invalid or has expired'
            ? 'This invitation link is invalid or has expired. Ask your Safety Manager to resend the invitation.'
            : error.message
        )
        setState('error')
        return
      }

      if (!data?.session?.user) {
        setMessage('Unable to activate your account. Please try again.')
        setState('error')
        return
      }

      setState('success')
      // Session now belongs to the invited user. Go set the password.
      router.replace('/update-password')
      router.refresh()
    } catch {
      setMessage('Unable to activate your account. Please try again.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 p-4 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
        <CheckCircle2 className="h-5 w-5" />
        Account activated — taking you to set your password…
      </div>
    )
  }

  return (
    <div>
      {state === 'error' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={state === 'working'}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'working' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying…
          </>
        ) : (
          <>
            Continue Registration
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  )
}
