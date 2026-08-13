'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DashboardShell } from '@/components/layout/dashboard-shell'

type PermitType = {
  id: number
  name: string
  code: string
  requires_jha: boolean
  requires_gas_test: boolean
  requires_loto: boolean
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

export default function NewPermitPage() {
  const router = useRouter()
  const supabase = createClient()

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

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')

  const selectedPermitType = permitTypes.find(
    (type) => type.id === Number(permitTypeId)
  )

  useEffect(() => {
    async function loadFormData() {
      const [
        permitTypesResult,
        areasResult,
        equipmentResult,
        contractorsResult,
      ] = await Promise.all([
        supabase
          .from('permit_types')
          .select(`
            id,
            name,
            code,
            requires_jha,
            requires_gas_test,
            requires_loto
          `)
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

      if (permitTypesResult.error) {
        setError(permitTypesResult.error.message)
      } else {
        setPermitTypes(permitTypesResult.data ?? [])
      }

      if (areasResult.error) {
        setError(areasResult.error.message)
      } else {
        setAreas(areasResult.data ?? [])
      }

      if (equipmentResult.error) {
        setError(equipmentResult.error.message)
      } else {
        setEquipment(equipmentResult.data ?? [])
      }

      if (contractorsResult.error) {
        setError(contractorsResult.error.message)
      } else {
        setContractors(contractorsResult.data ?? [])
      }

      setLoadingData(false)
    }

    loadFormData()
  }, [supabase])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login')
      return
    }

    const selectedPermitType = permitTypes.find(
      (type) => type.id === Number(permitTypeId)
    )

    if (!selectedPermitType) {
      setError('Please select a valid permit type.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('permits')
      .insert({
        permit_type_id: Number(permitTypeId),
        requester_id: user.id,
        work_title: workTitle,
        work_description: workDescription || null,
        work_location: workLocation || null,
        area_id: areaId ? Number(areaId) : null,
        equipment_id: equipmentId ? Number(equipmentId) : null,
        contractor_id: contractorId ? Number(contractorId) : null,
        planned_start: plannedStart || null,
        planned_end: plannedEnd || null,
        status: 'draft',
      })
      .select('id, permit_no')
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/permits/${data.id}`)
    router.refresh()
  }

  if (loadingData) {
    return (
      <DashboardShell>
        <p className="text-muted-foreground">
          Loading permit form...
        </p>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Create Permit
        </h1>

        <p className="mt-2 text-muted-foreground">
          Create a new permit-to-work application.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-8"
        >
          <section className="rounded-xl border bg-background p-6">
            <h2 className="text-lg font-semibold">
              Permit Information
            </h2>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <Field label="Permit Type" required>
                <select
                  value={permitTypeId}
                  onChange={(event) =>
                    setPermitTypeId(event.target.value)
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
                    setEquipmentId(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">
                    Select equipment
                  </option>

                  {equipment
                    .filter(
                      (item) =>
                        !areaId ||
                        item.area_id === Number(areaId)
                    )
                    .map((item) => (
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
                    setContractorId(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">
                    Select contractor
                  </option>

                  {contractors.map((contractor) => (
                    <option
                      key={contractor.id}
                      value={contractor.id}
                    >
                      {contractor.company_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-xl border bg-background p-6">
            <h2 className="text-lg font-semibold">
              Work Details
            </h2>

            <div className="mt-6 space-y-6">
              <Field label="Work Title" required>
                <input
                  type="text"
                  value={workTitle}
                  onChange={(event) =>
                    setWorkTitle(event.target.value)
                  }
                  placeholder="e.g. Welding repair at production machine"
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Work Description">
                <textarea
                  value={workDescription}
                  onChange={(event) =>
                    setWorkDescription(event.target.value)
                  }
                  rows={5}
                  placeholder="Describe the work to be performed..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Work Location">
                <input
                  type="text"
                  value={workLocation}
                  onChange={(event) =>
                    setWorkLocation(event.target.value)
                  }
                  placeholder="Specific work location"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
          </section>

          {selectedPermitType && (
            <section className="rounded-xl border bg-background p-6">
              <h2 className="text-lg font-semibold">
                Safety Requirements
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                Safety requirements are determined automatically
                based on the selected permit type.
              </p>

              <div className="mt-6 space-y-3">
                <SafetyRequirement
                  label="JSA / JHA"
                  required={selectedPermitType.requires_jha}
                />

                <SafetyRequirement
                  label="Gas Testing"
                  required={selectedPermitType.requires_gas_test}
                />

                <SafetyRequirement
                  label="LOTO"
                  required={selectedPermitType.requires_loto}
                />
              </div>
            </section>
          )}

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
                    setPlannedStart(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Planned End">
                <input
                  type="datetime-local"
                  value={plannedEnd}
                  onChange={(event) =>
                    setPlannedEnd(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/permits')}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Draft'}
            </button>
          </div>
        </form>
      </div>
    </DashboardShell>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}

        {required && (
          <span className="ml-1 text-destructive">
            *
          </span>
        )}
      </label>

      {children}
    </div>
  )
}

function SafetyRequirement({
  label,
  required,
}: {
  label: string
  required: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <span className="text-sm font-medium">
        {label}
      </span>

      <span
        className={
          required
            ? 'text-sm font-medium text-destructive'
            : 'text-sm text-muted-foreground'
        }
      >
        {required ? 'Required' : 'Not required'}
      </span>
    </div>
  )
}