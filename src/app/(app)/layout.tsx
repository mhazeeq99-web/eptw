import { redirect } from 'next/navigation'

import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'

/**
 * Persistent shell for every authenticated route.
 *
 * The shell used to be rendered by each page individually, so every navigation
 * unmounted and remounted the sidebar/header - and the sidebar re-queried
 * `profiles.role` on each mount, which made the navigation visibly
 * re-populate (and reset the collapsed rail). Living in a layout, the shell is
 * mounted once per session and only its children change, so the sidebar looks
 * static while pages swap underneath it.
 *
 * The profile (role) is resolved here, once, and handed to the shell so the
 * sidebar renders the correct navigation on first paint with no client fetch
 * and no per-navigation DB round-trip.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <DashboardShell role={profile?.role ?? null}>
      {children}
    </DashboardShell>
  )
}