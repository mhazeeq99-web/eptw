'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type SessionStatus = 'checking' | 'authenticated' | 'unauthenticated'

export default function UpdatePasswordPage() {
  const supabase = createClient()

  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>('checking')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [updated, setUpdated] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return
      setSessionStatus(session ? 'authenticated' : 'unauthenticated')
    }

    checkSession()

    // The recovery/invitation link redirects here with a code that
    // Supabase exchanges for a session shortly after mount, so also
    // listen for the session becoming available.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSessionStatus(session ? 'authenticated' : 'unauthenticated')
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    setUpdated(true)

    // Fire-and-forget: mark an invited internal-staff account as
    // ACTIVE after they set their password via the invitation link.
    // Ignore any errors.
    fetch('/api/auth/activate-invitation', { method: 'POST' }).catch(
      () => {}
    )
  }

  if (sessionStatus === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">Checking...</p>
        </div>
      </main>
    )
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
          <Link
            href="/login"
            className="mb-6 inline-block text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            ← Back to Sign In
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              Update Password
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              The reset link is invalid or has expired.
            </p>
          </div>
        </div>
      </main>
    )
  }

  if (updated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              Update Password
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your password has been updated successfully.
            </p>
          </div>

          <Link
            href="/login"
            className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            [ Sign In ]
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
        <Link
          href="/login"
          className="mb-6 inline-block text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          ← Back to Sign In
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Update Password
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Choose a new password for your ePTW account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium"
            >
              New Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="confirmPassword"
              className="text-sm font-medium"
            >
              Confirm Password
            </label>

            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              placeholder="••••••••"
              minLength={8}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </main>
  )
}
