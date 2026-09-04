'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  Moon, 
  Shield, 
  Sun, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  ArrowLeft,
  HardHat,
  Building2,
  Clock,
  FileCheck,
  LogIn
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)

  // Resolve + apply the theme (same storage key / mechanism as the app-wide
  // ThemeToggle): stored preference, else the OS preference.
  useEffect(() => {
    const stored = localStorage.getItem('eptw-theme')
    const initial: 'light' | 'dark' =
      stored === 'dark' || stored === 'light'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
    setTheme(initial)
    const root = document.documentElement
    if (initial === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [])

  function toggleTheme() {
    setTheme((prev) => {
      const next: 'light' | 'dark' = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('eptw-theme', next)
      const root = document.documentElement
      if (next === 'dark') root.classList.add('dark')
      else root.classList.remove('dark')
      return next
    })
  }

  function validateForm(): boolean {
    let isValid = true
    setEmailError('')
    setPasswordError('')

    if (!email.trim()) {
      setEmailError('Email is required')
      isValid = false
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address')
      isValid = false
    }

    if (!password) {
      setPasswordError('Password is required')
      isValid = false
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      isValid = false
    }

    return isValid
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccessMessage('')

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setError(error.message)
        return
      }

      setSuccessMessage('Login successful! Redirecting...')
      
      // Small delay to show success message
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 500)
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Day-mode background image (light mode only — dark mode keeps its gradient) */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center dark:hidden"
        style={{ backgroundImage: "url('/login-bg-day.png')" }}
      />

      {/* Theme toggle — switch between the photo day mode and dark mode */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={
          theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
        }
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        className="absolute right-5 top-5 z-30 inline-flex items-center gap-2 rounded-full border border-gray-200/70 bg-white/80 px-3.5 py-2 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {theme === 'dark' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>

      {/* Small screens: light veil keeps the photo visible but soft behind the
          login card (there is no marketing column below lg). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-white/40 dark:hidden lg:hidden"
      />
      {/* Background Decorative Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-100/40 blur-3xl dark:bg-blue-900/20" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl dark:bg-indigo-900/20" />
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-100/30 blur-3xl dark:bg-purple-900/10" />
      </div>

      <div className="relative w-full max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Left Column - Branding & Info */}
          <div className="hidden lg:flex lg:flex-col lg:justify-center">
            {/* Day-mode translucent light-grey glass behind the marketing
                content (grey background + dark text, same language as the
                trusted box). Dark mode keeps the plain gradient. */}
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-x-5 -inset-y-7 rounded-[2.5rem] border border-white/40 bg-gradient-to-br from-white/85 via-white/70 to-white/50 shadow-xl shadow-blue-950/10 backdrop-blur-md dark:hidden"
              />
              <div className="relative space-y-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-600 p-3 shadow-lg shadow-blue-600/20">
                  <HardHat className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                    ePTW System
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Electronic Permit to Work
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  Streamline Your Work Permit Process
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Manage permits efficiently with our comprehensive digital solution for workplace safety.
                </p>
              </div>

              <div className="space-y-4">
                <FeatureItem 
                  icon={FileCheck}
                  title="Digital Work Permits"
                  description="Create, approve, and manage work permits digitally"
                />
                <FeatureItem 
                  icon={Shield}
                  title="Safety First"
                  description="Comprehensive safety checks and verifications"
                />
                <FeatureItem 
                  icon={Clock}
                  title="Real-time Tracking"
                  description="Monitor permit status and workflow in real-time"
                />
                <FeatureItem 
                  icon={Building2}
                  title="Multi-Company Support"
                  description="Seamless collaboration between contractors and companies"
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white/50 p-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-semibold">Trusted by leading organizations</span> to ensure workplace safety and compliance.
                </p>
              </div>
              </div>
            </div>
          </div>

          {/* Right Column - Login Form */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-md">
              {/* Mobile Logo */}
              <div className="mb-6 flex items-center gap-3 lg:hidden">
                <div className="rounded-lg bg-blue-600 p-2 shadow-lg shadow-blue-600/20">
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
                  href="/"
                  className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </Link>

                <div className="mb-8">
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Welcome Back
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Sign in to access your work permits
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
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
                        }}
                        placeholder="name@company.com"
                        required
                        autoComplete="email"
                        className={cn(
                          "w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100",
                          emailError
                            ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                            : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600"
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

                  {/* Password Field */}
                  <div className="space-y-2">
                    <label
                      htmlFor="password"
                      className="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value)
                          setPasswordError('')
                        }}
                        placeholder="Enter your password"
                        required
                        autoComplete="current-password"
                        className={cn(
                          "w-full rounded-lg border bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100",
                          passwordError
                            ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                            : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {passwordError && (
                      <p className="flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle className="h-3 w-3" />
                        {passwordError}
                      </p>
                    )}
                  </div>

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Remember me
                      </span>
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Forgot Password?
                    </Link>
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
                  {successMessage && (
                    <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      <p className="text-sm text-green-700 dark:text-green-300">
                        {successMessage}
                      </p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all",
                      "hover:bg-blue-700 hover:shadow-blue-700/30",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
                      "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        Sign in
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-2 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                        Secure login
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Shield className="h-3 w-3 text-green-500" />
                    Protected by industry-standard security
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function FeatureItem({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
        <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div>
        <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
    </div>
  )
}