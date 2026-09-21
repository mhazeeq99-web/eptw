'use client'

import { FormEvent, useEffect, useState } from 'react'
import {
  Plus,
  UserRound,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  MailPlus,
  MoreVertical,
  UserCheck,
  UserX,
  Trash2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isLinkExpired } from '@/lib/link-policy'

const PAGE_SIZE = 10

type CompanyUser = {
  id: string
  full_name: string
  email: string
  employee_no: string | null
  phone: string | null
  department: string | null
  position: string | null
  role: string
  is_active: boolean
  invitation_sent_at: string | null
  /**
   * Auth acceptance signal from GET /api/company/users.
   * true = the invite was accepted (email confirmed / signed in at least once);
   * false = still pending; null = unknown (Auth lookup unavailable).
   */
  invitation_accepted?: boolean | null
  created_at: string
}

type UserRole = 'safety_coordinator' | 'internal_staff'

const ROLE_LABELS: Record<UserRole, string> = {
  safety_coordinator: 'Safety Coordinator',
  internal_staff: 'Internal Staff',
}

const ASSIGNABLE_ROLES: UserRole[] = [
  'safety_coordinator',
  'internal_staff',
]

type AccountStatus = 'INVITED' | 'ACTIVE' | 'DISABLED' | 'EXPIRED'

