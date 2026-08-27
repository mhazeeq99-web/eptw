'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  WorkerListEditor,
  type WorkerDraft,
} from '@/components/permits/worker-list-editor'
import {
  PpeSelector,
  type PpeItem,
} from '@/components/permits/ppe-selector'
import {
  SpecialisedDetailsFields,
  type SpecialDetailsState,
} from '@/components/permits/specialised/specialised-details-fields'
import {
  CsePersonnelEditor,
  type CsePersonnelDraft,
} from '@/components/permits/specialised/cse-personnel-editor'

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

type PermitWorkerRow = {
  id: number
  full_name: string
  id_number: string | null
  nationality: string | null
  is_contractor: boolean
  induction_completed: boolean
}

type Permit = {
  id: number
  permit_no: string
  requester_id: string
  permit_type_id: number
  work_title: string
  work_description: string | null
  work_location: string | null
  work_method: string | null
  area_id: number | null
  equipment_id: number | null
  contractor_id: number | null
  planned_start: string | null
  planned_end: string | null
  staff_reference_name: string | null
  ppe_other: string | null
  status: string
  workers: PermitWorkerRow[] | null
  permit_ppe: Array<{
    ppe_item_id: number
    is_selected: boolean
  }> | null
  recommended_controls: Array<{
    safety_control_id: number
    is_selected: boolean
  }> | null
  special_details: Record<string, unknown> | null
  cse_personnel: Array<{
    worker_id: number
    responsibility: string
  }> | null
}

