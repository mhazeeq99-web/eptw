'use client'

import { useEffect, useState } from 'react'
import { Layers, ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

type SafetyControl = {
  id: number
  code: string
  name: string
  description: string | null
  category: string | null
  is_active: boolean
  is_system?: boolean
  created_at?: string
}

type PermitType = {
  id: number
  name: string
}

type Mapping = {
  id: number
  permit_type_id: number
  safety_control_id: number
  is_required: boolean
  safety_control: {
    id: number
    code: string
    name: string
    description: string | null
    category: string | null
  } | null
}

/**
 * Safety Controls manager — extracted from the old monolithic SettingsManager.
 *
 * Renders the Required Controls mapping (per permit type, driven by a type
 * selector) AND the Safety Controls catalogue together on one page, in that
 * order. It keeps the original `selectedTypeId` + `loadMappings` mechanism,
 * plus the same admin-role guard: non-admin users only see the restriction
 * notice instead of the management UI.
 */
export function SafetyControlsManager() {
  const [controls, setControls] = useState<SafetyControl[]>([])
  const [permitTypes, setPermitTypes] = useState<PermitType[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Safety control form
  const [showControlForm, setShowControlForm] = useState(false)
  const [controlName, setControlName] = useState('')
  const [controlCategory, setControlCategory] = useState('')

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

      const [controlsResponse, typesResponse] = await Promise.all([
        fetch('/api/admin/safety-controls'),
        fetch('/api/admin/permit-types'),
      ])

      const controlsBody = await controlsResponse.json()
      const typesBody = await typesResponse.json()

      if (!controlsResponse.ok) {
        throw new Error(controlsBody.error ?? 'Failed to load safety controls')
      }

      if (!typesResponse.ok) {
        throw new Error(typesBody.error ?? 'Failed to load permit types')
      }

      setControls(controlsBody.safety_controls ?? [])
      setPermitTypes(typesBody.permit_types ?? [])

      if (typesBody.permit_types?.length > 0) {
        setSelectedTypeId((current) =>
          current ?? typesBody.permit_types[0].id
        )
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load safety controls'
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadMappings(permitTypeId: number) {
    try {
      const response = await fetch(
        `/api/admin/permit-types/${permitTypeId}/safety-controls`
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to load mappings')
      }

      setMappings(body.mappings ?? [])
    } catch (mappingError) {
      setError(
        mappingError instanceof Error
          ? mappingError.message
          : 'Failed to load control mappings'
      )
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (selectedTypeId !== null) {
      loadMappings(selectedTypeId)
    }
  }, [selectedTypeId])

  async function createControl() {
    setError('')

    if (!controlName.trim()) {
      setError('Name is required.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/admin/safety-controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: controlName.trim(),
          category: controlCategory.trim() || null,
        }),
      })

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to create safety control')
      }

      setControlName('')
      setControlCategory('')
      setShowControlForm(false)
      await loadAll()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create safety control'
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteSafetyControl(control: SafetyControl) {
    setError('')

    const confirmed = window.confirm(
      `Delete "${control.name}"? This safety control will be removed from the catalogue. This cannot be undone.`
    )
    if (!confirmed) return

    try {
      const response = await fetch(
        `/api/admin/safety-controls/${control.id}`,
        { method: 'DELETE' }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to delete safety control')
      }

      await loadAll()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete safety control'
      )
    }
  }

  async function toggleControl(control: SafetyControl) {
    setError('')

    try {
      const response = await fetch(
        `/api/admin/safety-controls/${control.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            is_active: !control.is_active,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to update safety control')
      }

      await loadAll()
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Unable to update safety control'
      )
    }
  }

  async function toggleRequired(
    control: SafetyControl,
    isRequired: boolean
  ) {
    if (selectedTypeId === null) return

    setError('')

    // Optimistic update so the toggle feels instant.
    setMappings((current) => {
      const idx = current.findIndex(
        (m) => m.safety_control_id === control.id
      )
      if (idx === -1) {
        return [
          ...current,
          {
            id: null,
            permit_type_id: selectedTypeId,
            safety_control_id: control.id,
            is_required: isRequired,
            safety_control: control,
          } as unknown as Mapping,
        ]
      }
      const next = [...current]
      next[idx] = { ...next[idx], is_required: isRequired }
      return next
    })

    try {
      const response = await fetch(
        `/api/admin/permit-types/${selectedTypeId}/safety-controls`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            safety_control_id: control.id,
            is_required: isRequired,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to update mapping')
      }

      // Reconcile with the server result.
      await loadMappings(selectedTypeId)
    } catch (mappingError) {
      setError(
        mappingError instanceof Error
          ? mappingError.message
          : 'Unable to update mapping'
      )
      await loadMappings(selectedTypeId)
    }
  }

  const requiredControlIds = new Set(
    mappings
      .filter((mapping) => mapping.is_required)
      .map((mapping) => mapping.safety_control_id)
  )

  if (loading) {
    return (
      <p className="text-muted-foreground">Loading safety controls...</p>
    )
  }

  if (!isAdmin) {
    return (
      <section className="rounded-xl border bg-background">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Safety Controls</h2>
        </div>

        <p className="p-6 text-sm text-muted-foreground">
          Safety control and control requirement configuration is
          available to Safety Managers and Administrators only.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Permit type selector */}
      <section className="rounded-xl border bg-background">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Permit Type</h2>
            <p className="text-sm text-muted-foreground">
              Choose the permit type whose required controls you want
              to manage.
            </p>
          </div>
        </div>

        <div className="p-6">
          {permitTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No permit types configured. Create permit types on the
              Permit Types page first.
            </p>
          ) : (
            <select
              value={selectedTypeId ?? ''}
              onChange={(event) =>
                setSelectedTypeId(Number(event.target.value))
              }
              className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm"
            >
              {permitTypes.map((permitType) => (
                <option key={permitType.id} value={permitType.id}>
                  {permitType.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {/* Merged Safety Controls: catalogue + required toggle in one table */}
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Safety Controls</h2>
              <p className="text-sm text-muted-foreground">
                The library of safety controls. Use{' '}
                {selectedTypeId !== null
                  ? permitTypes.find((type) => type.id === selectedTypeId)
                      ?.name ?? 'the selected permit type'
                  : 'the selected permit type'}{' '}
                Required toggle to decide which controls must be
                verified before that permit type can be approved.
              </p>
            </div>
          </div>

          {!showControlForm && (
            <button
              type="button"
              onClick={() => setShowControlForm(true)}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Add Control
            </button>
          )}
        </div>

        {showControlForm && (
          <div className="space-y-4 border-b p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name *</label>
                <input
                  type="text"
                  value={controlName}
                  onChange={(event) => setControlName(event.target.value)}
                  placeholder="e.g. Job Hazard Analysis"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <input
                  type="text"
                  value={controlCategory}
                  onChange={(event) => setControlCategory(event.target.value)}
                  placeholder="e.g. Work method"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowControlForm(false)
                  setError('')
                }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={createControl}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Control'}
              </button>
            </div>
          </div>
        )}

        {controls.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No safety controls configured.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Name</th>
                  <th className="px-6 py-3 text-left font-medium">Category</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-left font-medium">
                    Required
                    {selectedTypeId !== null
                      ? ` — ${
                          permitTypes.find(
                            (type) => type.id === selectedTypeId
                          )?.name ?? 'Selected type'
                        }`
                      : ''}
                  </th>
                  <th className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {controls.map((control) => {
                  const isRequired = requiredControlIds.has(control.id)
                  return (
                    <tr key={control.id} className="hover:bg-muted/40">
                      <td className="px-6 py-4 font-medium">
                        {control.name}
                      </td>
                      <td className="px-6 py-4">
                        {control.category ?? '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
                            control.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {control.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {selectedTypeId !== null ? (
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={isRequired}
                              disabled={!control.is_active}
                              onCheckedChange={(value) =>
                                toggleRequired(control, value)
                              }
                              label={`${control.name} required`}
                            />
                            Required
                          </label>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Select a permit type
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => toggleControl(control)}
                            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          >
                            {control.is_active
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>

                          {!control.is_system && (
                            <button
                              type="button"
                              onClick={() =>
                                deleteSafetyControl(control)
                              }
                              title="Delete this safety control"
                              className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
