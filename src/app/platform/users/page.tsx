import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import {
  SearchX,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'

import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { UserStatusButton } from '@/components/platform/user-status-button'
import { createClient } from '@/lib/supabase/server'
import { formatDateMY } from '@/lib/dates'

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

const STATUS_STYLES: Record<AccountStatus, string> = {
  INVITED:
    'inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700',
  ACTIVE:
    'inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700',
  DISABLED:
    'inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground',
}

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
      <div className="space-y-6">

        <BackButton href="/dashboard" label="Back to Platform" />

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Users
          </h1>

          <p className="mt-2 text-muted-foreground">
            All platform users.
          </p>
        </div>

        <UserFilters
          params={params}
          hasActiveFilters={hasActiveFilters}
        />

        <Suspense fallback={<UsersLoading />}>
          <UsersTable params={params} />
        </Suspense>

      </div>
    </DashboardShell>
  )
}

function UserFilters({
  params,
  hasActiveFilters,
}: {
  params: SearchParams
  hasActiveFilters: boolean
}) {
  return (
    <form
      method="GET"
      action="/platform/users"
      className="flex flex-col gap-3 rounded-xl border bg-background p-4 lg:flex-row lg:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <label
          htmlFor="user-search"
          className="text-xs font-medium text-muted-foreground"
        >
          Search
        </label>

        <input
          id="user-search"
          name="q"
          type="search"
          defaultValue={params.q ?? ''}
          placeholder="Name, email or employee no."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="user-role"
          className="text-xs font-medium text-muted-foreground"
        >
          Role
        </label>

        <select
          id="user-role"
          name="role"
          defaultValue={params.role ?? ''}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
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
        <label
          htmlFor="user-status"
          className="text-xs font-medium text-muted-foreground"
        >
          Status
        </label>

        <select
          id="user-status"
          name="status"
          defaultValue={params.status ?? ''}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All statuses</option>
          <option value="INVITED">Invited</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>

        {hasActiveFilters && (
          <Link
            href="/platform/users"
            className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <X className="h-4 w-4" />
            Clear
          </Link>
        )}
      </div>
    </form>
  )
}

function UsersLoading() {
  return (
    <div className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">
      Loading users...
    </div>
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
    <div className="space-y-2">

      <div className="text-sm text-muted-foreground">
        {users.length} user{users.length === 1 ? '' : 's'}
        {hasFilters ? ' (filtered)' : ''}
      </div>

      <div className="overflow-hidden rounded-xl border bg-background">

        {error ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <TriangleAlert className="h-10 w-10 text-destructive" />

            <h2 className="mt-4 font-semibold">
              Couldn&apos;t load users
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Something went wrong while loading platform users.
              Please try again.
            </p>
          </div>
        ) : users.length === 0 ? (
          hasFilters ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">
                No users match your filters
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting or clearing the filters above to see
                more users.
              </p>

              <Link
                href="/platform/users"
                className="mt-4 inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <X className="h-4 w-4" />
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">
                No users yet
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Platform users will appear here once accounts are
                created.
              </p>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">

              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">
                    Name
                  </th>

                  <th className="px-5 py-3 text-left font-medium">
                    Email
                  </th>

                  <th className="px-5 py-3 text-left font-medium">
                    Company
                  </th>

                  <th className="px-5 py-3 text-left font-medium">
                    Role
                  </th>

                  <th className="px-5 py-3 text-left font-medium">
                    Status
                  </th>

                  <th className="px-5 py-3 text-left font-medium">
                    Created
                  </th>

                  <th className="px-5 py-3 text-left font-medium">
                    Invitation
                  </th>

                  <th className="px-5 py-3 text-right font-medium">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="transition-colors hover:bg-muted/40"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium">
                        {user.full_name}
                      </p>

                      {user.employee_no && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {user.employee_no}
                        </p>
                      )}
                    </td>

                    <td className="px-5 py-4 text-muted-foreground">
                      {user.email}
                    </td>

                    <td className="px-5 py-4">
                      {user.company?.name ?? '—'}
                    </td>

                    <td className="px-5 py-4">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={
                          STATUS_STYLES[getAccountStatus(user)]
                        }
                      >
                        {getAccountStatus(user)}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                      {formatDateMY(user.created_at)}
                    </td>

                    <td className="px-5 py-4">
                      {user.invitation_sent_at ? (
                        <span
                          className={STATUS_STYLES.INVITED}
                        >
                          INVITED
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <UserStatusButton
                        userId={user.id}
                        isActive={user.is_active}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}

      </div>
    </div>
  )
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}
