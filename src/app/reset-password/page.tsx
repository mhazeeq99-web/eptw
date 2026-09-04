import Link from 'next/link'
import {
  HardHat,
  ShieldCheck,
  KeyRound,
  Mail,
} from 'lucide-react'
import { ResetPasswordAccept } from './reset-password-accept'

/**
 * /reset-password — branded landing page reached from the Resend password-reset
 * email. The token is verified IN-APP (PKCE-safe) before the user is taken to
 * /update-password to choose a new password.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const params = await searchParams
  const token = params.token?.trim() ?? ''

  const hasToken = token.length > 0

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-100/40 blur-3xl dark:bg-blue-900/20" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl dark:bg-indigo-900/20" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="rounded-xl bg-blue-600 p-3 shadow-lg shadow-blue-600/20">
            <HardHat className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              ePTW
            </h1>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Electronic Permit to Work
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-900/50">
          {!hasToken ? (
            <>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                <Mail className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Link Invalid
              </h2>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                This reset link is missing its verification token. Please
                request a new password reset link.
              </p>
            </>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                  <KeyRound className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Reset Your Password
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Choose a new password for your ePTW account
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400">
                Click the button below to verify your reset link, then set a
                new password for your account.
              </p>

              <div className="mt-6">
                <ResetPasswordAccept token={token} />

                <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                  Reset links are single-use and expire after a limited time.
                  If it has expired, request a new link.
                </p>
              </div>
            </>
          )}

          <div className="mt-6 border-t border-gray-200 pt-5 text-center dark:border-gray-700">
            <Link
              href="/login"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Back to Sign In
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <ShieldCheck className="h-3 w-3 text-green-500" />
          Your information is protected by industry-standard security
        </div>
      </div>
    </main>
  )
}
