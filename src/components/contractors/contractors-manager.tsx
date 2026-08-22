'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'

type Contractor = {
  id: number
  company_name: string
  is_active: boolean | null
  authorized: boolean
  created_at?: string
  companies?: Array<{
    id: number
    company_id: number
    is_active: boolean
    company: {
      id: number
      name: string
      code: string
    } | null
  }>
}

export function ContractorsManager() {
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [viewerRole, setViewerRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [saving, setSaving] = useState(false)

  const isAdmin =
    viewerRole === 'safety_manager' ||
    viewerRole === 'admin' ||
    viewerRole === 'platform_admin'

  async function loadContractors() {

    try {
      const response = await fetch('/api/contractors')

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Failed to load contractors'
        )
      }

      setContractors(body.contractors ?? [])
      setViewerRole(body.viewer_role ?? '')
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load contractors'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadContractors()
  }, [])

  async function handleCreate() {
    setError('')

    if (!companyName.trim()) {
      setError('Contractor company name is required.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/contractors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
        }),
      })

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Unable to create contractor'
        )
      }

      setCompanyName('')
      setShowForm(false)
      await loadContractors()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create contractor'
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleAuthorization(contractor: Contractor) {
    setError('')

    const confirmed = window.confirm(
      contractor.authorized
        ? `Revoke authorization for ${contractor.company_name}?`
        : `Authorize ${contractor.company_name} to submit permits for your company?`
    )

    if (!confirmed) return

    try {
      const response = await fetch(
        `/api/contractors/${contractor.id}/authorize`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_active: !contractor.authorized,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Unable to update authorization'
        )
      }

      await loadContractors()
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : 'Unable to update authorization'
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Contractors
          </h1>

          <p className="mt-2 text-muted-foreground">
            Manage contractor companies and their authorization
            to work on your permits.
          </p>
        </div>

        {isAdmin && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Contractor
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border bg-background p-6">
          <h2 className="font-semibold">
            Add Contractor Company
          </h2>

          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium">
              Company Name *
            </label>

            <input
              type="text"
              value={companyName}
              onChange={(event) =>
                setCompanyName(event.target.value)
              }
              placeholder="e.g. ABC Engineering Sdn Bhd"
              className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setError('')
              }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Contractor'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-background">
        {loading ? (
          <p className="p-8 text-sm text-muted-foreground">
            Loading contractors...
          </p>
        ) : contractors.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />

            <h2 className="mt-4 font-semibold">
              No contractors
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? 'Add a contractor company to get started.'
                : 'Your contractor has not been linked to any companies yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">
                    Contractor
                  </th>

                  <th className="px-6 py-3 text-left font-medium">
                    Status
                  </th>

                  {isAdmin && (
                    <th className="px-6 py-3 text-left font-medium">
                      Authorized
                    </th>
                  )}

                  {!isAdmin && (
                    <th className="px-6 py-3 text-left font-medium">
                      Authorized Companies
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y">
                {contractors.map((contractor) => (
                  <tr
                    key={contractor.id}
                    className="hover:bg-muted/40"
                  >
                    <td className="px-6 py-4 font-medium">
                      {contractor.company_name}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
                          contractor.is_active === false
                            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                            : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                        }`}
                      >
                        {contractor.is_active === false
                          ? 'Inactive'
                          : 'Active'}
                      </span>
                    </td>

                    {isAdmin && (
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() =>
                            toggleAuthorization(contractor)
                          }
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                            contractor.authorized
                              ? 'text-destructive hover:bg-destructive/10'
                              : 'text-primary hover:bg-muted'
                          }`}
                        >
                          {contractor.authorized
                            ? 'Revoke'
                            : 'Authorize'}
                        </button>
                      </td>
                    )}

                    {!isAdmin && (
                      <td className="px-6 py-4">
                        {contractor.companies &&
                        contractor.companies.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {contractor.companies
                              .filter(
                                (relationship) =>
                                  relationship.is_active
                              )
                              .map((relationship) => (
                                <span
                                  key={relationship.id}
                                  className="rounded-md bg-muted px-2 py-1 text-xs"
                                >
                                  {relationship.company?.name ??
                                    'Unknown company'}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            No authorized companies
                          </span>
                        )}
                      </td>
                    )}
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
