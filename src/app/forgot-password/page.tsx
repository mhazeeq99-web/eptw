'use client'

import { FormEvent, useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  Mail, 
  ArrowLeft, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  KeyRound,
  Shield,
  HardHat,
  Send,
  Timer,
  RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  function validateEmail(): boolean {
    setEmailError('')
    
    if (!email.trim()) {
      setEmailError('Email is required')
      return false
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address')
      return false
    }
    
    return true
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!validateEmail()) {
      return
    }

    setLoading(true)

    try {
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

      // Success message (always shown for security)
      setMessage(
        'If an account exists for this email, a password reset link has been sent.'
      )
      
      // Start resend timer (60 seconds)
      setResendTimer(60)
      
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Timer countdown effect
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => {
        setResendTimer(resendTimer - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [resendTimer])

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Background Decorative Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-100/40 blur-3xl dark:bg-blue-900/20" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl dark:bg-indigo-900/20" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-blue-600 p-3 shadow-lg shadow-blue-600/20">
            <HardHat className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              ePTW System
            </h1>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Electronic Permit to Work
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-900/50">
          <Link
            href="/login"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
                <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Forgot Password?
              </h2>
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Enter the email address associated with your ePTW account and we'll send you a password reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setEmailError('')
                    setMessage('')
                  }}
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                  disabled={loading || resendTimer > 0}
                  className={cn(
                    "w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100",
                    emailError
                      ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                      : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600",
                    (loading || resendTimer > 0) && "opacity-50 cursor-not-allowed"
                  )}
                />
              </div>
              {emailError && (
                <p className="flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle className="h-3 w-3" />
                  {emailError}
                </p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
              </div>
            )}

            {/* Success Message */}
            {message && (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                <div className="space-y-2">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {message}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Please check your inbox and spam folder.
                  </p>
                  {resendTimer > 0 && (
                    <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Timer className="h-3 w-3" />
                      Resend available in {resendTimer}s
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || resendTimer > 0}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all",
                "hover:bg-blue-700 hover:shadow-blue-700/30",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
                "disabled:cursor-not-allowed disabled:opacity-50",
                resendTimer > 0 && "bg-gray-400 hover:bg-gray-400 shadow-none"
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : resendTimer > 0 ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Resend in {resendTimer}s
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Reset Link
                </>
              )}
            </button>
          </form>

          {/* Help Section */}
          <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Need help?
              </h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" />
                  Check your spam folder if you don't see the email
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" />
                  The reset link expires in 1 hour
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" />
                  Contact your administrator if you need further assistance
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Shield className="h-3 w-3 text-green-500" />
          Your information is protected by industry-standard security
        </div>
      </div>
    </main>
  )
}