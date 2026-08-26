'use client'

import { FormEvent, useEffect, useState } from 'react'
import {
  Plus,
  UserRound,
  ShieldCheck,
} from 'lucide-react'

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

type AccountStatus = 'INVITED' | 'ACTIVE' | 'DISABLED'

const STATUS_STYLES: Record<AccountStatus, string> = {
  INVITED:
    'inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700',
  ACTIVE:
    'inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700',
  DISABLED:
    'inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground',
}

function getAccountStatus(user: CompanyUser): AccountStatus {
  if (!user.is_active) return 'DISABLED'
  return user.invitation_sent_at ? 'INVITED' : 'ACTIVE'
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

      setShowForm(false)
      resetForm()

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

      {loading ? (
        <div className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">
          Loading users...
        </div>
      ) : (
        <div className="space-y-6">

          <UserSection
            title="Safety Coordinators"
            description="Safety personnel who can participate in the safety review process."
            icon={ShieldCheck}
            users={safetyCoordinators}
            onAdd={() =>
              openAddForm('safety_coordinator')
            }
            onToggleStatus={toggleUserStatus}
            onRoleChange={changeUserRole}
            onResendInvitation={resendInvitation}
            resendingId={resendingId}
          />

          <UserSection
            title="Internal Staff"
            description="Company employees who create and submit internal permits."
            icon={UserRound}
            users={internalStaff}
            onAdd={() =>
              openAddForm('internal_staff')
            }
            onToggleStatus={toggleUserStatus}
            onRoleChange={changeUserRole}
            onResendInvitation={resendInvitation}
            resendingId={resendingId}
          />

        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">

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
  resendingId,
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
  resendingId: string | null
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

          <table className="w-full text-sm">

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
                      {getAccountStatus(user) === 'INVITED' &&
                        user.role === 'internal_staff' && (
                          <button
                            type="button"
                            onClick={() =>
                              onResendInvitation(user)
                            }
                            disabled={
                              resendingId === user.id
                            }
                            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {resendingId === user.id
                              ? 'Resending...'
                              : 'Resend Invitation'}
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={() =>
                          onToggleStatus(user)
                        }
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        {user.is_active
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>
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