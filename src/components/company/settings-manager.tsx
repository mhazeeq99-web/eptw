'use client'

import { useEffect, useState } from 'react'
import { Building2, FileText, ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

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

type Company = {
  id: number
  name: string
  code: string
}

export function SettingsManager() {
  const [company, setCompany] = useState<Company | null>(null)
  const [permitTypes, setPermitTypes] = useState<PermitType[]>([])
  const [controls, setControls] = useState<SafetyControl[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)

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

      if (profile?.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('id, name, code')
          .eq('id', profile.company_id)
          .single()

        setCompany(companyData ?? null)
      }

      if (!isAdminRole) {
        setLoading(false)
        return
      }

      const [typesResponse, controlsResponse] = await Promise.all([
        fetch('/api/admin/permit-types'),
        fetch('/api/admin/safety-controls'),
      ])

      const typesBody = await typesResponse.json()
      const controlsBody = await controlsResponse.json()

      if (!typesResponse.ok) {
        throw new Error(typesBody.error ?? 'Failed to load permit types')
      }

      if (!controlsResponse.ok) {
        throw new Error(controlsBody.error ?? 'Failed to load safety controls')
      }

      setPermitTypes(typesBody.permit_types ?? [])
      setControls(controlsBody.safety_controls ?? [])

      if (typesBody.permit_types?.length > 0) {
        setSelectedTypeId((current) =>
          current ?? typesBody.permit_types[0].id
        )
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load settings'
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
      <p className="text-muted-foreground">Loading settings...</p>
    )
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

          <p className="mt-2 text-muted-foreground">
            Company configuration: permit types, safety controls and
            control requirements.
          </p>
        </div>

        <section className="rounded-xl border bg-background">
          <div className="flex items-center gap-3 border-b px-6 py-4">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Company</h2>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="mt-1 font-medium">{company?.name ?? '—'}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Code</p>
              <p className="mt-1 font-medium">{company?.code ?? '—'}</p>
            </div>
          </div>
        </section>

        <p className="text-sm text-muted-foreground">
          Permit type, safety control and area configuration is
          available to Safety Managers and Administrators only.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

        <p className="mt-2 text-muted-foreground">
          Company configuration: permit types, safety controls and
          control requirements.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Company info */}
      <section className="rounded-xl border bg-background">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Company</h2>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="mt-1 font-medium">{company?.name ?? '—'}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Code</p>
            <p className="mt-1 font-medium">{company?.code ?? '—'}</p>
          </div>
        </div>
      </section>

      {/* Permit types */}
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
            <table className="w-full text-sm">
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
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTypeId(permitType.id)
                        }
                        className={
                          selectedTypeId === permitType.id
                            ? 'font-semibold text-primary'
                            : 'font-medium hover:text-primary'
                        }
                      >
                        {permitType.name}
                      </button>
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

      {/* Control requirements for selected type */}
      {selectedTypeId !== null && (
        <section className="rounded-xl border bg-background">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">
              Required Controls —{' '}
              {permitTypes.find((type) => type.id === selectedTypeId)
                ?.name ?? 'Selected type'}
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Toggle which safety controls must be verified before
              this permit type can be approved.
            </p>
          </div>

          <div className="divide-y">
            {controls.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No safety controls exist yet. Create one below.
              </p>
            ) : (
              controls.map((control) => {
                const isRequired = requiredControlIds.has(control.id)

                return (
                  <div
                    key={control.id}
                    className="flex items-center justify-between p-4"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {control.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {control.category ?? 'General'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
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
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      )}

      {/* Safety controls catalog */}
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Safety Controls</h2>
              <p className="text-sm text-muted-foreground">
                The library of safety controls available to permit
                types.
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
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Name</th>
                  <th className="px-6 py-3 text-left font-medium">Category</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {controls.map((control) => (
                  <tr key={control.id} className="hover:bg-muted/40">
                    <td className="px-6 py-4 font-medium">{control.name}</td>
                    <td className="px-6 py-4">{control.category ?? '—'}</td>
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
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleControl(control)}
                          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          {control.is_active ? 'Deactivate' : 'Activate'}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
