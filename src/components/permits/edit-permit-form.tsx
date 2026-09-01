'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  FileText, 
  MapPin, 
  Clock, 
  Users, 
  Shield, 
  HardHat,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info
} from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set())

  // Calculate duration
  const duration = calculateDuration(plannedStart, plannedEnd)

  // Calculate completion status
  const completionChecks = [
    { label: 'Work Details', complete: !!workTitle.trim(), icon: FileText },
    { label: 'Location', complete: !!workLocation.trim() || !!areaId, icon: MapPin },
    { label: 'Schedule', complete: !!plannedStart && !!plannedEnd, icon: Clock },
    { label: 'Personnel', complete: workers.length > 0, icon: Users },
    { label: 'PPE', complete: selectedPpeIds.size > 0, icon: HardHat },
    { label: 'Safety Controls', complete: safetyControls.filter(c => c.is_required).length === 0 || safetyControls.filter(c => c.is_required).every(c => recommendedControlIds.has(c.id) || c.is_required), icon: Shield },
  ]

  if (selectedPermitType && ['HOT', 'CSE', 'WAH', 'ELEC'].includes(selectedPermitType.code)) {
    completionChecks.push({
      label: 'Specialised Requirements',
      complete: Object.keys(specialDetails).length > 0,
      icon: AlertTriangle,
    })
  }

  const completedCount = completionChecks.filter(c => c.complete).length
  const totalChecks = completionChecks.length

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

      if (companyId !== null) {
        entityQuery = entityQuery.eq('company_id', companyId)
        areasQuery = areasQuery.eq('company_id', companyId)
        equipmentQuery = equipmentQuery.eq('company_id', companyId)
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
        setError(permitResult.error?.message || 'Permit not found')
        setLoading(false)
        return
      }

      const existingPermit = permitResult.data as Permit

      if (existingPermit.requester_id !== user.id) {
        setError('You are not the requester of this permit.')
        setLoading(false)
        return
      }

      if (existingPermit.status !== 'draft' && existingPermit.status !== 'rejected') {
        setError(`This permit cannot be edited while its status is ${existingPermit.status}.`)
        setLoading(false)
        return
      }

      setPermit(existingPermit)
      setPermitTypeId(String(existingPermit.permit_type_id))
      setWorkTitle(existingPermit.work_title ?? '')
      setWorkDescription(existingPermit.work_description ?? '')
      setWorkLocation(existingPermit.work_location ?? '')
      setWorkMethod(existingPermit.work_method ?? '')
      setAreaId(existingPermit.area_id ? String(existingPermit.area_id) : '')
      setEquipmentId(existingPermit.equipment_id ? String(existingPermit.equipment_id) : '')
      setContractorId(existingPermit.contractor_id ? String(existingPermit.contractor_id) : '')
      setPlannedStart(formatDateTimeLocal(existingPermit.planned_start))
      setPlannedEnd(formatDateTimeLocal(existingPermit.planned_end))
      setWorkers((existingPermit.workers ?? []).map((worker) => ({
        full_name: worker.full_name,
        id_number: worker.id_number ?? '',
        nationality: worker.nationality,
        induction_completed: worker.induction_completed,
      })))
      setStaffReferenceName(existingPermit.staff_reference_name ?? '')
      setPpeOther(existingPermit.ppe_other ?? '')
      setSelectedPpeIds(new Set((existingPermit.permit_ppe ?? []).filter((item) => item.is_selected).map((item) => item.ppe_item_id)))
      setRecommendedControlIds(new Set((existingPermit.recommended_controls ?? []).filter((item) => item.is_selected).map((item) => item.safety_control_id)))
      setSpecialDetails((existingPermit.special_details ?? {}) as SpecialDetailsState)

      const workerIds = (existingPermit.workers ?? []).map((worker) => worker.id)
      setCsePersonnel((existingPermit.cse_personnel ?? [])
        .map((assignment) => ({
          worker_index: workerIds.indexOf(assignment.worker_id),
          responsibility: assignment.responsibility as 'entry_supervisor' | 'standby_attendant' | 'authorised_entrant',
        }))
        .filter((item) => item.worker_index >= 0))

      setPermitTypes(permitTypesResult.data ?? [])
      setAreas(areasResult.data ?? [])
      setEquipment(equipmentResult.data ?? [])
      setContractors(contractorsResult.data ?? [])
      setLoading(false)
    }

    loadData()
  }, [permitId, router, supabase])

  useEffect(() => {
    if (!permitTypeId) return

    let cancelled = false

    async function loadTypeConfig() {
      const [itemsResult, mappingResult, controlsResult] = await Promise.all([
        supabase.from('ppe_items').select('id, category, name').eq('is_active', true).order('sort_order'),
        supabase.from('permit_type_ppe').select('ppe_item_id, requirement').eq('permit_type_id', Number(permitTypeId)),
        supabase.from('permit_type_safety_controls').select(`
          is_required,
          is_recommended,
          safety_control:safety_controls (
            id,
            code,
            name
          )
        `).eq('permit_type_id', Number(permitTypeId)),
      ])

      if (cancelled) return
      if (itemsResult.error) return

      setPpeItems((itemsResult.data ?? []).map((item) => ({
        id: item.id,
        category: item.category,
        name: item.name,
      })))

      const recommendations = new Map<number, 'recommended' | 'required'>()
      for (const mapping of mappingResult.data ?? []) {
        if (mapping.requirement === 'recommended' || mapping.requirement === 'required') {
          recommendations.set(mapping.ppe_item_id, mapping.requirement)
        }
      }
      setPpeRecommendations(recommendations)

      setSelectedPpeIds((current) => {
        const next = new Set(current)
        for (const [ppeItemId, requirement] of recommendations) {
          if (requirement === 'required' || requirement === 'recommended') {
            next.add(ppeItemId)
          }
        }
        return next
      })

      const controls: SafetyControlRow[] = (controlsResult.data ?? [])
        .filter((item) => item.safety_control)
        .map((item) => {
          const control = item.safety_control as unknown as { id: number; code: string; name: string }
          return {
            id: control.id,
            code: control.code,
            name: control.name,
            is_required: Boolean(item.is_required),
            is_recommended: Boolean(item.is_recommended),
          }
        })
      setSafetyControls(controls)
    }

    loadTypeConfig()
    return () => {
      cancelled = true
    }
  }, [permitTypeId, supabase])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (plannedStart && plannedEnd && new Date(plannedEnd) <= new Date(plannedStart)) {
      setError('Planned End must be later than Planned Start.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch(`/api/permits/${permitId}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permit_type_id: Number(permitTypeId),
          work_title: workTitle,
          work_description: workDescription || null,
          work_location: workLocation || null,
          area_id: areaId ? Number(areaId) : null,
          equipment_id: equipmentId ? Number(equipmentId) : null,
          contractor_id: contractorId ? Number(contractorId) : null,
          planned_start: plannedStart || null,
          planned_end: plannedEnd || null,
          work_method: workMethod.trim() || null,
          workers: workers.map((worker) => ({
            full_name: worker.full_name.trim(),
            id_number: worker.id_number.trim(),
            nationality: worker.nationality ?? null,
            induction_completed: Boolean(worker.induction_completed),
          })),
          staff_reference_name: staffReferenceName.trim() || null,
          ppe_other: ppeOther.trim() || null,
          ppe_item_ids: Array.from(selectedPpeIds),
          recommended_control_ids: Array.from(recommendedControlIds),
          special_details: selectedPermitType && ['HOT', 'CSE', 'WAH', 'ELEC'].includes(selectedPermitType.code) ? specialDetails : null,
          cse_personnel: selectedPermitType?.code === 'CSE' ? csePersonnel : null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Unable to update permit.')
        setSaving(false)
        return
      }

      router.push(`/permits/${permitId}`)
      router.refresh()
    } catch {
      setError('Unable to connect to the server.')
      setSaving(false)
    }
  }

  function handleCancel() {
    if (dirtyFields.size > 0) {
      const confirmed = window.confirm('You have unsaved changes. Leave without saving?')
      if (!confirmed) return
    }
    router.push(`/permits/${permitId}`)
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 dark:bg-gray-700" />
        <div className="h-32 bg-gray-100 rounded dark:bg-gray-800" />
        <div className="h-32 bg-gray-100 rounded dark:bg-gray-800" />
      </div>
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
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Completion Progress */}
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Permit Completion
          </span>
          <span className="text-sm text-muted-foreground">
            {completedCount} / {totalChecks} sections complete
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
          <div 
            className={cn(
              "h-full transition-all",
              completedCount === totalChecks ? "bg-green-500" : "bg-blue-500"
            )}
            style={{ width: `${totalChecks > 0 ? Math.round((completedCount / totalChecks) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* ① WORK & LOCATION */}
      <section>
        <SectionHeader
          number={1}
          title="Work & Location"
          icon={FileText}
          description="What work will be performed and where?"
        />
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Permit Type" required>
              <select
                value={permitTypeId}
                onChange={(e) => {
                  setPermitTypeId(e.target.value)
                  setDirtyFields(prev => new Set(prev).add('permitType'))
                }}
                required
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Select permit type</option>
                {permitTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Work Title" required>
              <input
                type="text"
                value={workTitle}
                onChange={(e) => {
                  setWorkTitle(e.target.value)
                  setDirtyFields(prev => new Set(prev).add('workTitle'))
                }}
                required
                placeholder="e.g. Maintenance of clarifier tank"
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
              />
            </Field>
          </div>

          <Field label="Work Description">
            <textarea
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              rows={3}
              placeholder="Describe the work to be performed..."
              className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
            />
          </Field>

          <Field label="Work Method / Sequence">
            <textarea
              value={workMethod}
              onChange={(e) => setWorkMethod(e.target.value)}
              rows={3}
              placeholder="Briefly describe how the work will be carried out, including the main sequence of activities..."
              className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Area">
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Select area</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Equipment">
              <select
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Select equipment</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.equipment_no ? ` (${item.equipment_no})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Work Location">
              <input
                type="text"
                value={workLocation}
                onChange={(e) => setWorkLocation(e.target.value)}
                placeholder="Specific location"
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
              />
            </Field>
          </div>
        </div>
      </section>

      {/* ② WORK PERIOD */}
      <section>
        <SectionHeader
          number={2}
          title="Work Period"
          icon={Clock}
          description="When will the work take place?"
        />
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Planned Start" required>
              <input
                type="datetime-local"
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
              />
            </Field>

            <Field label="Planned End" required>
              <input
                type="datetime-local"
                value={plannedEnd}
                onChange={(e) => setPlannedEnd(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
              />
            </Field>
          </div>

          {duration && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Duration: {duration}
            </div>
          )}
        </div>
      </section>

      {/* ③ PERSONNEL */}
      <section>
        <SectionHeader
          number={3}
          title="Personnel"
          icon={Users}
          description="Who will perform the work?"
        />
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Contractor">
              <select
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">No contractor (internal work)</option>
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>
                    {contractor.company_name}
                  </option>
                ))}
              </select>
            </Field>

            {contractorId && (
              <Field label="Staff Reference Name">
                <input
                  type="text"
                  value={staffReferenceName}
                  onChange={(e) => setStaffReferenceName(e.target.value)}
                  placeholder="Contractor supervisor / reference"
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
                />
              </Field>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                Workers / Authorised Personnel
              </p>
              <Badge variant={workers.length > 0 ? "success" : "secondary"}>
                {workers.length} assigned
              </Badge>
            </div>
            <WorkerListEditor
              mode={contractorId ? 'contractor' : 'internal'}
              initial={workers}
              onChange={setWorkers}
            />
          </div>
        </div>
      </section>

      {/* ④ PPE REQUIREMENTS */}
      <section>
        <SectionHeader
          number={4}
          title="PPE Requirements"
          icon={HardHat}
          description="Personal protective equipment for this work"
        />
        <div className="mt-4">
          <PpeSelector
            items={ppeItems}
            recommendationByItemId={ppeRecommendations}
            selectedIds={selectedPpeIds}
            onToggle={(id) => {
              const next = new Set(selectedPpeIds)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              setSelectedPpeIds(next)
            }}
            ppeOther={ppeOther}
            onPpeOtherChange={setPpeOther}
          />
        </div>
      </section>

      {/* ⑤ SAFETY CONTROLS */}
      <section>
        <SectionHeader
          number={5}
          title="Safety Controls"
          icon={Shield}
          description="Required and recommended controls"
        />
        <div className="mt-4 space-y-3">
          {/* Required controls */}
          {safetyControls.filter(c => c.is_required).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Required — cannot be removed
              </p>
              <div className="space-y-2">
                {safetyControls.filter(c => c.is_required).map((control) => (
                  <div key={control.id} className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50/50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/20">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <span className="flex-1 text-sm">{control.name}</span>
                    <Badge variant="info">Required</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended controls */}
          {safetyControls.filter(c => c.is_recommended && !c.is_required).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Recommended
              </p>
              <div className="space-y-2">
                {safetyControls.filter(c => c.is_recommended && !c.is_required).map((control) => {
                  const isChecked = recommendedControlIds.has(control.id)
                  return (
                    <label key={control.id} className="flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = new Set(recommendedControlIds)
                          if (next.has(control.id)) next.delete(control.id)
                          else next.add(control.id)
                          setRecommendedControlIds(next)
                        }}
                        className="h-4 w-4"
                      />
                      <span className="flex-1 text-sm">{control.name}</span>
                      <Badge variant="secondary">Recommended</Badge>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ⑥ SPECIALISED REQUIREMENTS */}
      {selectedPermitType && ['HOT', 'CSE', 'WAH', 'ELEC'].includes(selectedPermitType.code) && (
        <section>
          <SectionHeader
            number={6}
            title="Specialised Requirements"
            icon={AlertTriangle}
            description={`Additional requirements for ${selectedPermitType.name}`}
          />
          <div className="mt-4">
            <SpecialisedDetailsFields
              code={selectedPermitType.code}
              value={specialDetails}
              onChange={setSpecialDetails}
            />
          </div>

          {selectedPermitType.code === 'CSE' && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3">
                Confined Space Personnel
              </h3>
              <CsePersonnelEditor
                workers={workers.map((worker, index) => ({
                  index,
                  full_name: worker.full_name,
                }))}
                value={csePersonnel}
                onChange={setCsePersonnel}
              />
            </div>
          )}
        </section>
      )}

      {/* Review & Actions */}
      <section className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Review</h2>
          <Badge variant={completedCount === totalChecks ? "success" : "warning"}>
            {completedCount} / {totalChecks} complete
          </Badge>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </section>
    </form>
  )
}

/* =========================================================
   SECTION HEADER
   ========================================================= */

function SectionHeader({
  number,
  title,
  icon: Icon,
  description,
}: {
  number: number
  title: string
  icon: any
  description?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
        {number}
      </div>
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="h-5 w-5 text-blue-600" />
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
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
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

/* =========================================================
   HELPERS
   ========================================================= */

function formatDateTimeLocal(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function calculateDuration(start: string, end: string): string | null {
  if (!start || !end) return null
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null
  if (endDate <= startDate) return null
  
  const diffMs = endDate.getTime() - startDate.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  
  if (diffHours === 0) return `${diffMinutes} minutes`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''}${diffMinutes > 0 ? ` ${diffMinutes} min` : ''}`
  
  const diffDays = Math.floor(diffHours / 24)
  const remainingHours = diffHours % 24
  return `${diffDays} day${diffDays !== 1 ? 's' : ''}${remainingHours > 0 ? ` ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}` : ''}`
}