type SafetyControlRow = {
  id: number
  code: string
  name: string
  is_required: boolean
  is_recommended: boolean
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
  const [workMethod, setWorkMethod] = useState('')
  const [areaId, setAreaId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [contractorId, setContractorId] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [workers, setWorkers] = useState<WorkerDraft[]>([])
  const [staffReferenceName, setStaffReferenceName] = useState('')

  const [ppeItems, setPpeItems] = useState<PpeItem[]>([])
  const [ppeRecommendations, setPpeRecommendations] = useState<
    Map<number, 'recommended' | 'required'>
  >(new Map())
  const [selectedPpeIds, setSelectedPpeIds] = useState<Set<number>>(
    new Set()
  )
  const [ppeOther, setPpeOther] = useState('')
  const [safetyControls, setSafetyControls] = useState<
    SafetyControlRow[]
  >([])
  const [recommendedControlIds, setRecommendedControlIds] = useState<
    Set<number>
  >(new Set())

  const [specialDetails, setSpecialDetails] = useState<SpecialDetailsState>({})
  const [csePersonnel, setCsePersonnel] = useState<CsePersonnelDraft[]>([])

  const selectedPermitType = permitTypes.find(
    (type) => type.id === Number(permitTypeId)
  )

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

      // Resolve the acting user's company so entity dropdowns are scoped to
      // the permitted company (same as the create form).
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      const companyId = profileRow?.company_id ?? null

      let entityQuery = supabase
        .from('permit_types')
        .select('id, name, code')
        .eq('is_active', true)

      let areasQuery = supabase
        .from('areas')
        .select('id, name, code')
        .eq('is_active', true)

      let equipmentQuery = supabase
        .from('equipment')
        .select('id, name, equipment_no, area_id')
        .eq('is_active', true)

      const contractorsQuery = supabase
        .from('contractors')
        .select('id, company_name')
        .eq('is_active', true)

      // Company users see only their own company's entities.
      if (companyId !== null) {
        entityQuery = entityQuery.eq('company_id', companyId)
        areasQuery = areasQuery.eq('company_id', companyId)
        equipmentQuery = equipmentQuery.eq(
          'company_id',
          companyId
        )
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
            company_id,
            permit_type_id,
            work_title,
            work_description,
            work_location,
            work_method,
            area_id,
            equipment_id,
            contractor_id,
            planned_start,
            planned_end,
            staff_reference_name,
            ppe_other,
            status,
            special_details,
            workers:permit_workers (
              id,
              full_name,
              id_number,
              nationality,
              is_contractor,
              induction_completed
            ),
            cse_personnel:permit_cse_personnel (
              worker_id,
              responsibility
            ),
            permit_ppe (
              ppe_item_id,
              is_selected
            ),
            recommended_controls:permit_recommended_controls (
              safety_control_id,
              is_selected
            )
          `)
          .eq('id', permitId)
          .single(),

        entityQuery.order('name'),

        areasQuery.order('name'),

        equipmentQuery.order('name'),

        contractorsQuery.order('company_name'),
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

      setWorkMethod(
        existingPermit.work_method ?? ''
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

      setWorkers(
        (existingPermit.workers ?? []).map(
          (worker) => ({
            full_name: worker.full_name,
            id_number: worker.id_number ?? '',
            nationality: worker.nationality,
            induction_completed:
              worker.induction_completed,
          })
        )
      )

      setStaffReferenceName(
        existingPermit.staff_reference_name ?? ''
      )

      setPpeOther(
        existingPermit.ppe_other ?? ''
      )

      setSelectedPpeIds(
        new Set(
          (existingPermit.permit_ppe ?? [])
            .filter((item) => item.is_selected)
            .map((item) => item.ppe_item_id)
        )
      )

      setRecommendedControlIds(
        new Set(
          (existingPermit.recommended_controls ?? [])
            .filter((item) => item.is_selected)
            .map((item) => item.safety_control_id)
        )
      )

      // Phase E: specialised details + CSE personnel (by worker index).
      setSpecialDetails(
        (existingPermit.special_details ?? {}) as SpecialDetailsState
      )

      const workerIds = (existingPermit.workers ?? []).map(
        (worker) => worker.id
      )
      setCsePersonnel(
        (existingPermit.cse_personnel ?? [])
          .map((assignment) => ({
            worker_index: workerIds.indexOf(assignment.worker_id),
            responsibility: assignment.responsibility as
              | 'entry_supervisor'
              | 'standby_attendant'
              | 'authorised_entrant',
          }))
          .filter((item) => item.worker_index >= 0)
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

  // ---------------------------------------------------------
  // Load PPE catalogue + type recommendations + safety controls
  // for the currently selected permit type.
  // ---------------------------------------------------------

  useEffect(() => {
    if (!permitTypeId) return

    let cancelled = false

    async function loadTypeConfig() {
      const [itemsResult, mappingResult, controlsResult] =
        await Promise.all([
          supabase
            .from('ppe_items')
            .select('id, category, name')
            .eq('is_active', true)
            .order('sort_order'),
          supabase
            .from('permit_type_ppe')
            .select('ppe_item_id, requirement')
            .eq('permit_type_id', Number(permitTypeId)),
          supabase
            .from('permit_type_safety_controls')
            .select(`
              is_required,
              is_recommended,
              safety_control:safety_controls (
                id,
                code,
                name
              )
            `)
            .eq('permit_type_id', Number(permitTypeId)),
        ])

      if (cancelled) return
      if (itemsResult.error) return

      setPpeItems(
        (itemsResult.data ?? []).map((item) => ({
          id: item.id,
          category: item.category,
          name: item.name,
        }))
      )

      const recommendations = new Map<
        number,
        'recommended' | 'required'
      >()
      for (const mapping of mappingResult.data ?? []) {
        if (
          mapping.requirement === 'recommended' ||
          mapping.requirement === 'required'
        ) {
          recommendations.set(
            mapping.ppe_item_id,
            mapping.requirement
          )
        }
      }
      setPpeRecommendations(recommendations)

      // Preserve existing valid selections and automatically add required
      // (and recommended) PPE for the selected type so a required item is
      // never left unchecked + disabled after a permit-type change.
      setSelectedPpeIds((current) => {
        const next = new Set(current)
        for (const [ppeItemId, requirement] of recommendations) {
          if (requirement === 'required' || requirement === 'recommended') {
            next.add(ppeItemId)
          }
        }
        return next
      })

      const controls: SafetyControlRow[] = (
        controlsResult.data ?? []
      )
        .filter((item) => item.safety_control)
        .map((item) => {
          const control = item.safety_control as unknown as {
            id: number
            code: string
            name: string
          }
          return {
            id: control.id,
            code: control.code,
            name: control.name,
            is_required: Boolean(item.is_required),
            is_recommended: Boolean(
              item.is_recommended
            ),
          }
        })
      setSafetyControls(controls)
    }

    loadTypeConfig()
    return () => {
      cancelled = true
    }
  }, [permitTypeId, supabase])

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')

    // Client-side date validation (server also enforces it).
    if (
      plannedStart &&
      plannedEnd &&
      new Date(plannedEnd) <= new Date(plannedStart)
    ) {
      setError(
        'Planned End must be later than Planned Start.'
      )
      return
    }

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
            work_method:
              workMethod.trim() || null,
            workers: workers.map((worker) => ({
              full_name: worker.full_name.trim(),
              id_number: worker.id_number.trim(),
              nationality: worker.nationality ?? null,
              induction_completed: Boolean(
                worker.induction_completed
              ),
            })),
            staff_reference_name:
              staffReferenceName.trim() || null,
            ppe_other:
              ppeOther.trim() || null,
            ppe_item_ids: Array.from(
              selectedPpeIds
            ),
            recommended_control_ids: Array.from(
              recommendedControlIds
            ),
            // Phase E: specialised details + CSE personnel.
            special_details:
              selectedPermitType &&
              ['HOT', 'CSE', 'WAH', 'ELEC'].includes(
                selectedPermitType.code
              )
                ? specialDetails
                : null,
            cse_personnel:
              selectedPermitType?.code === 'CSE'
                ? csePersonnel
                : null,
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
            )}

            <div className="md:col-span-2">
              <Field
                label="Work Title"
              >
                <input
                  type="text"
                  value={workTitle}
                  onChange={(event) =>
                    setWorkTitle(
                      event.target.value
                    )
                  }
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
                  rows={4}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Work Method / Sequence">
                <textarea
                  value={workMethod}
                  onChange={(event) =>
                    setWorkMethod(
                      event.target.value
                    )
                  }
                  rows={3}
                  placeholder="Step-by-step method / sequence of work (optional)..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>

          </div>
        </section>

        {/* Workers / Authorised Personnel */}
        <section className="rounded-xl border bg-background p-6">
          <h2 className="text-lg font-semibold">
            Workers / Authorised Personnel
          </h2>

          <div className="mt-6">
            <WorkerListEditor
              mode={contractorId ? 'contractor' : 'internal'}
              initial={workers}
              onChange={setWorkers}
            />
          </div>
        </section>

        {/* Safety Requirements */}
        <section className="rounded-xl border bg-background p-6">
          <h2 className="text-lg font-semibold">
            Safety Requirements
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            Required controls are enforced before approval. Recommended
            controls are pre-selected and can be adjusted.
          </p>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {safetyControls.map((control) => {
              const isRequired = control.is_required
              const isRecommended =
                control.is_recommended && !isRequired
              const isChecked =
                isRequired ||
                recommendedControlIds.has(control.id)
              return (
                <label
                  key={control.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isRequired}
                    onChange={() => {
                      const next = new Set(
                        recommendedControlIds
                      )
                      if (next.has(control.id)) {
                        next.delete(control.id)
                      } else {
                        next.add(control.id)
                      }
                      setRecommendedControlIds(next)
                    }}
                    className="h-4 w-4 rounded border"
                  />
                  <span>{control.name}</span>
                  {isRequired && (
                    <span className="ml-auto rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      REQUIRED
                    </span>
                  )}
                  {isRecommended && (
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Recommended
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </section>

        {/* PPE Requirements */}
        <section className="rounded-xl border bg-background p-6">
          <h2 className="text-lg font-semibold">
            PPE Requirements
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            Recommended PPE is based on the permit type. Adjust the
            selection for the specific work and hazards.
          </p>

          <div className="mt-6">
            <PpeSelector
              items={ppeItems}
              recommendationByItemId={ppeRecommendations}
              selectedIds={selectedPpeIds}
              onToggle={(id) => {
                const next = new Set(selectedPpeIds)
                if (next.has(id)) {
                  next.delete(id)
                } else {
                  next.add(id)
                }
                setSelectedPpeIds(next)
              }}
              ppeOther={ppeOther}
              onPpeOtherChange={setPpeOther}
            />
          </div>
        </section>

        {/* Specialised Permit Details (Phase E) */}
        {selectedPermitType &&
          ['HOT', 'CSE', 'WAH', 'ELEC'].includes(
            selectedPermitType.code
          ) && (
            <SpecialisedDetailsFields
              code={selectedPermitType.code}
              value={specialDetails}
              onChange={setSpecialDetails}
            />
          )}

        {/* CSE Personnel Responsibilities (Phase E) */}
        {selectedPermitType?.code === 'CSE' && (
          <section className="rounded-xl border bg-background p-6">
            <h2 className="text-lg font-semibold">
              Confined Space Personnel
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Permit-level responsibilities assigned from the workers
              listed on this permit.
            </p>

            <div className="mt-6">
              <CsePersonnelEditor
                workers={workers.map((worker, index) => ({
                  index,
                  full_name: worker.full_name,
                }))}
                value={csePersonnel}
                onChange={setCsePersonnel}
              />
            </div>
          </section>
        )}

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