'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DashboardShell } from '@/components/layout/dashboard-shell'
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
import {
  SearchableCombobox,
  type ComboboxOption,
} from '@/components/company/searchable-combobox'
import { BackButton } from '@/components/ui/back-button'

type Profile = {
  id: string
  full_name: string
  role: string
  company_id: number | null
}

type Company = {
  id: number
  name: string
  code: string
}

type PermitType = {
  id: number
  name: string
  code: string
  requires_jha: boolean
  requires_gas_test: boolean
  requires_loto: boolean
  requires_site_verification: boolean
  requires_worker_briefing: boolean
  requires_emergency_arrangements: boolean
}
type SafetyControl = {
  id: number
  code: string
  name: string
  description: string | null
  category: string
  is_required: boolean
  is_recommended: boolean
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

export default function NewPermitPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [permitTypes, setPermitTypes] = useState<PermitType[]>([])
  const [safetyControls, setSafetyControls] = useState<SafetyControl[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])

  const [companyId, setCompanyId] = useState('')
  const [companyOption, setCompanyOption] =
    useState<ComboboxOption | null>(null)
  const [permitTypeId, setPermitTypeId] = useState('')
  const [workTitle, setWorkTitle] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [workMethod, setWorkMethod] = useState('')
  const [areaId, setAreaId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
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
  const [recommendedControlIds, setRecommendedControlIds] = useState<
    Set<number>
  >(new Set())

  const [specialDetails, setSpecialDetails] = useState<SpecialDetailsState>({})
  const [csePersonnel, setCsePersonnel] = useState<CsePersonnelDraft[]>([])

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submissionErrors, setSubmissionErrors] = useState<
    Array<{ field: string; message: string }>
  >([])
  const [submittedPermit, setSubmittedPermit] = useState<{
    id: number
    permit_no: string
    status: string
  } | null>(null)

  const selectedPermitType = permitTypes.find(
    (type) => type.id === Number(permitTypeId)
  )

  const selectedCompany = companies.find(
    (company) => company.id === Number(companyId)
  )

  const isPlatformAdmin =
    profile?.role === 'platform_admin'

  const isContractor =
    profile?.role === 'contractor_admin' &&
    profile?.company_id === null

  // ---------------------------------------------------------
  // Customer company search + selection
  // ---------------------------------------------------------

  async function searchCompanies(
    query: string
  ): Promise<ComboboxOption[]> {
    const response = await fetch(
      `/api/companies/search?q=${encodeURIComponent(query)}`
    )

    if (!response.ok) {
      throw new Error(
        'Failed to search companies'
      )
    }

    const data = await response.json()

    return (data.companies ?? []).map(
      (company: {
        id: number
        name: string
        code: string | null
        ssm_registration_no: string | null
      }) => ({
        id: company.id,
        label: company.name,
        code: company.code,
        subtitle: company.ssm_registration_no,
      })
    )
  }

  function handleCompanyChange(
    option: ComboboxOption | null
  ) {
    setCompanyOption(option)
    setCompanyId(
      option ? String(option.id) : ''
    )
  }

  // ---------------------------------------------------------
  // Load profile and company access
  // ---------------------------------------------------------

  useEffect(() => {
    async function loadProfileAndCompanies() {
      setLoadingData(true)
      setError('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/login')
        return
      }

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          role,
          company_id
        `)
        .eq('id', user.id)
        .single()

      if (profileError || !profileData) {
        setError(
          profileError?.message ||
            'Unable to load your profile.'
        )
        setLoadingData(false)
        return
      }

      setProfile(profileData)

      // -------------------------------------------------------
      // Platform admin: can select any active company
      // -------------------------------------------------------

      if (
        profileData.role === 'platform_admin'
      ) {
        const {
          data,
          error: companiesError,
        } = await supabase
          .from('companies')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name')

        if (companiesError) {
          setError(companiesError.message)
        } else {
          setCompanies(data ?? [])
        }

        setLoadingData(false)
        return
      }

      // -------------------------------------------------------
      // Internal company user:
      // automatically use their company
      // -------------------------------------------------------

      if (profileData.company_id) {
        const {
          data,
          error: companyError,
        } = await supabase
          .from('companies')
          .select('id, name, code')
          .eq('id', profileData.company_id)
          .eq('is_active', true)
          .single()

        if (companyError || !data) {
          setError(
            companyError?.message ||
              'Your company could not be loaded.'
          )
        } else {
          setCompanies([data])
          setCompanyId(String(data.id))
          setCompanyOption({
            id: data.id,
            label: data.name,
            code: data.code,
          })
        }

        setLoadingData(false)
        return
      }

      // -------------------------------------------------------
      // Contractor:
      // determine contractor through membership,
      // then load only authorized companies
      // -------------------------------------------------------

      if (
        profileData.role === 'contractor_admin'
      ) {
        const {
          data: membership,
          error: membershipError,
        } = await supabase
          .from('contractor_users')
          .select(`
            contractor_id,
            is_active
          `)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single()

        if (
          membershipError ||
          !membership
        ) {
          setError(
            membershipError?.message ||
              'Your contractor account is not configured.'
          )
          setLoadingData(false)
          return
        }

        const {
          data: relationships,
          error: relationshipError,
        } = await supabase
          .from('contractor_companies')
          .select(`
            company_id,
            companies (
              id,
              name,
              code
            )
          `)
          .eq(
            'contractor_id',
            membership.contractor_id
          )
          .eq('is_active', true)

        if (relationshipError) {
          setError(
            relationshipError.message
          )
          setLoadingData(false)
          return
        }

        const authorizedCompanies =
          (relationships ?? [])
            .map((relationship) => {
              const company =
                relationship.companies as unknown as
                  | Company
                  | Company[]
                  | null

              if (Array.isArray(company)) {
                return company[0] ?? null
              }

              return company
            })
            .filter(
              (
                company
              ): company is Company =>
                company !== null
            )

        setCompanies(
          authorizedCompanies
        )

        if (
          authorizedCompanies.length === 1
        ) {
          setCompanyId(
            String(
              authorizedCompanies[0].id
            )
          )
          setCompanyOption({
            id: authorizedCompanies[0].id,
            label: authorizedCompanies[0].name,
            code: authorizedCompanies[0].code,
          })
        }

        if (
          authorizedCompanies.length === 0
        ) {
          setError(
            'Your contractor is not authorized to submit permits for any company.'
          )
        }

        setLoadingData(false)
        return
      }

      setError(
        'Your account is not configured for permit creation.'
      )

      setLoadingData(false)
    }

    loadProfileAndCompanies()
  }, [router, supabase])

  // ---------------------------------------------------------
  // Load company-specific permit data
  // ---------------------------------------------------------

  useEffect(() => {
    async function loadCompanyData() {
      if (!companyId) {
        setPermitTypes([])
        setAreas([])
        setEquipment([])
        setPermitTypeId('')
        setAreaId('')
        setEquipmentId('')
        return
      }

      setError('')

      const [
        permitTypesResult,
        areasResult,
        equipmentResult,
      ] = await Promise.all([
        supabase
          .from('permit_types')
          .select(`
            id,
            name,
            code,
            requires_jha,
            requires_gas_test,
            requires_loto,
            requires_site_verification,
            requires_worker_briefing,
            requires_emergency_arrangements
          `)
          .eq(
            'company_id',
            Number(companyId)
          )
          .eq('is_active', true)
          .order('name'),

        supabase
          .from('areas')
          .select('id, name, code')
          .eq(
            'company_id',
            Number(companyId)
          )
          .eq('is_active', true)
          .order('name'),

        supabase
          .from('equipment')
          .select(
            'id, name, equipment_no, area_id'
          )
          .eq(
            'company_id',
            Number(companyId)
          )
          .eq('is_active', true)
          .order('name'),
      ])

      if (permitTypesResult.error) {
        setError(
          permitTypesResult.error.message
        )
      } else {
        setPermitTypes(
          permitTypesResult.data ?? []
        )
      }

      if (areasResult.error) {
        setError(
          areasResult.error.message
        )
      } else {
        setAreas(
          areasResult.data ?? []
        )
      }

      if (equipmentResult.error) {
        setError(
          equipmentResult.error.message
        )
      } else {
        setEquipment(
          equipmentResult.data ?? []
        )
      }

      // Reset selections when company changes
      setPermitTypeId('')
      setAreaId('')
      setEquipmentId('')
    }

    loadCompanyData()
  }, [companyId, supabase])

  // ---------------------------------------------------------
  // Load safety controls
  // ---------------------------------------------------------

  useEffect(() => {
    async function loadSafetyControls() {
      if (!permitTypeId) {
        setSafetyControls([])
        setRecommendedControlIds(new Set())
        return
      }

      const {
        data,
        error,
      } = await supabase
        .from('permit_type_safety_controls')
        .select(`
          is_required,
          is_recommended,
          safety_control:safety_controls (
            id,
            code,
            name,
            description,
            category
          )
        `)
        .eq(
          'permit_type_id',
          Number(permitTypeId)
        )

      if (error) {
        setError(error.message)
        setSafetyControls([])
        return
      }

      const controls: SafetyControl[] =
        (data ?? [])
          .filter(
            (item) =>
              item.safety_control
          )
          .map((item) => {
            const control =
              item.safety_control as unknown as {
                id: number
                code: string
                name: string
                description: string | null
                category: string
              }

            return {
              id: control.id,
              code: control.code,
              name: control.name,
              description:
                control.description,
              category:
                control.category,
              is_required:
                item.is_required,
              is_recommended:
                Boolean(item.is_recommended),
            }
          })

      setSafetyControls(controls)

      // Recommended controls start pre-selected (toggleable); required
      // controls are locked and verified on the detail page.
      setRecommendedControlIds(
        new Set(
          controls
            .filter((control) => control.is_recommended)
            .map((control) => control.id)
        )
      )
    }

    loadSafetyControls()
  }, [permitTypeId, supabase])

  // ---------------------------------------------------------
  // Load PPE catalogue + type recommendations
  // ---------------------------------------------------------

  useEffect(() => {
    async function loadPpe() {
      if (!permitTypeId) {
        setPpeItems([])
        setPpeRecommendations(new Map())
        setSelectedPpeIds(new Set())
        return
      }

      const [itemsResult, mappingResult] =
        await Promise.all([
          supabase
            .from('ppe_items')
            .select('id, category, name')
            .eq('is_active', true)
            .order('sort_order'),
          supabase
            .from('permit_type_ppe')
            .select('ppe_item_id, requirement')
            .eq(
              'permit_type_id',
              Number(permitTypeId)
            ),
        ])

      if (itemsResult.error) {
        setError(itemsResult.error.message)
        return
      }

      const items: PpeItem[] = (
        itemsResult.data ?? []
      ).map((item) => ({
        id: item.id,
        category: item.category,
        name: item.name,
      }))

      setPpeItems(items)

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

      // Recommended/required PPE starts selected; the user can toggle
      // recommended items, required items stay locked on.
      setSelectedPpeIds(
        new Set(recommendations.keys())
      )
    }

    loadPpe()
  }, [permitTypeId, supabase])

  // ---------------------------------------------------------
  // Submit
  // ---------------------------------------------------------

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
    mode: 'draft' | 'submit'
  ) {
    event.preventDefault()

    setError('')
    setSubmissionErrors([])
    setSubmittedPermit(null)

    if (!companyId) {
      setError(
        'Please select a customer company.'
      )
      return
    }

    if (!permitTypeId) {
      setError(
        'Please select a valid permit type.'
      )
      return
    }

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

    // For submit mode only, run a quick client-side pre-check for the
    // obvious submission requirements so the user gets immediate feedback.
    // The server-side validator remains authoritative.
    const validWorkers = workers.filter(
      (worker) =>
        worker.full_name.trim() &&
        worker.id_number.trim()
    )

    if (
      mode === 'submit' &&
      isContractor &&
      (validWorkers.length === 0 ||
        !staffReferenceName.trim())
    ) {
      setSubmissionErrors([
        {
          field: 'workers',
          message:
            'Worker name, worker NRIC/passport and the customer staff reference are required for contractor permits.',
        },
      ])
      return
    }

    if (mode === 'submit') {
      setSubmitting(true)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetch(
        '/api/permits',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            submit: mode === 'submit',
            company_id:
              Number(companyId),

            permit_type_id:
              Number(permitTypeId),

            work_title:
              workTitle.trim(),

            work_description:
              workDescription.trim() ||
              null,

            work_location:
              workLocation.trim() ||
              null,

            work_method:
              workMethod.trim() || null,

            workers: validWorkers.map(
              (worker) => ({
                full_name:
                  worker.full_name.trim(),
                id_number:
                  worker.id_number.trim(),
                nationality:
                  worker.nationality ?? null,
                induction_completed: Boolean(
                  worker.induction_completed
                ),
              })
            ),

            area_id: areaId
              ? Number(areaId)
              : null,

            equipment_id: equipmentId
              ? Number(equipmentId)
              : null,

            planned_start:
              plannedStart || null,

            planned_end:
              plannedEnd || null,

            staff_reference_name: isContractor
              ? staffReferenceName.trim() || null
              : null,

            ppe_other:
              ppeOther.trim() || null,

            ppe_item_ids: Array.from(
              selectedPpeIds
            ),

            recommended_control_ids: Array.from(
              recommendedControlIds
            ),

            // Phase E: specialised permit-type details + CSE personnel.
            // Only included when the selected permit type has a
            // specialised section (COLD sends an empty object / no
            // assignments, so no irrelevant fields reach the API).
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

      const result =
        await response.json()

      if (!response.ok) {
        if (Array.isArray(result.errors)) {
          setSubmissionErrors(result.errors)
        } else {
          setError(
            result.error ||
              'Unable to create permit.'
          )
        }
        return
      }

      // Direct submission succeeded: show confirmation instead of the form.
      if (result.submitted === true && result.permit) {
        setSubmittedPermit({
          id: result.permit.id,
          permit_no: result.permit.permit_no,
          status: result.permit.status,
        })
        return
      }

      // Draft saved: navigate to the permit detail page (the continuation of
      // the same workspace).
      router.push(
        `/permits/${result.permit.id}`
      )

      router.refresh()
    } catch {
      setError(
        'Unable to connect to the server.'
      )
    } finally {
      setLoading(false)
      setSubmitting(false)
    }
  }

  if (loadingData) {
    return (
      <DashboardShell>
        <div className="mb-6">
          <BackButton href="/permits" label="Back to Permits" />
        </div>
        <p className="text-muted-foreground">
          Loading permit form...
        </p>
      </DashboardShell>
    )
  }

  if (isPlatformAdmin) {
    return (
      <DashboardShell>
        <div className="max-w-4xl">
          <div className="mb-6">
            <BackButton href="/permits" label="Back to Permits" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight">
            Create Permit
          </h1>

          <p className="mt-2 text-muted-foreground">
            Create a new permit-to-work application.
          </p>

          <div className="mt-8 rounded-xl border bg-background p-8 text-center">
            <p className="font-semibold">
              Platform Admin does not create operational permits
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              Operational permits are created by Safety Managers, Safety
              Coordinators, Internal Staff and Contractor Admins.
            </p>
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="max-w-4xl">

        <div className="mb-6">
          <BackButton href="/permits" label="Back to Permits" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight">
          Create Permit
        </h1>

        <p className="mt-2 text-muted-foreground">
          Create a new permit-to-work application.
        </p>

        <form
          onSubmit={(event) =>
            handleSubmit(event, 'draft')
          }
          className="mt-8 space-y-8"
        >

          {/* ------------------------------------------------ */}
          {/* Permit Information */}
          {/* ------------------------------------------------ */}

          <section className="rounded-xl border bg-background p-6">

            <SectionHeader
              title="Permit Information"
              description="Company, permit type and location for the work to be performed."
            />

            <div className="mt-6 grid gap-4 sm:grid-cols-1 lg:grid-cols-2">

              {/* Customer Company */}

              <Field
                label="Customer Company"
                required
              >
                <SearchableCombobox
                  searchFn={searchCompanies}
                  value={companyOption}
                  onChange={handleCompanyChange}
                  placeholder="Search customer company..."
                  clearable={
                    isPlatformAdmin || isContractor
                  }
                />
              </Field>

              {/* Permit Type */}

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
                  disabled={
                    !companyId ||
                    permitTypes.length === 0
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">
                    {!companyId
                      ? 'Select company first'
                      : 'Select permit type'}
                  </option>

                  {permitTypes.map(
                    (type) => (
                      <option
                        key={type.id}
                        value={type.id}
                      >
                        {type.name}
                      </option>
                    )
                  )}
                </select>
              </Field>

              {/* Area */}

              <Field label="Area">
                <select
                  value={areaId}
                  onChange={(event) =>
                    setAreaId(
                      event.target.value
                    )
                  }
                  disabled={!companyId}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
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

              {/* Equipment */}

              <Field label="Equipment">
                <select
                  value={equipmentId}
                  onChange={(event) =>
                    setEquipmentId(
                      event.target.value
                    )
                  }
                  disabled={!companyId}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">
                    Select equipment
                  </option>

                  {equipment
                    .filter(
                      (item) =>
                        !areaId ||
                        item.area_id ===
                          Number(areaId)
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

            </div>

            {isContractor && (
              <p className="mt-4 text-xs text-muted-foreground">
                You can only submit permits for
                companies authorized for your
                contractor account.
              </p>
            )}

          </section>

          {/* ------------------------------------------------ */}
          {/* Work Details */}
          {/* ------------------------------------------------ */}

          <section className="rounded-xl border bg-background p-6">

            <SectionHeader
              title="Work Details"
              description="Describe the scope, location and method of the work to be performed."
            />

            <div className="mt-6 grid gap-4 sm:grid-cols-1 lg:grid-cols-2">

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
                  placeholder="e.g. Welding repair at production machine"
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Work Location">
                <input
                  type="text"
                  value={workLocation}
                  onChange={(event) =>
                    setWorkLocation(
                      event.target.value
                    )
                  }
                  placeholder="Specific work location"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

            </div>

            <div className="mt-6 space-y-6">

              <Field label="Work Description">
                <textarea
                  value={workDescription}
                  onChange={(event) =>
                    setWorkDescription(
                      event.target.value
                    )
                  }
                  rows={4}
                  placeholder="Describe the work to be performed..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

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

          </section>

          {/* ------------------------------------------------ */}
          {/* Planned Work Period */}
          {/* ------------------------------------------------ */}

          <section className="rounded-xl border bg-background p-6">

            <SectionHeader
              title="Planned Work Period"
              description="Optional planned start and end for the work window."
            />

            <div className="mt-6 grid gap-4 sm:grid-cols-1 lg:grid-cols-2">

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

          {/* ------------------------------------------------ */}
          {/* Requirements Summary (live, before submit) */}
          {/* ------------------------------------------------ */}

          {selectedPermitType && (
            <section className="rounded-xl border bg-background p-6">
              <SectionHeader
                title="Permit Requirements"
                description="What you must complete to submit this permit. Safety verification is performed by authorised Safety Personnel after the permit is submitted."
              />

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {(() => {
                  const hasRequiredControls =
                    safetyControls.some(
                      (control) => control.is_required
                    )

                  const hasRequiredPpe =
                    Array.from(
                      ppeRecommendations.values()
                    ).includes('required')

                  const requirements = [
                    {
                      label: 'JHA / HIRARC',
                      state: selectedPermitType.requires_jha
                        ? 'required'
                        : 'not_required',
                      note: selectedPermitType.requires_jha
                        ? 'Fill a JHA or upload an existing HIRARC'
                        : null,
                    },
                    {
                      label: 'Safety Controls',
                      state: hasRequiredControls
                        ? 'required'
                        : 'not_required',
                      note: hasRequiredControls
                        ? 'Required controls must be in place and verified'
                        : null,
                    },
                    {
                      label: 'PPE',
                      state: hasRequiredPpe
                        ? 'required'
                        : 'not_required',
                      note: hasRequiredPpe
                        ? 'Required PPE must be selected and verified as available'
                        : null,
                    },
                    {
                      label: 'Site Verification',
                      state:
                        selectedPermitType.requires_site_verification ===
                        false
                          ? 'not_required'
                          : 'safety',
                      note:
                        selectedPermitType.requires_site_verification ===
                        false
                          ? null
                          : 'Performed by the Safety Officer / Permit Issuer',
                    },
                    {
                      label: 'Gas Testing',
                      state: selectedPermitType.requires_gas_test
                        ? 'required'
                        : 'not_required',
                      note: null,
                    },
                    {
                      label: 'LOTO',
                      state: selectedPermitType.requires_loto
                        ? 'required'
                        : 'not_required',
                      note: selectedPermitType.requires_loto
                        ? 'All isolation points must be verified'
                        : null,
                    },
                    {
                      label: 'Worker Briefing',
                      state: selectedPermitType.requires_worker_briefing
                        ? 'required'
                        : 'not_required',
                      note: selectedPermitType.requires_worker_briefing
                        ? 'Toolbox talk conducted and workers acknowledge'
                        : null,
                    },
                    {
                      label: 'Emergency Arrangements',
                      state: selectedPermitType.requires_emergency_arrangements
                        ? 'required'
                        : 'not_required',
                      note: null,
                    },
                  ]

                  return requirements.map((requirement) => {
                    const badge =
                      requirement.state === 'required' ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                          Required
                        </span>
                      ) : requirement.state === 'safety' ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          Safety Officer
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          Not required
                        </span>
                      )

                    return (
                      <div
                        key={requirement.label}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <span>{requirement.label}</span>
                        <span className="ml-auto flex items-center gap-2">
                          {requirement.note && (
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                              {requirement.note}
                            </span>
                          )}
                          {badge}
                        </span>
                      </div>
                    )
                  })
                })()}
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Requirements are determined by the selected permit type and
                are shown here so you know what is expected before you submit.
                Safety verification is performed by authorised Safety Personnel after the permit is submitted.
              </p>
            </section>
          )}

          {/* ------------------------------------------------ */}
          {/* Contractor: Worker Details + Staff Reference */}
          {/* ------------------------------------------------ */}

          {isContractor && (
            <>
              <section className="rounded-xl border bg-background p-6">
                <SectionHeader
                  title="Workers / Authorised Personnel"
                  description="List every worker performing this work. At least one worker with a full name and NRIC/passport is required for contractor permits."
                />

                <div className="mt-6">
                  <WorkerListEditor
                    mode="contractor"
                    initial={workers}
                    onChange={setWorkers}
                  />
                </div>
              </section>

              <section className="rounded-xl border bg-background p-6">
                <SectionHeader
                  title={`${selectedCompany?.name ?? 'Customer Company'}'s Staff Reference`}
                  description="Name of the company staff you are liaising with for this work. Required for contractor permits."
                />

                <div className="mt-6">
                  <Field
                    label={`${selectedCompany?.name ?? 'Customer Company'}'s Staff Reference`}
                    required
                  >
                    <input
                      type="text"
                      value={staffReferenceName}
                      onChange={(event) =>
                        setStaffReferenceName(
                          event.target.value
                        )
                      }
                      placeholder="e.g. Ahmad bin Ali"
                      required
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
              </section>
            </>
          )}



          {/* ------------------------------------------------ */}
          {/* Workers / Authorised Personnel (internal PTW) */}
          {/* ------------------------------------------------ */}

          {!isContractor && (
            <section className="rounded-xl border bg-background p-6">
              <SectionHeader
                title="Workers / Authorised Personnel"
                description="List the authorised personnel who will perform this work."
              />

              <div className="mt-6">
                <WorkerListEditor
                  mode="internal"
                  initial={workers}
                  onChange={setWorkers}
                />
              </div>
            </section>
          )}

          {/* ------------------------------------------------ */}
          {/* Safety Requirements */}
          {/* ------------------------------------------------ */}

          {selectedPermitType && (
            <section className="rounded-xl border bg-background p-6">

              <SectionHeader
                title="Safety Requirements"
                description="Required controls are enforced before approval. Recommended controls are pre-selected and can be adjusted."
              />

              <div className="mt-6 grid gap-2 sm:grid-cols-2">

                {safetyControls.length > 0 ? (
                  safetyControls.map(
                    (control) => {
                      const isRequired =
                        control.is_required
                      const isRecommended =
                        control.is_recommended &&
                        !isRequired
                      const isChecked =
                        isRequired ||
                        recommendedControlIds.has(
                          control.id
                        )
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
                              setRecommendedControlIds(
                                next
                              )
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
                    }
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No safety controls are configured for this
                    permit type.
                  </p>
                )}

              </div>

            </section>
          )}

          {/* ------------------------------------------------ */}
          {/* PPE Requirements */}
          {/* ------------------------------------------------ */}

          {selectedPermitType && (
            <section className="rounded-xl border bg-background p-6">

              <SectionHeader
                title="PPE Requirements"
                description="Recommended PPE is based on the permit type. Adjust the selection for the specific work and hazards."
              />

              <div className="mt-6">
                <PpeSelector
                  items={ppeItems}
                  recommendationByItemId={
                    ppeRecommendations
                  }
                  selectedIds={selectedPpeIds}
                  onToggle={(id) => {
                    const next = new Set(
                      selectedPpeIds
                    )
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
          )}

          {/* ------------------------------------------------ */}
          {/* Specialised Permit Details (Phase E) */}
          {/* ------------------------------------------------ */}

          {/* Only specialised permit types (HOT/CSE/WAH/ELEC) render a
              detail section; COLD permits have no specialised section. */}
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

          {/* ------------------------------------------------ */}
          {/* CSE Personnel Responsibilities (Phase E) */}
          {/* ------------------------------------------------ */}

          {selectedPermitType?.code === 'CSE' && (
            <section className="rounded-xl border bg-background p-6">
              <SectionHeader
                title="Confined Space Personnel"
                description="Permit-level responsibilities assigned from the workers listed on this permit. No new global roles."
              />

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



          {/* ------------------------------------------------ */}
          {/* Error */}
          {/* ------------------------------------------------ */}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {submissionErrors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <p className="font-medium text-destructive">
                Cannot submit permit yet
              </p>
              <p className="mt-1 text-sm text-destructive/80">
                The following items must be completed before submission:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-destructive/90">
                {submissionErrors.map((item, index) => (
                  <li key={index}>{item.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ------------------------------------------------ */}
          {/* Actions */}
          {/* ------------------------------------------------ */}

          <div className="flex justify-end gap-3">

            <button
              type="button"
              onClick={() =>
                router.push('/permits')
              }
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={(event) =>
                handleSubmit(
                  event as unknown as React.FormEvent<HTMLFormElement>,
                  'submit'
                )
              }
              disabled={
                submitting ||
                loading ||
                !companyId ||
                !permitTypeId
              }
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? 'Submitting...'
                : 'Submit Permit'}
            </button>

            <button
              type="submit"
              disabled={
                loading ||
                submitting ||
                !companyId ||
                !permitTypeId
              }
              className="rounded-md border px-5 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? 'Saving...'
                : 'Save Draft'}
            </button>

          </div>

        </form>

        {submittedPermit && (
          <div className="mt-8 rounded-xl border bg-background p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
              ✓
            </div>
            <h2 className="mt-4 text-2xl font-bold">
              Permit Submitted
            </h2>
            <p className="mt-2 text-lg font-semibold text-primary">
              {submittedPermit.permit_no}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Status:{' '}
              <span className="font-medium uppercase">
                {submittedPermit.status.replaceAll('_', ' ')}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Submitted by: {profile?.full_name ?? 'You'}
            </p>
            <div className="mt-6">
              <Link
                href={`/permits/${submittedPermit.id}`}
                className="inline-flex rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                View Permit
              </Link>
            </div>
          </div>
        )}

      </div>
    </DashboardShell>
  )
}

function SectionHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <header className="border-b pb-4">
      <h2 className="text-lg font-semibold">
        {title}
      </h2>

      {description && (
        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </header>
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
