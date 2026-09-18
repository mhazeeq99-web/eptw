import Link from 'next/link'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import {
  Building2,
  User,
  LogIn,
  CheckCircle2,
  ChevronRight,
  Zap,
} from 'lucide-react'

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Day-mode background image (light mode only — dark mode keeps its gradient) */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center dark:hidden"
        style={{ backgroundImage: "url('/login-bg-day.png')" }}
      />

      {/* Theme toggle — shared component (see components/layout/theme-toggle) */}
      <ThemeToggle variant="pill" className="absolute right-5 top-5 z-30" />

      {/* Small screens: light veil keeps the photo visible but soft behind the
          card. */}
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
        <div className="grid gap-12">

          {/* Right Column - Registration/Login Card */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-md">

              <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-900/50">
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                    <Zap className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Get Started
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Choose how you want to use ePTW
                  </p>
                </div>

                <div className="space-y-3">
                  <Link
                    href="/register/company"
                    className="group flex w-full items-center justify-between rounded-lg bg-blue-600 px-4 py-3.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-blue-700/30"
                  >
                    <span className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Register Your Company
                    </span>
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>

                  <Link
                    href="/register/contractor"
                    className="group flex w-full items-center justify-between rounded-lg border border-gray-300 px-4 py-3.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Register as Contractor
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
                  </Link>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-2 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                        or
                      </span>
                    </div>
                  </div>

                  <Link
                    href="/login"
                    className="group flex w-full items-center justify-between rounded-lg border border-gray-300 px-4 py-3.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <span className="flex items-center gap-2">
                      <LogIn className="h-4 w-4" />
                      Sign In
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>

                <div className="mt-6">
                  <p className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Secure and compliant with industry standards
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

