'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { SearchableCombobox } from '@/components/company/searchable-combobox'
import type { ComboboxOption } from '@/components/company/searchable-combobox'

const PAGE_SIZE = 10

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

type ContractorSearchResult = {
  contractor_id: number
  company_name: string
  company_code: string | null
  registration_no: string | null
  is_authorized: boolean
}

export function ContractorsManager() {
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [viewerRole, setViewerRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showPanel, setShowPanel] = useState(false)
  const [selectedContractor, setSelectedContractor] =
    useState<ComboboxOption | null>(null)
  const [authorizing, setAuthorizing] = useState(false)
  const [panelError, setPanelError] = useState('')
  const [panelSuccess, setPanelSuccess] = useState('')
  const [page, setPage] = useState(1)

  const totalPages = Math.max(
    1,
    Math.ceil(contractors.length / PAGE_SIZE)
  )
  const pageContractors = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE
    return contractors.slice(from, from + PAGE_SIZE)
  }, [contractors, page])

  useEffect(() => {
    setPage(1)
  }, [contractors.length])

  const isAdmin =
    viewerRole === 'safety_manager' ||
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

  async function searchContractors(
    query: string
  ): Promise<ComboboxOption[]> {
    const params = new URLSearchParams({ q: query })

    const response = await fetch(
      `/api/contractors/search?${params.toString()}`
    )

    const body = await response.json()

    if (!response.ok) {
      throw new Error(
        body.error ?? 'Failed to search contractors'
      )
    }

    const results: ContractorSearchResult[] =
      body.contractors ?? []

    return results.map((item) => ({
      id: item.contractor_id,
      label: item.company_name,
      code: item.company_code,
      subtitle: item.registration_no,
      disabled: item.is_authorized,
    }))
  }

  function openPanel() {
    setShowPanel(true)
    setSelectedContractor(null)
    setPanelError('')
    setPanelSuccess('')
  }

  function closePanel() {
    setShowPanel(false)
    setSelectedContractor(null)
    setPanelError('')
    setPanelSuccess('')
  }

  function handleSelectContractor(
    option: ComboboxOption | null
  ) {
    setSelectedContractor(option)
    setPanelError('')
    setPanelSuccess('')
  }

  async function handleSaveContractor() {
    setPanelError('')
    setPanelSuccess('')

    if (!selectedContractor) {
      setPanelError('Please select a contractor company.')
      return
    }

    if (selectedContractor.disabled) {
      setPanelSuccess('Contractor is already authorized.')
      return
    }

    setAuthorizing(true)

    try {
      const response = await fetch(
        `/api/contractors/${selectedContractor.id}/authorize`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_active: true,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Unable to authorize contractor'
        )
      }

      setPanelSuccess('Contractor authorized successfully.')
      setSelectedContractor(null)
      await loadContractors()
    } catch (saveError) {
      setPanelError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to authorize contractor'
      )
    } finally {
      setAuthorizing(false)
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

        {isAdmin && !showPanel && (
          <button
            type="button"
            onClick={openPanel}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Add Contractor Company
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showPanel && (
        <div className="rounded-xl border bg-background p-6">
          <h2 className="font-semibold">
            Add Contractor Company
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Search for a registered contractor company to
            authorize it to submit permits for your company.
          </p>

          <div className="mt-4 max-w-md">
            <SearchableCombobox
              searchFn={searchContractors}
              value={selectedContractor}
              onChange={handleSelectContractor}
              placeholder="Search contractor company..."
              label="Contractor Company"
              clearable
            />
          </div>

          {panelError && (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {panelError}
            </div>
          )}

          {panelSuccess && (
            <div className="mt-3 rounded-md border border-green-600/30 bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              {panelSuccess}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={closePanel}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>

            {selectedContractor && (
              <button
                type="button"
                onClick={handleSaveContractor}
                disabled={authorizing}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {authorizing ? 'Saving...' : 'Save Contractor'}
              </button>
            )}
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
            <table className="w-full min-w-[720px] text-sm">
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
                {pageContractors.map((contractor) => (
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

        {/* Pagination */}
        {contractors.length > PAGE_SIZE && (
          <div className="flex flex-col gap-3 border-t px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {contractors.length} contractor
              {contractors.length === 1 ? '' : 's'}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
                className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
