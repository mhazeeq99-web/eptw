'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DashboardShell } from '@/components/layout/dashboard-shell'

type Profile = {
  id: string
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
}

type SafetyControl = {
  id: number
  code: string
  name: string
  description: string | null
  category: string
  is_required: boolean
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
  const [permitTypeId, setPermitTypeId] = useState('')
  const [workTitle, setWorkTitle] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [areaId, setAreaId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')

  const [workerName, setWorkerName] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [staffReferenceName, setStaffReferenceName] = useState('')

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')

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
        profileData.role === 'requester'
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
            requires_loto
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
        return
      }

      const {
        data,
        error,
      } = await supabase
        .from('permit_type_safety_controls')
        .select(`
          is_required,
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
        .eq('is_required', true)

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
            }
          })

      setSafetyControls(controls)
    }

    loadSafetyControls()
  }, [permitTypeId, supabase])

  // ---------------------------------------------------------
  // Submit
  // ---------------------------------------------------------

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')

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

    if (!workTitle.trim()) {
      setError(
        'Work title is required.'
      )
      return
    }

    setLoading(true)

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

            worker_name: isContractor
              ? workerName.trim() || null
              : null,

            worker_id: isContractor
              ? workerId.trim() || null
              : null,

            staff_reference_name: isContractor
              ? staffReferenceName.trim() || null
              : null,
          }),
        }
      )

      const result =
        await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Unable to create permit.'
        )
        return
      }

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
    }
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

  if (isPlatformAdmin) {
    return (
      <DashboardShell>
        <div className="max-w-4xl">
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

          {/* ------------------------------------------------ */}
          {/* Permit Information */}
          {/* ------------------------------------------------ */}

          <section className="rounded-xl border bg-background p-6">

            <h2 className="text-lg font-semibold">
              Permit Information
            </h2>

            <div className="mt-6 grid gap-6 md:grid-cols-2">

              {/* Customer Company */}

              <Field
                label="Customer Company"
                required
              >
                {isPlatformAdmin ||
                isContractor ? (
                  <select
                    value={companyId}
                    onChange={(event) =>
                      setCompanyId(
                        event.target.value
                      )
                    }
                    required
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">
                      Select customer company
                    </option>

                    {companies.map(
                      (company) => (
                        <option
                          key={company.id}
                          value={company.id}
                        >
                          {company.name}
                          {company.code
                            ? ` (${company.code})`
                            : ''}
                        </option>
                      )
                    )}
                  </select>
                ) : (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {selectedCompany
                      ? `${selectedCompany.name}${
                          selectedCompany.code
                            ? ` (${selectedCompany.code})`
                            : ''
                        }`
                      : 'Your company'}
                  </div>
                )}
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
          {/* Contractor: Worker Details + Staff Reference */}
          {/* ------------------------------------------------ */}

          {isContractor && (
            <>
              <section className="rounded-xl border bg-background p-6">
                <h2 className="text-lg font-semibold">
                  Worker Details
                </h2>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <Field label="Worker Name" required>
                    <input
                      type="text"
                      value={workerName}
                      onChange={(event) =>
                        setWorkerName(event.target.value)
                      }
                      placeholder="e.g. Mohd Ali"
                      required
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </Field>

                  <Field label="Worker ID" required>
                    <input
                      type="text"
                      value={workerId}
                      onChange={(event) =>
                        setWorkerId(event.target.value)
                      }
                      placeholder="e.g. CT-2045"
                      required
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-xl border bg-background p-6">
                <h2 className="text-lg font-semibold">
                  {`${selectedCompany?.name ?? 'Customer Company'}'s Staff Reference`}
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                  Name of the company staff you are
                  liaising with for this work.
                </p>

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
          {/* Work Details */}
          {/* ------------------------------------------------ */}

          <section className="rounded-xl border bg-background p-6">

            <h2 className="text-lg font-semibold">
              Work Details
            </h2>

            <div className="mt-6 space-y-6">

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

              <Field label="Work Description">
                <textarea
                  value={workDescription}
                  onChange={(event) =>
                    setWorkDescription(
                      event.target.value
                    )
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
                    setWorkLocation(
                      event.target.value
                    )
                  }
                  placeholder="Specific work location"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

            </div>

          </section>

          {/* ------------------------------------------------ */}
          {/* Safety Requirements */}
          {/* ------------------------------------------------ */}

          {selectedPermitType && (
            <section className="rounded-xl border bg-background p-6">

              <h2 className="text-lg font-semibold">
                Safety Requirements
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                Safety requirements are determined
                automatically based on the selected
                permit type.
              </p>

              <div className="mt-6 space-y-3">

                {safetyControls.length > 0 ? (
                  safetyControls.map(
                    (control) => (
                      <SafetyRequirement
                        key={control.id}
                        label={control.name}
                        required={
                          control.is_required
                        }
                      />
                    )
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No specific safety controls
                    are configured for this
                    permit type.
                  </p>
                )}

              </div>

            </section>
          )}

          {/* ------------------------------------------------ */}
          {/* Planned Work Period */}
          {/* ------------------------------------------------ */}

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

          {/* ------------------------------------------------ */}
          {/* Error */}
          {/* ------------------------------------------------ */}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
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
              type="submit"
              disabled={
                loading ||
                !companyId ||
                !permitTypeId
              }
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? 'Saving...'
                : 'Save Draft'}
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
        {required
          ? 'Required'
          : 'Not required'}
      </span>

    </div>
  )
}
