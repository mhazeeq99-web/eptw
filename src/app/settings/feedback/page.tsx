import {
  MessageSquare,
  ShieldCheck,
  Building2,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { FeedbackForm } from '@/components/settings/feedback-form'
import { FeedbackAdminList } from '@/components/settings/feedback-admin-list'

/**
 * Feedback page.
 * - Regular users: a simple form (Title + Message). On submit they are shown
 *   an acknowledgement; they do NOT see a list of what they previously sent.
 * - Platform Admin: a paginated list of all feedback from all users.
 */
export default async function FeedbackPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, company_id')
    .eq('id', user.id)
    .single()

  const isPlatformAdmin = profile?.role === 'platform_admin'

  return (
    <DashboardShell>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Feedback
                </h1>
                <p className="mt-1 text-muted-foreground">
                  {isPlatformAdmin
                    ? 'Review feedback submitted by all users'
                    : 'Share your feedback on ePTW'}
                </p>
              </div>
            </div>
          </div>

          {isPlatformAdmin ? (
            <Badge variant="secondary" className="self-start">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Platform Admin
            </Badge>
          ) : (
            <Badge variant="secondary" className="self-start">
              <Building2 className="mr-1 h-3 w-3" />
              Send Feedback
            </Badge>
          )}
        </div>

        {isPlatformAdmin ? (
          <FeedbackAdminList />
        ) : (
          <FeedbackForm userName={profile?.full_name ?? undefined} />
        )}
      </div>
    </DashboardShell>
  )
}
