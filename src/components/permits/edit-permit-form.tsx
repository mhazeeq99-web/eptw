'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type PermitType = {
  id: number
  name: string
  code: string
}

type Area = {
  id: number
  name: string
  code: string
}

type Equipment = {
  id: number
  name: string
  equipment_no: string | null
  area_id: number | null
}

type Contractor = {
  id: number
  company_name: string
}

type Permit = {
  id: number
  permit_no: string
  requester_id: string
  permit_type_id: number
  work_title: string
  work_description: string | null
  work_location: string | null
  area_id: number | null
  equipment_id: number | null
  contractor_id: number | null
  planned_start: string | null
  planned_end: string | null
  worker_name: string | null
  worker_id: string | null
  staff_reference_name: string | null
  status: string
}

export default function EditPermitForm({
  permitId,
}: {
  permitId: number
}) {
  const router = useRouter()
  const supabase = createClient()

  const [permit, setPermit] = useState<Permit | null>(null)

  const [permitTypes, setPermitTypes] = useState<PermitType[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])

  const [permitTypeId, setPermitTypeId] = useState('')
  const [workTitle, setWorkTitle] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [areaId, setAreaId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [contractorId, setContractorId] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [workerName, setWorkerName] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [staffReferenceName, setStaffReferenceName] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!permitId || Number.isNaN(permitId)) {
      setError('Invalid permit ID')
      setLoading(false)
      return
    }

    async function loadData() {
      setError('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/login')
        return
      }

      const [
        permitResult,
        permitTypesResult,
        areasResult,
        equipmentResult,
        contractorsResult,
      ] = await Promise.all([
        supabase
          .from('permits')
          .select(`
            id,
            permit_no,
            requester_id,
            permit_type_id,
            work_title,
            work_description,
            work_location,
            area_id,
            equipment_id,
            contractor_id,
            planned_start,
            planned_end,
            worker_name,
            worker_id,
            staff_reference_name,
            status
          `)
          .eq('id', permitId)
          .single(),

        supabase
          .from('permit_types')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name'),

        supabase
          .from('areas')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name'),

        supabase
          .from('equipment')
          .select('id, name, equipment_no, area_id')
          .eq('is_active', true)
          .order('name'),

        supabase
          .from('contractors')
          .select('id, company_name')
          .eq('is_active', true)
          .order('company_name'),
      ])

      if (permitResult.error || !permitResult.data) {
        setError(
          permitResult.error?.message ||
            'Permit not found'
        )
        setLoading(false)
        return
      }

      const existingPermit =
        permitResult.data as Permit

      // -----------------------------------------------------
      // Security check in the UI
      // Server-side API also performs this check.
      // -----------------------------------------------------

      if (existingPermit.requester_id !== user.id) {
        setError(
          'You are not the requester of this permit.'
        )
        setLoading(false)
        return
      }

      if (
        existingPermit.status !== 'draft' &&
        existingPermit.status !== 'rejected'
      ) {
        setError(
          `This permit cannot be edited while its status is ${existingPermit.status}.`
        )
        setLoading(false)
        return
      }

      setPermit(existingPermit)

      setPermitTypeId(
        String(existingPermit.permit_type_id)
      )

      setWorkTitle(
        existingPermit.work_title ?? ''
      )

      setWorkDescription(
        existingPermit.work_description ?? ''
      )

      setWorkLocation(
        existingPermit.work_location ?? ''
      )

      setAreaId(
        existingPermit.area_id
          ? String(existingPermit.area_id)
          : ''
      )

      setEquipmentId(
        existingPermit.equipment_id
          ? String(existingPermit.equipment_id)
          : ''
      )

      setContractorId(
        existingPermit.contractor_id
          ? String(existingPermit.contractor_id)
          : ''
      )

      setPlannedStart(
        formatDateTimeLocal(
          existingPermit.planned_start
        )
      )

      setPlannedEnd(
        formatDateTimeLocal(
          existingPermit.planned_end
        )
      )

      setWorkerName(
        existingPermit.worker_name ?? ''
      )

      setWorkerId(
        existingPermit.worker_id ?? ''
      )

      setStaffReferenceName(
        existingPermit.staff_reference_name ?? ''
      )

      setPermitTypes(
        permitTypesResult.data ?? []
      )

      setAreas(
        areasResult.data ?? []
      )

      setEquipment(
        equipmentResult.data ?? []
      )

      setContractors(
        contractorsResult.data ?? []
      )

      setLoading(false)
    }

    loadData()
  }, [permitId, router, supabase])

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')
    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/update`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            permit_type_id: Number(permitTypeId),
            work_title: workTitle,
            work_description:
              workDescription || null,
            work_location:
              workLocation || null,
            area_id: areaId
              ? Number(areaId)
              : null,
            equipment_id: equipmentId
              ? Number(equipmentId)
              : null,
            contractor_id: contractorId
              ? Number(contractorId)
              : null,
            planned_start:
              plannedStart || null,
            planned_end:
              plannedEnd || null,
            worker_name:
              workerName.trim() || null,
            worker_id:
              workerId.trim() || null,
            staff_reference_name:
              staffReferenceName.trim() || null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Unable to update permit.'
        )
        setSaving(false)
        return
      }

      router.push(`/permits/${permitId}`)
      router.refresh()
    } catch {
      setError(
        'Unable to connect to the server.'
      )
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="text-muted-foreground">
        Loading permit...
      </p>
    )
  }

  if (!permit) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error || 'Permit not found'}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">

      <div>
        <p className="text-sm text-muted-foreground">
          {permit.permit_no}
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Revise Permit
        </h1>

        <p className="mt-2 text-muted-foreground">
          Update the permit before resubmitting it
          for approval.
        </p>
      </div>

      {permit.status === 'rejected' && (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">
            This permit was rejected.
          </p>

          <p className="mt-1 text-sm text-destructive/80">
            Please review the rejection remarks
            in the permit history and make the
            necessary corrections.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-8"
      >

        {/* Permit Information */}
        <section className="rounded-xl border bg-background p-6">

          <h2 className="text-lg font-semibold">
            Permit Information
          </h2>

          <div className="mt-6 grid gap-6 md:grid-cols-2">

            <Field
              label="Permit Type"
              required
            >
              <select
                value={permitTypeId}
                onChange={(event) =>
                  setPermitTypeId(
                    event.target.value
                  )
                }
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  Select permit type
                </option>

                {permitTypes.map((type) => (
                  <option
                    key={type.id}
                    value={type.id}
                  >
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Area">
              <select
                value={areaId}
                onChange={(event) =>
                  setAreaId(event.target.value)
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  Select area
                </option>

                {areas.map((area) => (
                  <option
                    key={area.id}
                    value={area.id}
                  >
                    {area.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Equipment">
              <select
                value={equipmentId}
                onChange={(event) =>
                  setEquipmentId(
                    event.target.value
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  Select equipment
                </option>

                {equipment.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                    {item.equipment_no
                      ? ` (${item.equipment_no})`
                      : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Contractor">
              <select
                value={contractorId}
                onChange={(event) =>
                  setContractorId(
                    event.target.value
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  Select contractor
                </option>

                {contractors.map(
                  (contractor) => (
                    <option
                      key={contractor.id}
                      value={contractor.id}
                    >
                      {contractor.company_name}
                    </option>
                  )
                )}
              </select>
            </Field>

            {contractorId && (
              <>
                <Field label="Worker Name">
                  <input
                    type="text"
                    value={workerName}
                    onChange={(event) =>
                      setWorkerName(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </Field>

                <Field label="Worker ID">
                  <input
                    type="text"
                    value={workerId}
                    onChange={(event) =>
                      setWorkerId(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </Field>

                <Field label="Staff Reference Name">
                  <input
                    type="text"
                    value={staffReferenceName}
                    onChange={(event) =>
                      setStaffReferenceName(
                        event.target.value
                      )
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </Field>
              </>
            )}

            <div className="md:col-span-2">
              <Field
                label="Work Title"
                required
              >
                <input
                  type="text"
                  value={workTitle}
                  onChange={(event) =>
                    setWorkTitle(
                      event.target.value
                    )
                  }
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Work Location">
                <input
                  type="text"
                  value={workLocation}
                  onChange={(event) =>
                    setWorkLocation(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Work Description">
                <textarea
                  value={workDescription}
                  onChange={(event) =>
                    setWorkDescription(
                      event.target.value
                    )
                  }
                  rows={5}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>

          </div>
        </section>

        {/* Planned Work Period */}
        <section className="rounded-xl border bg-background p-6">

          <h2 className="text-lg font-semibold">
            Planned Work Period
          </h2>

          <div className="mt-6 grid gap-6 md:grid-cols-2">

            <Field label="Planned Start">
              <input
                type="datetime-local"
                value={plannedStart}
                onChange={(event) =>
                  setPlannedStart(
                    event.target.value
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Planned End">
              <input
                type="datetime-local"
                value={plannedEnd}
                onChange={(event) =>
                  setPlannedEnd(
                    event.target.value
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>

          </div>
        </section>

        {/* Actions */}
        <div className="flex justify-end gap-3">

          <button
            type="button"
            onClick={() =>
              router.push(
                `/permits/${permitId}`
              )
            }
            disabled={saving}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? 'Saving...'
              : 'Save Changes'}
          </button>

        </div>

      </form>
    </div>
  )
}

/* =========================================================
   FIELD
   ========================================================= */

function Field({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-sm font-medium">
        {label}

        {required && (
          <span className="ml-1 text-destructive">
            *
          </span>
        )}
      </label>

      <div className="mt-2">
        {children}
      </div>
    </div>
  )
}

/* =========================================================
   DATE FORMATTER
   ========================================================= */

function formatDateTimeLocal(
  value: string | null
) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0')
  const day = String(
    date.getDate()
  ).padStart(2, '0')
  const hours = String(
    date.getHours()
  ).padStart(2, '0')
  const minutes = String(
    date.getMinutes()
  ).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}