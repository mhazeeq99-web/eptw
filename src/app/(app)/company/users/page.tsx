import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UserManagement } from '@/components/company/user-management'
import { BackButton } from '@/components/ui/back-button'
import { 
  Users, 
  Shield, 
  UserCog,
  Info,
  KeyRound,
  UserPlus,
  UserCheck
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

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
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-6">
          <BackButton href="/settings" label="Back to Management" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Company Users
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Manage user accounts and roles within your organization
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Shield className="mr-1 h-3 w-3" />
            Safety Manager Access
          </Badge>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <InfoCard
            icon={<UserPlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
            title="Add Users"
            description="Invite new team members to your organization"
          />
          <InfoCard
            icon={<UserCog className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
            title="Manage Roles"
            description="Assign and update user roles and permissions"
          />
          <InfoCard
            icon={<KeyRound className="h-5 w-5 text-green-600 dark:text-green-400" />}
            title="Access Control"
            description="Control who can create and approve permits"
          />
        </div>

        {/* Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              User Management
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Manage your company's users, their roles, and access permissions. Safety Managers can add, edit, and deactivate user accounts.
            </p>
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardContent className="p-6">
            <UserManagement />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function InfoCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
            {icon}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{title}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}