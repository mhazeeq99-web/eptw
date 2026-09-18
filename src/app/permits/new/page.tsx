'use client'

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import {
  JhaSection,
  type Jha,
  type HirarcDocument,
} from '@/components/permits/safety-documents/jha-section'
import {
  LotoSection,
  type LotoPoint,
} from '@/components/permits/safety-documents/loto-section'
import {
  GasTestSection,
  type GasTest,
} from '@/components/permits/safety-documents/gas-test-section'
import {
  AttachmentsSection,
  type Attachment,
} from '@/components/permits/attachments-section'
import { 
  FileText, 
  Users, 
  Clock, 
  Shield, 
  HardHat, 
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp,
  Save,
  Send,
  X,
  Loader2,
  Info,
  Building2,
  MapPin,
  Calendar,
  ClipboardCheck,
  Paperclip,
  Lock,
  User
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

// The live child sections start empty on a brand-new draft; each component
// manages its own state directly against the draft permit id.
const EMPTY_JHAS: Jha[] = []
const EMPTY_HIRARC: HirarcDocument[] = []
const EMPTY_LOTO_POINTS: LotoPoint[] = []
const EMPTY_GAS_TESTS: GasTest[] = []
const EMPTY_ATTACHMENTS: Attachment[] = []

const SPECIALISED_TITLES: Record<string, string> = {
  HOT: 'Hot Work Details',
  CSE: 'Confined Space Details',
  WAH: 'Work at Height Details',
  ELEC: 'Electrical Work Details',
}

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

// Shape of the draft returned by GET /api/permits/[id] for edit mode.
type EditPermitData = {
  id: number
  permit_no: string | null
  company_id: number | null
  permit_type_id: number | null
  area_id: number | null
  equipment_id: number | null
  work_title: string | null
  work_description: string | null
  work_location: string | null
  work_method: string | null
  planned_start: string | null
  planned_end: string | null
  staff_reference_name: string | null
  ppe_other: string | null
  special_details: Record<string, unknown> | null
  declaration_confirmed_at: string | null
  company: { id: number; name: string; code: string } | null
  workers: Array<{
    id: number
    full_name: string | null
    id_number: string | null
    nationality: string | null
    induction_completed: boolean | null
  }> | null
  permit_ppe: Array<{
    ppe_item_id: number
    is_selected: boolean | null
  }> | null
  recommended_controls: Array<{
    safety_control_id: number
    is_selected: boolean | null
  }> | null
  cse_personnel: Array<{
    worker_id: number
    responsibility: string
  }> | null
  jhas: Jha[] | null
  hirarc_documents: HirarcDocument[] | null
  loto_points: LotoPoint[] | null
  gas_tests: GasTest[] | null
  attachments: Attachment[] | null
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
  return (
    <Suspense fallback={null}>
      <NewPermitWorkspace />
    </Suspense>
  )
}

function NewPermitWorkspace() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [permitTypes, setPermitTypes] = useState<PermitType[]>([])
  const [safetyControls, setSafetyControls] = useState<SafetyControl[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])

  // ---------------------------------------------------------
  // Draft-first architecture: selecting a customer company + permit type
  // auto-creates a DRAFT permit via POST /api/permits (submit:false).
  // Create and Draft are the SAME PTW — every Save/Submit action PATCHes
  // that draft and this page stays open.
  // ---------------------------------------------------------

  const [draftPermitId, setDraftPermitId] = useState<number | null>(null)
  const [draftPermitNo, setDraftPermitNo] = useState<string | null>(null)

  // ---------------------------------------------------------
  // Edit mode: /permits/new?edit=<permitId> loads an existing draft into the
  // SAME unified workspace instead of the legacy edit page. The draft's data
  // is fetched and pre-populated so the requester can continue where they
  // left off. Create and Draft remain the same PTW.
  // ---------------------------------------------------------
  const searchParams = useSearchParams()
  const editDraftId = (() => {
    const raw = searchParams.get('edit')
    const n = raw ? Number(raw) : NaN
    return Number.isInteger(n) && n > 0 ? n : null
  })()
  const [editPermitData, setEditPermitData] = useState<EditPermitData | null>(null)
  const editLoadedRef = useRef(false)
  const editAppliedRef = useRef(false)
  const [draftCreating, setDraftCreating] = useState(false)
  const [declaration, setDeclaration] = useState(false)
  // Captured from the authenticated user's contractor membership so the
  // update route can preserve contractor_id on the draft permit.
  const [contractorId, setContractorId] = useState<number | null>(null)
  // Guards the bootstrap effect so it auto-creates AT MOST ONE draft permit
  // per form session, regardless of permit-type changes (also survives
  // StrictMode re-runs). Changing the permit type updates the existing draft
  // on save — it must never create a second draft.
  const bootstrapStartedRef = useRef(false)
  // Set by JhaSection so the in-progress JHA is persisted automatically
  // when the user presses Save Draft or Submit Permit.
  const jhaSaveRef = useRef<(() => Promise<boolean>) | null>(null)
  // Number of JHA records actually saved in this session (drives the green
  // tick on the JHA/HIRARC section in create mode).
  const [jhaCount, setJhaCount] = useState(0)
  const [lotoCount, setLotoCount] = useState(0)
  const [gasCount, setGasCount] = useState(0)
  const [attachmentCount, setAttachmentCount] = useState(0)

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
  // Pending edit-mode selections, applied once the permit type's catalog loads.
  const [pendingRecommendedIds, setPendingRecommendedIds] = useState<
    number[] | null
  >(null)
  const [pendingPpeIds, setPendingPpeIds] = useState<number[] | null>(
    null
  )

  const [specialDetails, setSpecialDetails] = useState<SpecialDetailsState>({})
  const [csePersonnel, setCsePersonnel] = useState<CsePersonnelDraft[]>([])

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submissionErrors, setSubmissionErrors] = useState<
    Array<{ field: string; message: string }>
  >([])
  
  // UI state for collapsible sections
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['permit-info', 'work-desc'])
  )

  // Company-level attachment entitlement for UI gating (server enforces).
  // Starts locked; the plan effect unlocks it only for Pro-plan companies.
  const [attachmentsEnabled, setAttachmentsEnabled] = useState(false)
  const [companyPlanCode, setCompanyPlanCode] = useState<string | null>(null)

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

  // Calculate form completion percentage
  const completionPercentage = calculateCompletion()

  function calculateCompletion(): number {
    const steps = [
      !!companyId,
      !!permitTypeId,
      !!workTitle,
      !!workDescription,
      workers.length > 0,
      !!plannedStart,
      !!plannedEnd,
      declaration,
    ]
    
    // Add conditional steps
    if (isContractor) {
      steps.push(!!staffReferenceName)
    }
    
    const completed = steps.filter(Boolean).length
    return Math.round((completed / steps.length) * 100)
  }

  function toggleSection(sectionId: string) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

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

      setCurrentUserId(user.id)

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

        setContractorId(membership.contractor_id)

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
  // Edit mode: load an existing draft into this workspace
  // ---------------------------------------------------------

  useEffect(() => {
    async function loadEditDraft() {
      if (!editDraftId || editLoadedRef.current) return
      if (loadingData) return
      editLoadedRef.current = true
      setError('')
      try {
        const response = await fetch(
          `/api/permits/${editDraftId}`
        )
        const result = await response.json()
        if (!response.ok || !result.permit) {
          setError(
            result.error ||
              'Unable to load the draft for editing.'
          )
          return
        }
        const p = result.permit
        setEditPermitData(p)
        setDraftPermitId(p.id)
        setDraftPermitNo(p.permit_no ?? null)
        if (p.company_id) {
          setCompanyId(String(p.company_id))
          setCompanyOption({
            id: p.company_id,
            label: p.company?.name ?? '',
            code: p.company?.code ?? null,
          })
        }
      } catch {
        setError(
          'Unable to load the draft for editing.'
        )
      }
    }
    loadEditDraft()
  }, [editDraftId, loadingData])

  // Once the company's permit types have loaded (so the type is selectable),
  // apply the draft's permit type and all scalar fields.
  useEffect(() => {
    if (!editPermitData || editAppliedRef.current) return
    if (permitTypes.length === 0) return
    const targetTypeId = editPermitData.permit_type_id
    if (targetTypeId == null) return
    if (!permitTypes.some((t) => t.id === targetTypeId)) return

    editAppliedRef.current = true
    setPermitTypeId(String(targetTypeId))
    setAreaId(editPermitData.area_id ? String(editPermitData.area_id) : '')
    setEquipmentId(
      editPermitData.equipment_id
        ? String(editPermitData.equipment_id)
        : ''
    )
    setWorkTitle(editPermitData.work_title ?? '')
    setWorkDescription(editPermitData.work_description ?? '')
    setWorkLocation(editPermitData.work_location ?? '')
    setWorkMethod(editPermitData.work_method ?? '')
    setPlannedStart(
      editPermitData.planned_start
        ? toLocalInput(editPermitData.planned_start)
        : ''
    )
    setPlannedEnd(
      editPermitData.planned_end
        ? toLocalInput(editPermitData.planned_end)
        : ''
    )
    setStaffReferenceName(
      editPermitData.staff_reference_name ?? ''
    )
    setPpeOther(editPermitData.ppe_other ?? '')
    setWorkers(
      (editPermitData.workers ?? []).map((w) => ({
        full_name: w.full_name ?? '',
        id_number: w.id_number ?? '',
        nationality: w.nationality ?? null,
        induction_completed: w.induction_completed === true,
      }))
    )
    setSpecialDetails(editPermitData.special_details ?? {})
    // CSE personnel: map stored worker_id back to a worker index.
    setCsePersonnel(
      (editPermitData.cse_personnel ?? []).map((a) => {
        const idx = (editPermitData.workers ?? []).findIndex(
          (w) => w.id === a.worker_id
        )
        return {
          worker_index: idx >= 0 ? idx : 0,
          responsibility: a.responsibility as CsePersonnelDraft['responsibility'],
        }
      })
    )
    setDeclaration(
      Boolean(editPermitData.declaration_confirmed_at)
    )
    // Recommended controls + PPE selections are applied once the catalog
    // (safetyControls / ppeItems) has loaded for this permit type.
    setPendingRecommendedIds(
      (editPermitData.recommended_controls ?? [])
        .filter((r) => r.is_selected)
        .map((r) => r.safety_control_id)
    )
    setPendingPpeIds(
      (editPermitData.permit_ppe ?? [])
        .filter((p) => p.is_selected)
        .map((p) => p.ppe_item_id)
    )
  }, [editPermitData, permitTypes])

  // Apply recommended-control + PPE selections once the type's catalog loaded.
  useEffect(() => {
    if (!pendingRecommendedIds) return
    setRecommendedControlIds(new Set(pendingRecommendedIds))
    setPendingRecommendedIds(null)
  }, [pendingRecommendedIds, safetyControls])

  useEffect(() => {
    if (!pendingPpeIds) return
    setSelectedPpeIds(new Set(pendingPpeIds))
    setPendingPpeIds(null)
  }, [pendingPpeIds, ppeItems])

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

  // Resolve the selected company's plan for attachment UI gating. The
  // server-side upload endpoints remain authoritative; this only drives the
  // locked "Attachments on Pro" state in the form. On any failure to resolve
  // the plan we lock the upload UI (conservative): we must never show upload
  // controls the server would reject — a Free-plan company must appear
  // locked even if the plan lookup fails for any reason.
  useEffect(() => {
    let cancelled = false

    async function loadCompanyPlan() {
      if (!companyId) {
        setAttachmentsEnabled(false)
        setCompanyPlanCode(null)
        return
      }

      try {
        const response = await fetch(
          `/api/company/plan?company_id=${encodeURIComponent(companyId)}`
        )
        const body = await response.json()

        if (!cancelled) {
          if (response.ok) {
            setAttachmentsEnabled(body.attachments_enabled === true)
            setCompanyPlanCode(body.plan_code ?? null)
          } else {
            // Plan could not be confirmed for this company — lock the UI;
            // the server enforces the entitlement on upload anyway.
            setAttachmentsEnabled(false)
            setCompanyPlanCode(null)
          }
        }
      } catch {
        if (!cancelled) {
          setAttachmentsEnabled(false)
          setCompanyPlanCode(null)
        }
      }
    }

    loadCompanyPlan()
    return () => {
      cancelled = true
    }
  }, [companyId])

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

      // Recommended controls are NOT pre-selected — the user ticks the ones
      // they want. Required controls are locked and selected (mandatory and
      // verified on the detail page).
      setRecommendedControlIds(new Set())
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

      // Required PPE starts selected (mandatory and part of the safety gate).
      // Recommended PPE is NOT pre-selected — the user ticks what they want.
      setSelectedPpeIds(
        new Set(
          Array.from(recommendations.entries())
            .filter(([, req]) => req === 'required')
            .map(([id]) => id)
        )
      )
    }

    loadPpe()
  }, [permitTypeId, supabase])

  // ---------------------------------------------------------
  // Bootstrap: auto-create the draft permit once the customer company
  // and permit type are both selected (Create == Draft).
  // ---------------------------------------------------------

  useEffect(() => {
    async function createDraft() {
      if (!companyId || !permitTypeId) return
      if (draftPermitId !== null) return
      // Only ever create one draft in this form session. A second permit-type
      // selection must reuse the existing draft (updated on save), not spawn
      // a new one.
      if (bootstrapStartedRef.current) return
      bootstrapStartedRef.current = true

      setDraftCreating(true)
      setError('')

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
              submit: false,
            }),
          }
        )

        const result =
          await response.json()

        if (
          !response.ok ||
          !result.permit
        ) {
          if (Array.isArray(result.errors)) {
            setSubmissionErrors(
              result.errors
            )
          } else {
            setError(
              result.error ||
                'Unable to create the draft permit.'
            )
          }
          return
        }

        setDraftPermitId(result.permit.id)
        setDraftPermitNo(
          result.permit.permit_no ?? null
        )
      } catch {
        setError(
          'Unable to connect to the server while creating the draft permit.'
        )
      } finally {
        setDraftCreating(false)
      }
    }

    createDraft()
  }, [companyId, permitTypeId, draftPermitId])

  // ---------------------------------------------------------
  // Save Draft / Submit Permit
  // ---------------------------------------------------------

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
    mode: 'draft' | 'submit'
  ) {
    event.preventDefault()

    setError('')
    setSubmissionErrors([])

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

    // Planned start/end are required to submit a permit.
    if (mode === 'submit' && (!plannedStart || !plannedEnd)) {
      setSubmissionErrors([
        {
          field: 'work-period',
          message:
            'Planned Start and Planned End are required before submitting the permit.',
        },
      ])
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

    // Warn if any worker row is incomplete (missing name or ID/NRIC). These
    // would otherwise be silently dropped, leaving the permit with 0 workers.
    const incompleteWorkers = workers.filter(
      (worker) =>
        worker.full_name.trim() || worker.id_number.trim()
    ).filter(
      (worker) =>
        !worker.full_name.trim() || !worker.id_number.trim()
    )

    if (workers.length > 0 && incompleteWorkers.length > 0) {
      setSubmissionErrors([
        {
          field: 'workers',
          message: isContractor
            ? `Please complete the name and NRIC/passport for every worker. The following are missing details: ${incompleteWorkers
                .map((w) => w.full_name.trim() || 'Unnamed worker')
                .join(', ')}`
            : `Please complete the name and employee ID for every worker. The following are missing details: ${incompleteWorkers
                .map((w) => w.full_name.trim() || 'Unnamed worker')
                .join(', ')}`,
        },
      ])
      return
    }

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

    if (mode === 'submit' && !declaration) {
      setSubmissionErrors([
        {
          field: 'declaration',
          message:
            'You must confirm the Applicant Declaration before submitting the permit.',
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
      // 1. Ensure the draft permit exists. Normally the bootstrap effect
      //    has already created it; this is the fallback path when the
      //    user saves before the bootstrap completed.
      let permitId = draftPermitId

      if (permitId === null) {
        const createResponse = await fetch(
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
              submit: false,
            }),
          }
        )

        const createResult =
          await createResponse.json()

        if (
          !createResponse.ok ||
          !createResult.permit
        ) {
          if (
            Array.isArray(
              createResult.errors
            )
          ) {
            setSubmissionErrors(
              createResult.errors
            )
          } else {
            setError(
              createResult.error ||
                'Unable to create the draft permit.'
            )
          }
          return
        }

        permitId = createResult.permit.id
        setDraftPermitId(
          createResult.permit.id
        )
        setDraftPermitNo(
          createResult.permit.permit_no ??
            null
        )
      }

      // The create block above either returned on failure or assigned a
      // number; re-assert so TypeScript narrows permitId for the rest of
      // the submit flow.
      if (permitId === null) {
        setError(
          'Unable to create the draft permit.'
        )
        return
      }

      // 1b. Persist any in-progress JHA so the user does not need a separate
      // "Save JHA" step — it is saved together with Save Draft / Submit.
      await jhaSaveRef.current?.()

      // 2. Persist all applicant scalar fields onto the draft permit.
      const patchBody: Record<
        string,
        unknown
      > = {
        permit_type_id:
          Number(permitTypeId),

        work_title: workTitle.trim(),

        work_description:
          workDescription.trim() ||
          null,

        work_location:
          workLocation.trim() || null,

        work_method:
          workMethod.trim() || null,

        area_id: areaId
          ? Number(areaId)
          : null,

        equipment_id: equipmentId
          ? Number(equipmentId)
          : null,

        contractor_id: contractorId,

        planned_start:
          plannedStart || null,

        planned_end:
          plannedEnd || null,

        staff_reference_name:
          isContractor
            ? staffReferenceName.trim() ||
              null
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

        declaration_confirmed_at:
          declaration
            ? new Date().toISOString()
            : null,

        declaration_confirmed_by:
          declaration
            ? currentUserId
            : null,
      }

      // Contractor drafts can be saved before any worker is entered; the
      // update route hard-rejects a contractor payload without a complete
      // worker list, so the worker array is only sent once at least one
      // complete worker exists. Submission-time validation still enforces
      // the full requirement at submit.
      if (validWorkers.length > 0) {
        patchBody.workers = validWorkers.map(
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
        )
      }

      const updateResponse = await fetch(
        `/api/permits/${permitId}/update`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(patchBody),
        }
      )

      const updateResult =
        await updateResponse.json()

      if (!updateResponse.ok) {
        if (
          Array.isArray(updateResult.errors)
        ) {
          setSubmissionErrors(
            updateResult.errors
          )
        } else {
          setError(
            updateResult.error ||
              'Unable to save the permit.'
          )
        }
        return
      }

      // 3. Submit mode: hand the draft to the workflow.
      if (mode === 'submit') {
        const submitResponse =
          await fetch(
            `/api/permits/${permitId}/submit`,
            { method: 'POST' }
          )

        const submitResult =
          await submitResponse.json()

        if (!submitResponse.ok) {
          if (
            Array.isArray(
              submitResult.errors
            )
          ) {
            setSubmissionErrors(
              submitResult.errors
            )
          } else {
            setError(
              submitResult.error ||
                'Unable to submit the permit.'
            )
          }
          return
        }

        // Navigate to the submitted permit; the permit detail page shows a
        // "Permit Submitted Successfully" popup over the refreshed page.
        router.replace(
          `/permits/${permitId}?submitted=1`
        )
        router.refresh()
        return
      }

      // Draft saved: stay on this page — the draft IS the permit, so
      // Create and Draft are the same PTW (no redirect).
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
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p>Loading permit form...</p>
        </div>
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
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <BackButton href="/permits" label="Back to Permits" />
        </div>

        {/* Header with Progress */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                {editDraftId ? 'Edit Permit' : 'Create Permit'}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {editDraftId
                  ? 'Continue editing this draft in the unified permit workspace.'
                  : 'Create a new permit-to-work application.'}
              </p>
              {draftPermitNo && (
                <div className="mt-2">
                  <Badge variant="info">
                    <FileText className="mr-1 h-3 w-3" />
                    Draft: {draftPermitNo}
                  </Badge>
                </div>
              )}
            </div>
            
            {/* Progress Indicator */}
            <div className="w-full sm:w-64">
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Form Completion
                  </span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {completionPercentage}%
                  </span>
                </div>
                <Progress value={completionPercentage} className="h-2" />
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={(event) =>
            handleSubmit(event, 'draft')
          }
          className="space-y-6"
        >
          {/* Section 1: Permit Information */}
          <CollapsibleSection
            id="permit-info"
            title="Permit Information"
            description="Company, permit type and location for the work to be performed."
            icon={Building2}
            isOpen={openSections.has('permit-info')}
            onToggle={() => toggleSection('permit-info')}
            isComplete={!!companyId && !!permitTypeId}
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <Field
                label={isContractor ? 'Customer Company' : 'Company'}
                required
                icon={Building2}
              >
                <SearchableCombobox
                  searchFn={searchCompanies}
                  value={companyOption}
                  onChange={handleCompanyChange}
                  placeholder={
                    isContractor
                      ? 'Search customer company...'
                      : 'Search company...'
                  }
                  clearable={
                    isPlatformAdmin || isContractor
                  }
                />
              </Field>

              <Field
                label="Permit Type"
                required
                icon={FileText}
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
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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

              <Field label="Area" icon={MapPin}>
                <select
                  value={areaId}
                  onChange={(event) =>
                    setAreaId(
                      event.target.value
                    )
                  }
                  disabled={!companyId}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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

              <Field label="Equipment" icon={Wrench}>
                <select
                  value={equipmentId}
                  onChange={(event) =>
                    setEquipmentId(
                      event.target.value
                    )
                  }
                  disabled={!companyId}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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
              <p className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Info className="h-3 w-3" />
                You can only submit permits for companies authorized for your contractor account.
              </p>
            )}
          </CollapsibleSection>

          {/* Bootstrap status */}
          {draftCreating && draftPermitId === null && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating draft permit...
            </div>
          )}

          {/* Full applicant PTW workspace */}
          {draftPermitId !== null && (
            <>
              {/* Section 2: Work Description */}
              <CollapsibleSection
                id="work-desc"
                title="Work Description & Method"
                description="Describe the scope, location and method of the work to be performed."
                icon={ClipboardCheck}
                isOpen={openSections.has('work-desc')}
                onToggle={() => toggleSection('work-desc')}
                isComplete={!!workTitle}
              >
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field
                    label="Work Title"
                    required
                    icon={FileText}
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
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </Field>

                  <Field label="Work Location" icon={MapPin}>
                    <input
                      type="text"
                      value={workLocation}
                      onChange={(event) =>
                        setWorkLocation(
                          event.target.value
                        )
                      }
                      placeholder="Specific work location"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </Field>
                </div>

                <div className="mt-6 space-y-6">
                  <Field label="Work Description" icon={FileText}>
                    <textarea
                      value={workDescription}
                      onChange={(event) =>
                        setWorkDescription(
                          event.target.value
                        )
                      }
                      rows={4}
                      placeholder="Describe the work to be performed..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </Field>

                  <Field label="Work Method / Sequence" icon={ClipboardCheck}>
                    <textarea
                      value={workMethod}
                      onChange={(event) =>
                        setWorkMethod(
                          event.target.value
                        )
                      }
                      rows={3}
                      placeholder="Step-by-step method / sequence of work (optional)..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </Field>
                </div>
              </CollapsibleSection>

              {/* Section 3: Workers */}
              <CollapsibleSection
                id="workers"
                title="Workers / Authorised Personnel"
                description="List the authorised personnel who will perform this work."
                icon={Users}
                isOpen={openSections.has('workers')}
                onToggle={() => toggleSection('workers')}
                isComplete={workers.length > 0}
              >
                <WorkerListEditor
                  mode={isContractor ? "contractor" : "internal"}
                  initial={workers}
                  onChange={setWorkers}
                />
              </CollapsibleSection>

              {/* Contractor Staff Reference */}
              {isContractor && (
                <CollapsibleSection
                  id="staff-ref"
                  title={`${selectedCompany?.name ?? 'Customer Company'}'s Staff Reference`}
                  description="Name of the company staff you are liaising with for this work."
                  icon={User}
                  isOpen={openSections.has('staff-ref')}
                  onToggle={() => toggleSection('staff-ref')}
                  isComplete={!!staffReferenceName}
                >
                  <Field
                    label={`${selectedCompany?.name ?? 'Customer Company'}'s Staff Reference`}
                    required
                    icon={User}
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
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </Field>
                </CollapsibleSection>
              )}

              {/* Section 4: Work Period */}
              <CollapsibleSection
                id="work-period"
                title="Work Period"
                description="Required — the planned start and end for the work window."
                icon={Calendar}
                isOpen={openSections.has('work-period')}
                onToggle={() => toggleSection('work-period')}
                isComplete={!!plannedStart && !!plannedEnd}
              >
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Planned Start" icon={Calendar} required>
                    <input
                      type="datetime-local"
                      value={plannedStart}
                      onChange={(event) =>
                        setPlannedStart(
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </Field>

                  <Field label="Planned End" icon={Calendar} required>
                    <input
                      type="datetime-local"
                      value={plannedEnd}
                      onChange={(event) =>
                        setPlannedEnd(
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </Field>
                </div>
              </CollapsibleSection>

              {/* Section 5: JHA / HIRARC */}
              <CollapsibleSection
                id="jha"
                title="JHA / HIRARC"
                description="Assess hazards and attach the risk assessment for this work."
                icon={AlertTriangle}
                isOpen={openSections.has('jha')}
                onToggle={() => toggleSection('jha')}
                isComplete={jhaCount > 0}
              >
                <JhaSection
                  permitId={draftPermitId}
                  canAdd={true}
                  canVerify={false}
                  initialJhas={editPermitData?.jhas ?? EMPTY_JHAS}
                  initialHirarc={
                    editPermitData?.hirarc_documents ?? EMPTY_HIRARC
                  }
                  embedded
                  saveRef={jhaSaveRef}
                  onJhasChange={setJhaCount}
                  attachmentsEnabled={attachmentsEnabled}
                  isCompanyAdmin={profile?.role === 'safety_manager' || profile?.role === 'platform_admin'}
                  isContractor={isContractor}
                />
              </CollapsibleSection>

              {/* Section 6: Safety Controls */}
              {selectedPermitType && (
                <CollapsibleSection
                  id="safety-controls"
                  title="Safety Controls"
                  description="Required controls are enforced before approval. Tick the recommended controls you plan to use."
                  icon={Shield}
                  isOpen={openSections.has('safety-controls')}
                  onToggle={() => toggleSection('safety-controls')}
                  isComplete={safetyControls.filter(c => c.is_required).length > 0}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
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
                              className={cn(
                                "flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors",
                                isRequired && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
                                !isRequired && "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                              )}
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
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              <span className="flex-1">{control.name}</span>
                              {isRequired && (
                                <Badge variant="destructive">
                                  <Lock className="mr-1 h-3 w-3" />
                                  Required
                                </Badge>
                              )}
                              {isRecommended && (
                                <Badge variant="secondary">
                                  Recommended
                                </Badge>
                              )}
                            </label>
                          )
                        }
                      )
                    ) : (
                      <p className="col-span-full text-sm text-muted-foreground">
                        No safety controls are configured for this permit type.
                      </p>
                    )}
                  </div>
                </CollapsibleSection>
              )}

              {/* Section 7: PPE */}
              {selectedPermitType && (
                <CollapsibleSection
                  id="ppe"
                  title="PPE Requirements"
                  description="Recommended PPE is based on the permit type. Adjust the selection for the specific work and hazards."
                  icon={HardHat}
                  isOpen={openSections.has('ppe')}
                  onToggle={() => toggleSection('ppe')}
                  isComplete={selectedPpeIds.size > 0}
                >
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
                </CollapsibleSection>
              )}

              {/* Section 8: Specialised Details */}
              {selectedPermitType &&
                ['HOT', 'CSE', 'WAH', 'ELEC'].includes(
                  selectedPermitType.code
                ) && (
                  <CollapsibleSection
                    id="special-details"
                    title={
                      SPECIALISED_TITLES[
                        selectedPermitType.code
                      ] ?? 'Specialised Details'
                    }
                    description="Permit-type specific details for this work."
                    icon={Wrench}
                    isOpen={openSections.has('special-details')}
                    onToggle={() =>
                      toggleSection('special-details')
                    }
                    isComplete={hasAnyValue(specialDetails)}
                  >
                    <SpecialisedDetailsFields
                      code={selectedPermitType.code}
                      value={specialDetails}
                      onChange={setSpecialDetails}
                      embedded
                      workers={workers.map((w, index) => ({
                        id: index,
                        full_name: w.full_name,
                      }))}
                    />
                  </CollapsibleSection>
                )}

              {selectedPermitType?.code === 'CSE' && (
                <CollapsibleSection
                  id="cse-personnel"
                  title="Confined Space Personnel"
                  description="Permit-level responsibilities assigned from the workers listed on this permit."
                  icon={Users}
                  isOpen={openSections.has('cse-personnel')}
                  onToggle={() => toggleSection('cse-personnel')}
                  isComplete={hasAnyValue(csePersonnel)}
                >
                  <CsePersonnelEditor
                    workers={workers.map((worker, index) => ({
                      index,
                      full_name: worker.full_name,
                    }))}
                    value={csePersonnel}
                    onChange={setCsePersonnel}
                  />
                </CollapsibleSection>
              )}

              {/* LOTO */}
              {selectedPermitType?.requires_loto && (
                <CollapsibleSection
                  id="loto"
                  title="LOTO — Isolation Points"
                  description="Lock-out / tag-out isolation points required for this work."
                  icon={Lock}
                  isOpen={openSections.has('loto')}
                  onToggle={() => toggleSection('loto')}
                  isComplete={lotoCount > 0}
                >
                  <LotoSection
                    permitId={draftPermitId}
                    canAdd={true}
                    canVerify={false}
                    initialPoints={
                      editPermitData?.loto_points ?? EMPTY_LOTO_POINTS
                    }
                    embedded
                    onPointsChange={setLotoCount}
                  />
                </CollapsibleSection>
              )}

              {/* Gas Testing */}
              {selectedPermitType?.requires_gas_test && (
                <CollapsibleSection
                  id="gas-testing"
                  title="Gas Testing"
                  description="Record atmospheric gas test results for this work."
                  icon={Shield}
                  isOpen={openSections.has('gas-testing')}
                  onToggle={() => toggleSection('gas-testing')}
                  isComplete={gasCount > 0}
                >
                  <GasTestSection
                    permitId={draftPermitId}
                    canAdd={true}
                    canVerify={false}
                    initialTests={
                      editPermitData?.gas_tests ?? EMPTY_GAS_TESTS
                    }
                    embedded
                    onTestsChange={setGasCount}
                  />
                </CollapsibleSection>
              )}

              {/* Attachments */}
              <CollapsibleSection
                id="attachments"
                title="Attachments"
                description="Upload supporting documents and photos for this permit."
                icon={Paperclip}
                isOpen={openSections.has('attachments')}
                onToggle={() => toggleSection('attachments')}
                isComplete={attachmentCount > 0}
              >
                <AttachmentsSection
                  permitId={draftPermitId}
                  canUpload={true}
                  canDelete={false}
                  attachmentsEnabled={attachmentsEnabled}
                  isCompanyOnFreePlan={companyPlanCode === 'free'}
                  isCompanyAdmin={profile?.role === 'safety_manager' || profile?.role === 'platform_admin'}
                  isContractor={isContractor}
                  initialAttachments={
                    editPermitData?.attachments ?? EMPTY_ATTACHMENTS
                  }
                  embedded
                  onAttachmentsChange={setAttachmentCount}
                />
              </CollapsibleSection>

              {/* Declaration */}
              <CollapsibleSection
                id="declaration"
                title="Applicant Declaration"
                description="Confirm that the information provided in this permit application is accurate."
                icon={ClipboardCheck}
                isOpen={openSections.has('declaration')}
                onToggle={() => toggleSection('declaration')}
                isComplete={declaration}
              >
                <label className="flex items-start gap-3 rounded-lg border border-gray-300 p-4 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                  <input
                    type="checkbox"
                    checked={declaration}
                    onChange={(event) =>
                      setDeclaration(
                        event.target.checked
                      )
                    }
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <span>
                    I confirm that the information provided in this permit
                    application is accurate and that I am authorised to
                    apply for this permit.{' '}
                    <span className="text-destructive">*</span>
                  </span>
                </label>
              </CollapsibleSection>
            </>
          )}

          {/* Error Messages */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {submissionErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <p className="flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
                Cannot submit permit yet
              </p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                The following items must be completed before submission:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-600 dark:text-red-400">
                {submissionErrors.map((item, index) => (
                  <li key={index}>{item.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="sticky bottom-0 -mx-4 mt-8 border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 sm:mx-0 sm:rounded-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => router.push('/permits')}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
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
                  draftCreating ||
                  !companyId ||
                  !permitTypeId
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Permit
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={
                  loading ||
                  submitting ||
                  draftCreating ||
                  !companyId ||
                  !permitTypeId
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Draft
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

      </div>
    </DashboardShell>
  )
}

function hasAnyValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) =>
      hasAnyValue(v)
    )
  }
  return true
}

function toLocalInput(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CollapsibleSection({
  id,
  title,
  description,
  icon: Icon,
  isOpen,
  onToggle,
  isComplete,
  children,
}: {
  id: string
  title: string
  description?: string
  icon: any
  isOpen: boolean
  onToggle: () => void
  isComplete?: boolean
  children: React.ReactNode
}) {
  return (
    <Card id={`${id}-section`}>
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger className="flex w-full items-center justify-between p-6 hover:bg-gray-50 dark:hover:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className={cn(
              "rounded-lg p-2",
              isComplete 
                ? "bg-green-100 dark:bg-green-900/50" 
                : "bg-blue-100 dark:bg-blue-900/50"
            )}>
              <Icon className={cn(
                "h-5 w-5",
                isComplete 
                  ? "text-green-600 dark:text-green-400" 
                  : "text-blue-600 dark:text-blue-400"
              )} />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {title}
                {isComplete && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
              </CardTitle>
              {description && (
                <CardDescription>{description}</CardDescription>
              )}
            </div>
          </div>
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </CollapsibleTrigger>
        <CollapsibleContent className="px-6 pb-6">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </Card>
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
  icon: Icon,
  children,
}: {
  label: string
  required?: boolean
  icon?: any
  children: React.ReactNode
}) {
  // A <label> wrapper gives every primary form control an accessible name via
  // implicit label association (no htmlFor/id plumbing needed at 14 call sites).
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        {Icon && <Icon className="h-4 w-4 text-gray-400" />}
        {label}
        {required && (
          <span className="text-red-500">*</span>
        )}
      </span>
      {children}
    </label>
  )
}