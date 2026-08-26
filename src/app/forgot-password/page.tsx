'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setMessage('')

    // Redirect the user back to /update-password where they can
    // choose a new password after clicking the reset link.
    const redirectTo = `${window.location.origin}/update-password`

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo }
    )

    if (error) {
      // Never reveal whether the account exists: always show the
      // same generic message, even when the call itself fails.
      console.error('Password reset request failed:', error)
    }

    setLoading(false)
    setMessage(
      'If an account exists for this email, a password reset link has been sent.'
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
            Forgot Password?
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Enter the email address associated with your ePTW
            account and we will send you a password reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-sm font-medium"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {message && (
            <div className="rounded-md border border-green-600/30 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      </div>
    </main>
  )
}
