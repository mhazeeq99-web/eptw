'use client'

import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'

type Equipment = {
  id: number
  company_id: number | null
  area_id: number | null
  name: string
  equipment_no: string | null
  is_active: boolean
  created_at?: string
}

export function EquipmentManager() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [areas, setAreas] = useState<
    Array<{ id: number; name: string; is_active: boolean }>
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [equipmentNo, setEquipmentNo] = useState('')
  const [areaId, setAreaId] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadData() {

    try {
      const [equipmentResponse, areasResponse] = await Promise.all([
        fetch('/api/admin/equipment'),
        fetch('/api/admin/areas'),
      ])

      const equipmentBody = await equipmentResponse.json()
      const areasBody = await areasResponse.json()

      if (!equipmentResponse.ok) {
        throw new Error(
          equipmentBody.error ?? 'Failed to load equipment'
        )
      }

      if (!areasResponse.ok) {
        throw new Error(areasBody.error ?? 'Failed to load areas')
      }

      setEquipment(equipmentBody.equipment ?? [])
      setAreas(areasBody.areas ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load equipment'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleCreate() {
    setError('')

    if (!name.trim()) {
      setError('Equipment name is required.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/admin/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          equipment_no: equipmentNo.trim() || null,
          area_id: areaId ? Number(areaId) : null,
        }),
      })

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to create equipment')
      }

      setName('')
      setEquipmentNo('')
      setAreaId('')
      setShowForm(false)
      await loadData()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create equipment'
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleEquipment(item: Equipment) {
    setError('')

    try {
      const response = await fetch(
        `/api/admin/equipment/${item.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            is_active: !item.is_active,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to update equipment')
      }

      await loadData()
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Unable to update equipment'
      )
    }
  }

  const areaName = (areaId: number | null) =>
    areas.find((area) => area.id === areaId)?.name ?? '—'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Equipment
          </h1>

          <p className="mt-2 text-muted-foreground">
            Manage equipment registered for permits.
          </p>
        </div>

        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Equipment
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
          <h2 className="font-semibold">Add Equipment</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Lathe machine L-101"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Equipment No.</label>
              <input
                type="text"
                value={equipmentNo}
                onChange={(event) => setEquipmentNo(event.target.value)}
                placeholder="e.g. L-101"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Area</label>
              <select
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">No area</option>
                {areas
                  .filter((area) => area.is_active)
                  .map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
              </select>
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
              {saving ? 'Saving...' : 'Save Equipment'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-background">
        {loading ? (
          <p className="p-8 text-sm text-muted-foreground">
            Loading equipment...
          </p>
        ) : equipment.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Wrench className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">No equipment</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Register your first piece of equipment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Name</th>
                  <th className="px-6 py-3 text-left font-medium">Equipment No.</th>
                  <th className="px-6 py-3 text-left font-medium">Area</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {equipment.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/40">
                    <td className="px-6 py-4 font-medium">{item.name}</td>
                    <td className="px-6 py-4">{item.equipment_no ?? '—'}</td>
                    <td className="px-6 py-4">{areaName(item.area_id)}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
                          item.is_active
                            ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => toggleEquipment(item)}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        {item.is_active ? 'Deactivate' : 'Activate'}
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
