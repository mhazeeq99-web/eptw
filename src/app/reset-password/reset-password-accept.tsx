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
 * Verifies a password-reset (recovery) token IN-APP.
 *
 * Mirrors the invite-accept flow: Supabase's hosted verify page redirects with
 * implicit-grant hash tokens that this app's PKCE browser client rejects, so
 * the token is verified directly with `verifyOtp` (type: recovery), which
 * returns a session through the PKCE-safe endpoint. The user then continues to
 * /update-password as THEMSELVES to choose a new password.
 */
export function ResetPasswordAccept({ token }: { token: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [state, setState] = useState<
    'idle' | 'working' | 'success' | 'error'
  >('idle')
  const [message, setMessage] = useState('')

  async function handleContinue() {
    if (state === 'working') return
    setState('working')
    setMessage('')

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token_hash: token,
      })

      if (error) {
        setMessage(
          error.message === 'Email link is invalid or has expired'
            ? 'This reset link is invalid or has expired. Please request a new password reset link.'
            : error.message
        )
        setState('error')
        return
      }

      if (!data?.session?.user) {
        setMessage('Unable to verify your reset link. Please try again.')
        setState('error')
        return
      }

      setState('success')
      // Session now belongs to the verified user. Go set the new password.
      router.replace('/update-password')
      router.refresh()
    } catch {
      setMessage('Unable to verify your reset link. Please try again.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 p-4 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
        <CheckCircle2 className="h-5 w-5" />
        Link verified — taking you to choose a new password…
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
        onClick={handleContinue}
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
            Continue to Reset Password
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  )
}
