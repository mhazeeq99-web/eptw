'use client'

import { FormEvent, useEffect, useState } from 'react'
import {
  Plus,
  UserRound,
  ShieldCheck,
  BriefcaseBusiness,
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
  created_at: string
}

type UserRole =
  | 'safety_coordinator'
  | 'work_supervisor'

export function UserManagement() {
  const [users, setUsers] = useState<CompanyUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    setLoading(true)
    setError('')

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

  // ADD THIS FUNCTION
  async function toggleUserStatus(user: CompanyUser) {
    setError('')

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

  const workSupervisors = users.filter(
    (user) =>
      user.role === 'work_supervisor'
  )

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          User Management
        </h1>

        <p className="mt-2 text-muted-foreground">
          Manage Safety Coordinators and Work Supervisors
          for your company.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
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
          />

          <UserSection
            title="Work Supervisors"
            description="Personnel responsible for supervising work activities and PTW review."
            icon={BriefcaseBusiness}
            users={workSupervisors}
            onAdd={() =>
              openAddForm('work_supervisor')
            }
            onToggleStatus={toggleUserStatus}
          />

        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">

            <div className="mb-6">
              <h2 className="text-xl font-semibold">
                Add{' '}
                {selectedRole ===
                'safety_coordinator'
                  ? 'Safety Coordinator'
                  : 'Work Supervisor'}
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
                  {selectedRole ===
                  'safety_coordinator'
                    ? 'Safety Coordinator'
                    : 'Work Supervisor'}
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

// UPDATE THE UserSection COMPONENT
function UserSection({
  title,
  description,
  icon: Icon,
  users,
  onAdd,
  onToggleStatus, // ADD THIS PARAMETER
}: {
  title: string
  description: string
  icon: React.ElementType
  users: CompanyUser[]
  onAdd: () => void
  onToggleStatus: (user: CompanyUser) => void // ADD THIS TYPE
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
                  Status
                </th>

                {/* ADD THIS COLUMN */}
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
                    <span
                      className={
                        user.is_active
                          ? 'inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700'
                          : 'inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {user.is_active
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </td>

                  {/* ADD THIS CELL */}
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onToggleStatus(user)}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
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