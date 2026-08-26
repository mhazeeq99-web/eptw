import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { UserManagement } from '@/components/company/user-management'
import { BackButton } from '@/components/ui/back-button'

export default async function CompanyUsersPage() {
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
    .single()

  if (profile?.role !== 'safety_manager') {
    redirect('/dashboard')
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="mb-6">
          <BackButton href="/settings" label="Back to Management" />
        </div>
        <UserManagement />
      </div>
    </DashboardShell>
  )
}
