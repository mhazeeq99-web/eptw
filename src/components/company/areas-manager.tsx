'use client'

import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'

type Area = {
  id: number
  company_id: number | null
  name: string
  code: string | null
  is_active: boolean
  created_at?: string
}

export function AreasManager() {
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadAreas() {

    try {
      const response = await fetch('/api/admin/areas')

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to load areas')
      }

      setAreas(body.areas ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load areas'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAreas()
  }, [])

  async function handleCreate() {
    setError('')

    if (!name.trim()) {
      setError('Area name is required.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/admin/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || null,
        }),
      })

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to create area')
      }

      setName('')
      setCode('')
      setShowForm(false)
      await loadAreas()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create area'
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleArea(area: Area) {
    setError('')

    try {
      const response = await fetch(
        `/api/admin/areas/${area.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            is_active: !area.is_active,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to update area')
      }

      await loadAreas()
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Unable to update area'
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Areas
          </h1>

          <p className="mt-2 text-muted-foreground">
            Manage work areas for your company.
          </p>
        </div>

        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Area
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
          <h2 className="font-semibold">Add Area</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Production Floor"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="e.g. PROD-1"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
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
              {saving ? 'Saving...' : 'Save Area'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-background">
        {loading ? (
          <p className="p-8 text-sm text-muted-foreground">
            Loading areas...
          </p>
        ) : areas.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">No areas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first work area.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Name</th>
                  <th className="px-6 py-3 text-left font-medium">Code</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {areas.map((area) => (
                  <tr key={area.id} className="hover:bg-muted/40">
                    <td className="px-6 py-4 font-medium">{area.name}</td>
                    <td className="px-6 py-4">{area.code ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
                          area.is_active
                            ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {area.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => toggleArea(area)}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        {area.is_active ? 'Deactivate' : 'Activate'}
                      </button>
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
