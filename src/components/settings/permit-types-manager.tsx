'use client'

import { useEffect, useState } from 'react'
import { FileText, ShieldCheck } from 'lucide-react'

type PermitType = {
  id: number
  company_id: number | null
  name: string
  code: string | null
  requires_jha: boolean
  requires_gas_test: boolean
  requires_loto: boolean
  requires_site_verification: boolean
  requires_worker_briefing: boolean
  requires_emergency_arrangements: boolean
  is_active: boolean
  is_system?: boolean
  created_at?: string
}

/**
 * Permit Types manager — extracted from the old monolithic SettingsManager.
 *
 * Renders ONLY the Permit Types section: the catalogue table with
 * add / activate-deactivate / delete actions and the per-type document
 * requirement flags. It guards itself with the same admin-role check the
 * original component performed: non-admin users only see the restriction
 * notice instead of the management UI.
 */
export function PermitTypesManager() {
  const [permitTypes, setPermitTypes] = useState<PermitType[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Permit type form
  const [showTypeForm, setShowTypeForm] = useState(false)
  const [typeName, setTypeName] = useState('')
  const [typeRequiresJha, setTypeRequiresJha] = useState(false)
  const [typeRequiresGas, setTypeRequiresGas] = useState(false)
  const [typeRequiresLoto, setTypeRequiresLoto] = useState(false)
  const [typeRequiresSiteVerification, setTypeRequiresSiteVerification] =
    useState(true)
  const [typeRequiresWorkerBriefing, setTypeRequiresWorkerBriefing] =
    useState(false)
  const [typeRequiresEmergencyArrangements, setTypeRequiresEmergencyArrangements] =
    useState(false)

  const [saving, setSaving] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  async function loadAll() {
    try {
      const supabase = (await import('@/lib/supabase/client')).createClient()

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id, role')
        .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .single()

      const isAdminRole =
        profile?.role === 'safety_manager' ||
        profile?.role === 'platform_admin'

      setIsAdmin(isAdminRole)

      if (!isAdminRole) {
        setLoading(false)
        return
      }

      const typesResponse = await fetch('/api/admin/permit-types')
      const typesBody = await typesResponse.json()

      if (!typesResponse.ok) {
        throw new Error(typesBody.error ?? 'Failed to load permit types')
      }

      setPermitTypes(typesBody.permit_types ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load permit types'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function createPermitType() {
    setError('')

    if (!typeName.trim()) {
      setError('Permit type name is required.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/admin/permit-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: typeName.trim(),
          requires_jha: typeRequiresJha,
          requires_gas_test: typeRequiresGas,
          requires_loto: typeRequiresLoto,
          requires_site_verification: typeRequiresSiteVerification,
          requires_worker_briefing: typeRequiresWorkerBriefing,
          requires_emergency_arrangements: typeRequiresEmergencyArrangements,
        }),
      })

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to create permit type')
      }

      setTypeName('')
      setTypeRequiresJha(false)
      setTypeRequiresGas(false)
      setTypeRequiresLoto(false)
      setTypeRequiresSiteVerification(true)
      setTypeRequiresWorkerBriefing(false)
      setTypeRequiresEmergencyArrangements(false)
      setShowTypeForm(false)
      await loadAll()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create permit type'
      )
    } finally {
      setSaving(false)
    }
  }

  async function togglePermitType(permitType: PermitType) {
    setError('')

    try {
      const response = await fetch(
        `/api/admin/permit-types/${permitType.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            is_active: !permitType.is_active,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to update permit type')
      }

      await loadAll()
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Unable to update permit type'
      )
    }
  }

  async function deletePermitType(permitType: PermitType) {
    setError('')

    const confirmed = window.confirm(
      `Delete "${permitType.name}"? This will remove it and its safety-control, PPE and checklist mappings. This cannot be undone.`
    )
    if (!confirmed) return

    try {
      const response = await fetch(
        `/api/admin/permit-types/${permitType.id}`,
        { method: 'DELETE' }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to delete permit type')
      }

      await loadAll()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete permit type'
      )
    }
  }

  async function toggleTypeFlag(
    permitType: PermitType,
    flag: 'requires_site_verification' | 'requires_worker_briefing' | 'requires_emergency_arrangements'
  ) {
    setError('')

    try {
      const response = await fetch(
        `/api/admin/permit-types/${permitType.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            [flag]: !permitType[flag],
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to update permit type')
      }

      await loadAll()
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Unable to update permit type'
      )
    }
  }

  if (loading) {
    return (
      <p className="text-muted-foreground">Loading permit types...</p>
    )
  }

  if (!isAdmin) {
    return (
      <section className="rounded-xl border bg-background">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Permit Types</h2>
        </div>

        <p className="p-6 text-sm text-muted-foreground">
          Permit type configuration is available to Safety Managers and
          Administrators only.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Permit Types</h2>
            <p className="text-sm text-muted-foreground">
              Permit categories for your company and their
              document requirements.
            </p>
          </div>
        </div>

        {!showTypeForm && (
          <button
            type="button"
            onClick={() => setShowTypeForm(true)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Add Type
          </button>
        )}
      </div>

      {error && (
        <div className="border-b px-6 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showTypeForm && (
        <div className="space-y-4 border-b p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <input
                type="text"
                value={typeName}
                onChange={(event) => setTypeName(event.target.value)}
                placeholder="e.g. Hot Work"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={typeRequiresJha}
                onChange={(event) =>
                  setTypeRequiresJha(event.target.checked)
                }
              />
              Requires JHA / JSA
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={typeRequiresGas}
                onChange={(event) =>
                  setTypeRequiresGas(event.target.checked)
                }
              />
              Requires Gas Test
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={typeRequiresLoto}
                onChange={(event) =>
                  setTypeRequiresLoto(event.target.checked)
                }
              />
              Requires LOTO
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={typeRequiresSiteVerification}
                onChange={(event) =>
                  setTypeRequiresSiteVerification(event.target.checked)
                }
              />
              Site / Work-Area Verification
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={typeRequiresWorkerBriefing}
                onChange={(event) =>
                  setTypeRequiresWorkerBriefing(event.target.checked)
                }
              />
              Worker Briefing Required
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={typeRequiresEmergencyArrangements}
                onChange={(event) =>
                  setTypeRequiresEmergencyArrangements(event.target.checked)
                }
              />
              Emergency Arrangements Required
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowTypeForm(false)
                setError('')
              }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={createPermitType}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Type'}
            </button>
          </div>
        </div>
      )}

      {permitTypes.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          No permit types configured.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-center font-medium">JHA</th>
                <th className="px-6 py-3 text-center font-medium">Gas</th>
                <th className="px-6 py-3 text-center font-medium">LOTO</th>
                <th className="px-6 py-3 text-center font-medium">Site</th>
                <th className="px-6 py-3 text-center font-medium">Briefing</th>
                <th className="px-6 py-3 text-center font-medium">Emergency</th>
                <th className="px-6 py-3 text-center font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {permitTypes.map((permitType) => (
                <tr
                  key={permitType.id}
                  className="hover:bg-muted/40"
                >
                  <td className="px-6 py-4 font-medium">
                    {permitType.name}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {permitType.requires_jha ? '✓' : '—'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {permitType.requires_gas_test ? '✓' : '—'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {permitType.requires_loto ? '✓' : '—'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      type="button"
                      title="Toggle site verification"
                      onClick={() =>
                        toggleTypeFlag(
                          permitType,
                          'requires_site_verification'
                        )
                      }
                      className="hover:text-primary"
                    >
                      {permitType.requires_site_verification
                        ? '✓'
                        : '—'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      type="button"
                      title="Toggle worker briefing"
                      onClick={() =>
                        toggleTypeFlag(
                          permitType,
                          'requires_worker_briefing'
                        )
                      }
                      className="hover:text-primary"
                    >
                      {permitType.requires_worker_briefing
                        ? '✓'
                        : '—'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      type="button"
                      title="Toggle emergency arrangements"
                      onClick={() =>
                        toggleTypeFlag(
                          permitType,
                          'requires_emergency_arrangements'
                        )
                      }
                      className="hover:text-primary"
                    >
                      {permitType.requires_emergency_arrangements
                        ? '✓'
                        : '—'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
                        permitType.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {permitType.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => togglePermitType(permitType)}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        {permitType.is_active
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>

                      {!permitType.is_system && (
                        <button
                          type="button"
                          onClick={() => deletePermitType(permitType)}
                          title="Delete this permit type"
                          className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      )}
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