const STATUS_STYLES: Record<AccountStatus, string> = {
  INVITED:
    'inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  ACTIVE:
    'inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300',
  DISABLED:
    'inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground',
  EXPIRED:
    'inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

function getAccountStatus(user: CompanyUser): AccountStatus {
  if (!user.is_active) return 'DISABLED'

  // Pending = an invitation was sent and has not been accepted yet. Using
  // `invitation_sent_at` alone left invited-then-registered users marked
  // INVITED forever (and, because GET did not return that column at all, the
  // whole INVITED branch — including Resend Invitation — never rendered).
  const invitationPending =
    Boolean(user.invitation_sent_at) && user.invitation_accepted !== true

  if (!invitationPending) return 'ACTIVE'

  // Past the policy window the emailed link no longer works, so the row says so
  // and still offers Resend — a fresh link is generated on demand. Uses the
  // same tested policy helper as the /invite landing page.
  const sentAtSeconds = user.invitation_sent_at
    ? Math.floor(Date.parse(user.invitation_sent_at) / 1000)
    : null

  return isLinkExpired(sentAtSeconds, 'invite') ? 'EXPIRED' : 'INVITED'
}

/** Both pending states still need the invitation actions (resend / copy link). */
function showsInviteActions(user: CompanyUser): boolean {
  const status = getAccountStatus(user)
  return status === 'INVITED' || status === 'EXPIRED'
}

export function UserManagement() {
  const [users, setUsers] = useState<CompanyUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [resendingId, setResendingId] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [selectedRole, setSelectedRole] =
    useState<UserRole>('safety_coordinator')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [employeeNo, setEmployeeNo] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')

  const [saving, setSaving] = useState(false)

  // Invitation-link surfacing: after a create/resend the manager may need to
  // copy the registration link when email is unavailable.
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Per-section pagination: each role group is paginated independently.
  const [scPage, setScPage] = useState(1)
  const [staffPage, setStaffPage] = useState(1)

  const slice = (list: CompanyUser[], pageNum: number) => {
    const from = (pageNum - 1) * PAGE_SIZE
    return list.slice(from, from + PAGE_SIZE)
  }

  async function loadUsers() {

    try {
      const response = await fetch('/api/company/users')

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Failed to load users'
        )
      }

      setUsers(body.users ?? [])
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to load users'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function toggleUserStatus(user: CompanyUser) {
    setError('')
    setSuccessMessage('')

    try {
      const response = await fetch(
        `/api/company/users/${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_active: !user.is_active,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Failed to update user status'
        )
      }

      setInviteLink(null)
      setSuccessMessage(
        body.user?.is_active === false
          ? `${user.full_name} deactivated. The account can now be removed if needed.`
          : `${user.full_name} activated.`
      )

      await loadUsers()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to update user status'
      )
    }
  }

  async function resendInvitation(user: CompanyUser) {
    setError('')
    setSuccessMessage('')
    setResendingId(user.id)

    try {
      const response = await fetch(
        `/api/company/users/${user.id}/resend-invitation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ send_email: true }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? 'Too many requests. Please try again later.'
            : (body.error ?? 'Failed to resend invitation')
        )
      }

      setSuccessMessage(
        body.message ?? 'Invitation resent successfully.'
      )

      // When email could not be delivered, surface the fresh link so the
      // manager can share registration directly.
      if (body.invite_link && body.email_sent === false) {
        setInviteLink(body.invite_link as string)
      } else {
        setInviteLink(null)
      }

      await loadUsers()
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : 'Failed to resend invitation'
      )
    } finally {
      setResendingId(null)
    }
  }

  /** Fetches a fresh invitation link WITHOUT sending an email, then copies it. */
  async function copyInvitationLink(user: CompanyUser) {
    setError('')
    setSuccessMessage('')
    setCopiedId(null)

    try {
      const response = await fetch(
        `/api/company/users/${user.id}/resend-invitation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ send_email: false }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Failed to generate invitation link'
        )
      }

      if (!body.invite_link) {
        throw new Error('No invitation link was returned')
      }

      await navigator.clipboard.writeText(body.invite_link)

      setCopiedId(user.id)
      setSuccessMessage(
        'Invitation link copied — share it with the user to complete registration.'
      )
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : 'Failed to copy invitation link'
      )
    }
  }

  /** Permanently removes a DEACTIVATED user (auth account + profile). */
  async function removeUser(user: CompanyUser) {
    setError('')
    setSuccessMessage('')

    const confirmed = window.confirm(
      `Permanently remove ${user.full_name} (${user.email})?\n\n` +
        'This deletes their account and cannot be undone. Only deactivated accounts can be removed.'
    )
    if (!confirmed) return

    setRemovingId(user.id)

    try {
      const response = await fetch(
        `/api/company/users/${user.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Failed to remove user'
        )
      }

      setSuccessMessage(
        body.message ?? 'User removed permanently.'
      )
      await loadUsers()
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Failed to remove user'
      )
    } finally {
      setRemovingId(null)
    }
  }

  function resetForm() {
    setFullName('')
    setEmail('')
    setEmployeeNo('')
    setPhone('')
    setDepartment('')
    setPosition('')
    setSelectedRole('safety_coordinator')
  }

  function openAddForm(role: UserRole) {
    resetForm()
    setSelectedRole(role)
    setShowForm(true)
  }

  function closeForm() {
    if (saving) return

    setShowForm(false)
    resetForm()
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setSaving(true)
    setError('')

    try {
      const response = await fetch(
        '/api/company/users',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            full_name: fullName,
            email,
            employee_no: employeeNo,
            phone,
            department,
            position,
            role: selectedRole,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Failed to create user'
        )
      }

      setSuccessMessage('')
      setError('')

      setShowForm(false)
      resetForm()

      // Surface delivery status. When the invitation email could not be sent
      // (e.g. Resend not configured), show the registration link so the
      // manager can share it directly.
      if (body.message) {
        setSuccessMessage(body.message)
      } else {
        setSuccessMessage(
          body.email_sent
            ? 'User created and invitation email sent.'
            : 'User created.'
        )
      }

      if (body.invite_link && body.email_sent === false) {
        setInviteLink(body.invite_link as string)
      } else {
        setInviteLink(null)
      }

      await loadUsers()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to create user'
      )
    } finally {
      setSaving(false)
    }
  }

  const safetyCoordinators = users.filter(
    (user) =>
      user.role === 'safety_coordinator'
  )

  const internalStaff = users.filter(
    (user) => user.role === 'internal_staff'
  )

  async function changeUserRole(
    user: CompanyUser,
    role: UserRole
  ) {
    setError('')
    setSuccessMessage('')

    try {
      const response = await fetch(
        `/api/company/users/${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_active: user.is_active,
            role,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Failed to update user role'
        )
      }

      await loadUsers()
    } catch (roleError) {
      setError(
        roleError instanceof Error
          ? roleError.message
          : 'Failed to update user role'
      )
    }
  }

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          User Management
        </h1>

        <p className="mt-2 text-muted-foreground">
          Manage company users, roles and access.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-600/30 bg-green-100/60 p-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {inviteLink && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">
            Invitation email is not being delivered — share the registration
            link directly with the user:
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 truncate rounded border border-amber-300 bg-white px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-gray-900 dark:text-amber-100">
              {inviteLink}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink)
                setCopiedId('banner')
                setSuccessMessage('Registration link copied to clipboard.')
              }}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              {copiedId === 'banner' ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">
          Loading users...
        </div>
      ) : (
        <div className="space-y-6">

          <div>
            <UserSection
              title="Safety Coordinators"
              description="Safety personnel who can participate in the safety review process."
              icon={ShieldCheck}
              users={slice(safetyCoordinators, scPage)}
              onAdd={() =>
                openAddForm('safety_coordinator')
              }
              onToggleStatus={toggleUserStatus}
              onRoleChange={changeUserRole}
              onResendInvitation={resendInvitation}
              onCopyInvitationLink={copyInvitationLink}
              onRemove={removeUser}
              resendingId={resendingId}
              copiedId={copiedId}
              removingId={removingId}
            />
            {safetyCoordinators.length > PAGE_SIZE && (
              <SectionPagination
                total={safetyCoordinators.length}
                page={scPage}
                totalPages={Math.ceil(
                  safetyCoordinators.length / PAGE_SIZE
                )}
                onPrev={() => setScPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  setScPage((p) =>
                    Math.min(
                      Math.ceil(safetyCoordinators.length / PAGE_SIZE),
                      p + 1
                    )
                  )
                }
              />
            )}
          </div>

          <div>
            <UserSection
              title="Internal Staff"
              description="Company employees who create and submit internal permits."
              icon={UserRound}
              users={slice(internalStaff, staffPage)}
              onAdd={() =>
                openAddForm('internal_staff')
              }
              onToggleStatus={toggleUserStatus}
              onRoleChange={changeUserRole}
              onResendInvitation={resendInvitation}
              onCopyInvitationLink={copyInvitationLink}
              onRemove={removeUser}
              resendingId={resendingId}
              copiedId={copiedId}
              removingId={removingId}
            />
            {internalStaff.length > PAGE_SIZE && (
              <SectionPagination
                total={internalStaff.length}
                page={staffPage}
                totalPages={Math.ceil(
                  internalStaff.length / PAGE_SIZE
                )}
                onPrev={() => setStaffPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  setStaffPage((p) =>
                    Math.min(
                      Math.ceil(internalStaff.length / PAGE_SIZE),
                      p + 1
                    )
                  )
                }
              />
            )}
          </div>

        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-background p-6 shadow-lg">

            <div className="mb-6">
              <h2 className="text-xl font-semibold">
                Add {ROLE_LABELS[selectedRole]}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Create a user account for your company.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Full Name *
                </label>

                <input
                  value={fullName}
                  onChange={(event) =>
                    setFullName(event.target.value)
                  }
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Email *
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Employee No.
                  </label>

                  <input
                    value={employeeNo}
                    onChange={(event) =>
                      setEmployeeNo(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Phone
                  </label>

                  <input
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

              </div>

              <div className="grid gap-4 sm:grid-cols-2">

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Department
                  </label>

                  <input
                    value={department}
                    onChange={(event) =>
                      setDepartment(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Position
                  </label>

                  <input
                    value={position}
                    onChange={(event) =>
                      setPosition(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

              </div>

              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  Role
                </p>

                <p className="mt-1 text-sm font-medium">
                  {ROLE_LABELS[selectedRole]}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">

                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? 'Creating...'
                    : 'Create User'}
                </button>

              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  )
}

function UserSection({
  title,
  description,
  icon: Icon,
  users,
  onAdd,
  onToggleStatus,
  onRoleChange,
  onResendInvitation,
  onCopyInvitationLink,
  onRemove,
  resendingId,
  copiedId,
  removingId,
}: {
  title: string
  description: string
  icon: React.ElementType
  users: CompanyUser[]
  onAdd: () => void
  onToggleStatus: (user: CompanyUser) => void
  onRoleChange: (
    user: CompanyUser,
    role: UserRole
  ) => void
  onResendInvitation: (user: CompanyUser) => void
  onCopyInvitationLink: (user: CompanyUser) => void
  onRemove: (user: CompanyUser) => void
  resendingId: string | null
  copiedId: string | null
  removingId: string | null
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-background">

      <div className="flex items-center justify-between border-b p-5">

        <div className="flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5" />
          </div>

          <div>
            <h2 className="font-semibold">
              {title}
            </h2>

            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          </div>

        </div>

        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>

      </div>

      {users.length === 0 ? (
        <div className="p-8 text-center">

          <UserRound className="mx-auto h-8 w-8 text-muted-foreground" />

          <p className="mt-3 text-sm text-muted-foreground">
            No users added yet.
          </p>

        </div>
      ) : (
        <div className="overflow-x-auto">

          <table className="w-full min-w-[900px] text-sm">

            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-5 py-3 text-left font-medium">
                  Name
                </th>

                <th className="px-5 py-3 text-left font-medium">
                  Employee No.
                </th>

                <th className="px-5 py-3 text-left font-medium">
                  Department
                </th>

                <th className="px-5 py-3 text-left font-medium">
                  Position
                </th>

                <th className="px-5 py-3 text-left font-medium">
                  Role
                </th>

                <th className="px-5 py-3 text-left font-medium">
                  Status
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
                  className="hover:bg-muted/40"
                >

                  <td className="px-5 py-4">
                    <div>
                      <p className="font-medium">
                        {user.full_name}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    {user.employee_no ?? '—'}
                  </td>

                  <td className="px-5 py-4">
                    {user.department ?? '—'}
                  </td>

                  <td className="px-5 py-4">
                    {user.position ?? '—'}
                  </td>

                  <td className="px-5 py-4">
                    <select
                      value={user.role}
                      onChange={(event) =>
                        onRoleChange(
                          user,
                          event.target
                            .value as UserRole
                        )
                      }
                      className="rounded-md border bg-background px-2 py-1.5 text-xs"
                    >
                      {ASSIGNABLE_ROLES.map(
                        (role) => (
                          <option
                            key={role}
                            value={role}
                          >
                            {ROLE_LABELS[role]}
                          </option>
                        )
                      )}
                    </select>
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

                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* One visible primary action per row; every other action
                          lives in the overflow menu, so the column stays
                          scannable (three buttons per row looked crowded). */}
                      {showsInviteActions(user) && (
                        <button
                          type="button"
                          onClick={() => onResendInvitation(user)}
                          disabled={resendingId === user.id}
                          title="Send the invitation email again"
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-1.5"
                        >
                          <MailPlus className="h-3.5 w-3.5" />
                          {resendingId === user.id ? 'Resending…' : 'Resend'}
                        </button>
                      )}

                      {!user.is_active && (
                        <button
                          type="button"
                          onClick={() => onToggleStatus(user)}
                          title="Re-enable the account"
                          className="inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted sm:min-h-0 sm:py-1.5"
                        >
                          Activate
                        </button>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title="More actions"
                            aria-label={`More actions for ${user.full_name}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-9 sm:w-9"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="truncate text-xs font-medium text-muted-foreground">
                            {user.full_name}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />

                          {showsInviteActions(user) && (
                            <>
                              <DropdownMenuItem
                                disabled={resendingId === user.id}
                                onSelect={() => onResendInvitation(user)}
                                className="gap-2"
                              >
                                <MailPlus className="h-4 w-4" />
                                Resend invitation email
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                disabled={copiedId === user.id}
                                onSelect={() => onCopyInvitationLink(user)}
                                className="gap-2"
                              >
                                {copiedId === user.id ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                                {copiedId === user.id
                                  ? 'Link copied'
                                  : 'Copy invitation link'}
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />
                            </>
                          )}

                          {user.is_active ? (
                            <DropdownMenuItem
                              onSelect={() => onToggleStatus(user)}
                              className="gap-2"
                            >
                              <UserX className="h-4 w-4" />
                              Deactivate account
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem
                                onSelect={() => onToggleStatus(user)}
                                className="gap-2"
                              >
                                <UserCheck className="h-4 w-4" />
                                Activate account
                              </DropdownMenuItem>

                              {/* Remove is only offered AFTER deactivation. */}
                              <DropdownMenuItem
                                disabled={removingId === user.id}
                                onSelect={() => onRemove(user)}
                                className="gap-2 text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                {removingId === user.id
                                  ? 'Removing…'
                                  : 'Remove permanently'}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>

                </tr>
              ))}

            </tbody>

          </table>

        </div>
      )}

    </section>
  )
}

function SectionPagination({
  total,
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  total: number
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}) {
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-t-0 bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {from}–{to} of {total} user{total === 1 ? '' : 's'}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={onNext}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
