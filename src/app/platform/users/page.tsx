import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import {
  SearchX,
  TriangleAlert,
  Users,
  X,
  Search,
  User,
  Mail,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Filter,
  UserPlus,
  Activity
} from 'lucide-react'

import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { UserStatusButton } from '@/components/platform/user-status-button'
import { createClient } from '@/lib/supabase/server'
import { formatDateMY } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

type SearchParams = {
  q?: string
  role?: string
  status?: string
}

const ROLES = [
  'safety_manager',
  'safety_coordinator',
  'internal_staff',
  'contractor_admin',
  'platform_admin',
] as const

const ROLE_LABELS: Record<string, string> = {
  safety_manager: 'Safety Manager',
  safety_coordinator: 'Safety Coordinator',
  internal_staff: 'Internal Staff',
  contractor_admin: 'Contractor Admin',
  platform_admin: 'Platform Admin',
}

type AccountStatus = 'INVITED' | 'ACTIVE' | 'DISABLED'

type PlatformUser = {
  id: string
  full_name: string
  email: string
  employee_no: string | null
  role: string
  is_active: boolean
  invitation_sent_at: string | null
  created_at: string
  company: {
    name: string
    code: string | null
  } | null
}

function getAccountStatus(user: PlatformUser): AccountStatus {
  if (!user.is_active) return 'DISABLED'
  return user.invitation_sent_at ? 'INVITED' : 'ACTIVE'
}

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

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

  if (profile?.role !== 'platform_admin') {
    redirect('/dashboard')
  }

  const hasActiveFilters = Boolean(
    params.q || params.role || params.status
  )

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/dashboard" label="Back to Platform" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Users
                </h1>
                <p className="mt-1 text-muted-foreground">
                  All platform users
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Activity className="mr-1 h-3 w-3" />
            Platform Users
          </Badge>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <form method="GET" action="/platform/users" className="grid gap-4 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label htmlFor="user-search" className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <Search className="h-3.5 w-3.5 text-gray-400" />
                  Search
                </label>
                <input
                  id="user-search"
                  name="q"
                  type="search"
                  defaultValue={params.q ?? ''}
                  placeholder="Name, email or employee no."
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user-role" className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <Shield className="h-3.5 w-3.5 text-gray-400" />
                  Role
                </label>
                <select
                  id="user-role"
                  name="role"
                  defaultValue={params.role ?? ''}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">All roles</option>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user-status" className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <Activity className="h-3.5 w-3.5 text-gray-400" />
                  Status
                </label>
                <select
                  id="user-status"
                  name="status"
                  defaultValue={params.status ?? ''}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">All statuses</option>
                  <option value="INVITED">Invited</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DISABLED">Disabled</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  <Filter className="h-4 w-4" />
                  Filter
                </button>

                {hasActiveFilters && (
                  <Link
                    href="/platform/users"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </Link>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Suspense fallback={<UsersLoading />}>
          <UsersTable params={params} />
        </Suspense>
      </div>
    </DashboardShell>
  )
}

function UsersLoading() {
  return (
    <Card>
      <CardContent className="p-8">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm">Loading users...</p>
        </div>
      </CardContent>
    </Card>
  )
}

async function UsersTable({ params }: { params: SearchParams }) {
  const supabase = await createClient()

  let query = supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      employee_no,
      role,
      is_active,
      invitation_sent_at,
      created_at,
      company:companies (
        name,
        code
      )
    `)

  if (params.q) {
    const q = escapeLike(params.q)
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,employee_no.ilike.%${q}%`
    )
  }

  if (
    params.role &&
    (ROLES as readonly string[]).includes(params.role)
  ) {
    query = query.eq('role', params.role)
  }

  if (params.status === 'INVITED') {
    query = query
      .eq('is_active', true)
      .not('invitation_sent_at', 'is', null)
  } else if (params.status === 'ACTIVE') {
    query = query
      .eq('is_active', true)
      .is('invitation_sent_at', null)
  } else if (params.status === 'DISABLED') {
    query = query.eq('is_active', false)
  }

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query

  const users = (data ?? []) as unknown as PlatformUser[]

  const hasFilters = Boolean(
    params.q || params.role || params.status
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          {users.length} user{users.length === 1 ? '' : 's'}
        </Badge>
        {hasFilters && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            (filtered)
          </span>
        )}
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/50">
              <TriangleAlert className="h-12 w-12 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Couldn't Load Users
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Something went wrong while loading platform users. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        hasFilters ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <SearchX className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Users Match Your Filters
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Try adjusting or clearing the filters above to see more users.
              </p>
              <Link
                href="/platform/users"
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <Users className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Users Yet
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Platform users will appear here once accounts are created.
              </p>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Name</th>
                      <th className="px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Email</th>
                      <th className="px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Company</th>
                      <th className="px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Role</th>
                      <th className="px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                      <th className="px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Created</th>
                      <th className="px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Invitation</th>
                      <th className="px-5 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {users.map((user) => (
                      <tr key={user.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="rounded-full bg-gray-100 p-2 dark:bg-gray-800">
                              <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{user.full_name}</p>
                              {user.employee_no && (
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{user.employee_no}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <Mail className="h-3.5 w-3.5" />
                            {user.email}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <Building2 className="h-3.5 w-3.5" />
                            {user.company?.name ?? '—'}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <Badge variant="secondary">
                            {ROLE_LABELS[user.role] ?? user.role}
                          </Badge>
                        </td>

                        <td className="px-5 py-4">
                          <StatusBadge status={getAccountStatus(user)} />
                        </td>

                        <td className="whitespace-nowrap px-5 py-4">
                          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDateMY(user.created_at)}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          {user.invitation_sent_at ? (
                            <Badge variant="warning">
                              <Clock className="mr-1 h-3 w-3" />
                              INVITED
                            </Badge>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end">
                            <UserStatusButton
                              userId={user.id}
                              isActive={user.is_active}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const variants: Record<AccountStatus, any> = {
    INVITED: 'warning',
    ACTIVE: 'success',
    DISABLED: 'secondary',
  }

  const icons: Record<AccountStatus, any> = {
    INVITED: Clock,
    ACTIVE: CheckCircle2,
    DISABLED: AlertTriangle,
  }

  const Icon = icons[status]

  return (
    <Badge variant={variants[status]}>
      <Icon className="mr-1 h-3 w-3" />
      {status}
    </Badge>
  )
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}