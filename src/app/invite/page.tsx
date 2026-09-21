import Link from 'next/link'
import {
  HardHat,
  ShieldCheck,
  Mail,
  Clock,
} from 'lucide-react'
import { InviteAccept } from './invite-accept'
import { checkSignedLink } from '@/lib/link-signing'
import { linkTtlLabel } from '@/lib/link-policy'

/**
 * /invite — branded landing page for staff invitations.
 *
 * The invitation EMAIL links here (ePTW's own domain) instead of embedding the
 * raw Supabase verification URL, which looks like an unrelated third-party
 * link to spam filters. The invite token is verified IN-APP (PKCE-safe) when
 * the user clicks "Continue Registration" — it is never handed to Supabase's
 * hosted implicit-flow page.
 *
 * Expiry: the emailed link carries a signed issue time (`iat`/`sig`), so an
 * invitation is refused here once it is older than INVITE_LINK_TTL_SECONDS.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; iat?: string; sig?: string }>
}) {
  const params = await searchParams
  const token = params.token?.trim() ?? ''

  const hasToken = token.length > 0
  const check = hasToken
    ? checkSignedLink('invite', token, params.iat, params.sig)
    : null

  const linkInvalid = !hasToken || check?.invalid === true
  const linkExpired = check?.expired === true
  const ttlLabel = linkTtlLabel('invite')

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
          {linkInvalid ? (
            <>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                <Mail className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Link Invalid
              </h2>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                This invitation link is missing its registration token or has
                been altered. Please ask your Safety Manager to resend the
                invitation from the Company Users page.
              </p>
            </>
          ) : linkExpired ? (
            <>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
                <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Invitation Expired
              </h2>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                For security, invitation links are valid for {ttlLabel} after
                they are sent, and this one is now too old to use.
              </p>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Ask your Safety Manager to resend the invitation from the
                Company Users page — a fresh link will work immediately.
              </p>
            </>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                  <ShieldCheck className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    You&apos;re Invited
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Complete your ePTW registration
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your Safety Manager has invited you to join the company&apos;s
                electronic Permit to Work system. Click the button below to
                confirm your account and set your password.
              </p>

              <div className="mt-6">
                <InviteAccept token={token} />

                <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                  This link is single-use and expires {ttlLabel} after it was
                  sent. If it has expired, ask your Safety Manager to resend the
                  invitation.
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
