import Link from 'next/link'
import { notFound } from 'next/navigation'
import { 
  Printer, 
  Clock, 
  MapPin, 
  Building2, 
  User, 
  Users, 
  Shield, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  PauseCircle, 
  PlayCircle, 
  History, 
  Paperclip, 
  ArrowLeft,
  Calendar,
  Wrench,
  HardHat,
  ClipboardCheck,
  Activity,
  Info
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { SubmitPermitButton } from '@/components/permits/submit-permit-button'
import { ResubmitPermitButton } from '@/components/permits/resubmit-permit-button'
import { SuspendPermitButton } from '@/components/permits/suspend-permit-button'
import { VerifySafetyControlButton } from '@/components/permits/verify-safety-control-button'
import { AddSafetyControlButton } from '@/components/permits/add-safety-control-button'
import { RejectPermitButton } from '@/components/permits/reject-permit-button'
import { CancelPermitButton } from '@/components/permits/cancel-permit-button'
import { ApplicantDeclarationConfirm } from '@/components/permits/applicant-declaration-confirm'
import { LifecyclePanel } from '@/components/permits/lifecycle-panel'
import { JhaSection, type Jha, type HirarcDocument } from '@/components/permits/safety-documents/jha-section'
import { LotoSection, type LotoPoint } from '@/components/permits/safety-documents/loto-section'
import { GasTestSection, type GasTest } from '@/components/permits/safety-documents/gas-test-section'
import { AttachmentsSection, type Attachment } from '@/components/permits/attachments-section'
import { SiteVerificationSection, type SiteChecklistTemplateItem, type SiteVerificationRecord } from '@/components/permits/safety-verification/site-verification-section'
import { WorkerBriefingSection, type WorkerBriefingRecord } from '@/components/permits/safety-verification/worker-briefing-section'
import { PpeVerificationSection, type PpeVerificationItem } from '@/components/permits/safety-verification/ppe-verification-section'
import { EmergencyArrangementsSection, type EmergencyArrangementsRecord } from '@/components/permits/safety-verification/emergency-arrangements-section'
import { SafetyVerificationPanel } from '@/components/permits/safety-verification/safety-verification-panel'
import { SpecialisedPermitSection } from '@/components/permits/specialised/specialised-permit-section'
import { formatDateTimeMY } from '@/lib/dates'
import { BackButton } from '@/components/ui/back-button'
import { CollapsibleSection } from '@/components/permits/collapsible-section'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { SubmitSuccessModal } from '@/components/permits/submit-success-modal'

type PermitType = {
  id: number
  name: string
  code: string
  requires_gas_test: boolean
  requires_loto: boolean
  requires_jha: boolean
  requires_site_verification: boolean
  requires_worker_briefing: boolean
  requires_emergency_arrangements: boolean
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
}

type Contractor = {
  id: number
  company_name: string
}

type Requester = {
  id: string
  full_name: string
  employee_no: string | null
  department: string | null
  position: string | null
}

type PermitApproval = {
  id: number
  action: string
  remarks: string | null
  created_at: string
  performer: {
    full_name: string
    role: string
  } | null
}

type PermitSafetyControl = {
  id: number
  is_required: boolean
  status: string
  verified_by: string | null
  verified_at: string | null
  remarks: string | null
  safety_control: {
    id: number
    code: string
    name: string
    description: string | null
    category: string
  } | null
}

type Permit = {
  id: number
  supervisor_id: string | null
  permit_no: string
  work_title: string
  work_description: string | null
  work_location: string | null
  planned_start: string | null
  planned_end: string | null
  status: string
  initiation_mode: string | null
  workflow_stage: string | null
  submitted_by: string | null
  submitted_at: string | null
  work_verified_by: string | null
  work_verified_at: string | null
  approved_by: string | null
  approved_at: string | null
  completed_by: string | null
  completed_at: string | null
  closed_by: string | null
  closed_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  suspension_reason: string | null
  rejection_reason: string | null
  worker_name: string | null
  worker_id: string | null
  staff_reference_name: string | null
  work_method: string | null
  ppe_other: string | null
  workers: Array<{
    id: number
    full_name: string
    id_number: string | null
    nationality: string | null
    is_contractor: boolean
    induction_completed: boolean
    briefed: boolean
    acknowledged: boolean
    acknowledged_by: string | null
    acknowledged_at: string | null
  }> | null
  permit_ppe: Array<{
    ppe_item_id: number
    is_selected: boolean
    verified: boolean
    verified_by: string | null
    verified_at: string | null
    ppe_item: {
      id: number
      category: string
      name: string
    } | null
  }> | null
  recommended_controls: Array<{
    safety_control_id: number
    is_selected: boolean
    safety_control: { id: number; name: string } | null
  }> | null
  site_verification: {
    id: number
    permit_id: number
    status: string
    checklist: Array<{
      key: string
      status: string
    }>
    verified_by: string | null
    verified_at: string | null
    remarks: string | null
  } | null
  worker_briefing: {
    id: number
    permit_id: number
    status: string
    topics: Array<{
      key: string
      label: string
      covered: boolean
    }>
    briefed_by: string | null
    briefed_at: string | null
    remarks: string | null
  } | null
  emergency_arrangements: {
    id: number
    permit_id: number
    status: string
    emergency_contact: string | null
    muster_point: string | null
    emergency_procedure: string | null
    first_aid_available: boolean
    fire_response_available: boolean
    rescue_required: boolean
    rescue_available: boolean
    confirmed_by: string | null
    confirmed_at: string | null
    remarks: string | null
  } | null
  special_details: Record<string, unknown> | null
  cse_personnel: Array<{
    id: number
    worker_id: number
    responsibility: string
    worker: {
      id: number
      full_name: string
    } | null
  }> | null
  remarks: string | null
  declaration_confirmed_at: string | null
  created_at: string
  permit_type: PermitType | null
  area: Area | null
  equipment: Equipment | null
  contractor: Contractor | null
  company: {
    id: number
    name: string
  } | null
  requester: Requester | null
  approvals: PermitApproval[]
  safety_controls: PermitSafetyControl[]
  jhas: Jha[]
  loto_points: LotoPoint[]
  gas_tests: GasTest[]
  attachments: Attachment[]
  hirarc_documents: HirarcDocument[]
}

export default async function PermitDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ submitted?: string }>
}) {
  const { id } = await params
  const { submitted } = await searchParams

  const supabase = await createClient()

  // ---------------------------------------------------------
  // Current authenticated user
  // ---------------------------------------------------------

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let currentUserRole: string | null = null

  if (user) {
    const { data: currentProfile } =
      await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    currentUserRole = currentProfile?.role ?? null
  }

  // ---------------------------------------------------------
  // Get permit
  // ---------------------------------------------------------

  const { data, error } = await supabase
    .from('permits')
    .select(`
      id,
      supervisor_id,
      permit_no,
      work_title,
      work_description,
      work_location,
      planned_start,
      planned_end,
      status,
      initiation_mode,
      workflow_stage,
      submitted_by,
      submitted_at,
      work_verified_by,
      work_verified_at,
      approved_by,
      approved_at,
      completed_by,
      completed_at,
      closed_by,
      closed_at,
      cancelled_by,
      cancelled_at,
      suspension_reason,
      rejection_reason,
      worker_name,
      worker_id,
      staff_reference_name,
      work_method,
      ppe_other,
      workers:permit_workers (
        id,
        full_name,
        id_number,
        nationality,
        is_contractor,
        induction_completed,
        briefed,
        acknowledged,
        acknowledged_by,
        acknowledged_at
      ),
      permit_ppe (
        ppe_item_id,
        is_selected,
        verified,
        verified_by,
        verified_at,
        ppe_item:ppe_items (
          id,
          category,
          name
        )
      ),
      recommended_controls:permit_recommended_controls (
        safety_control_id,
        is_selected,
        safety_control:safety_controls (
          id,
          name
        )
      ),
      site_verification:permit_site_verifications (
        id,
        permit_id,
        status,
        checklist,
        verified_by,
        verified_at,
        remarks
      ),
      worker_briefing:permit_worker_briefings (
        id,
        permit_id,
        status,
        topics,
        briefed_by,
        briefed_at,
        remarks
      ),
      emergency_arrangements:permit_emergency_arrangements (
        id,
        permit_id,
        status,
        emergency_contact,
        muster_point,
        emergency_procedure,
        first_aid_available,
        fire_response_available,
        rescue_required,
        rescue_available,
        confirmed_by,
        confirmed_at,
        remarks
      ),
      special_details,
      cse_personnel:permit_cse_personnel (
        id,
        worker_id,
        responsibility,
        worker:permit_workers!permit_cse_personnel_worker_id_fkey (
          id,
          full_name
        )
      ),
      remarks,
      declaration_confirmed_at,
      created_at,

      permit_type:permit_types!permits_permit_type_id_fkey (
        id,
        name,
        code,
        requires_gas_test,
        requires_loto,
        requires_jha,
        requires_site_verification,
        requires_worker_briefing,
        requires_emergency_arrangements
      ),

      area:areas!permits_area_id_fkey (
        id,
        name,
        code
      ),

      equipment:equipment!permits_equipment_id_fkey (
        id,
        name,
        equipment_no
      ),

      contractor:contractors!permits_contractor_id_fkey (
        id,
        company_name
      ),

      requester:profiles!permits_requester_id_fkey (
        id,
        full_name,
        employee_no,
        department,
        position
      ),

      company:companies!permits_company_id_fkey (
        id,
        name
      ),

      safety_controls:permit_safety_controls (
        id,
        is_required,
        status,
        verified_by,
        verified_at,
        remarks,
        safety_control:safety_controls (
          id,
          code,
          name,
          description,
          category
        )
      ),

      approvals:permit_approvals (
        id,
        action,
        remarks,
        created_at,
        performer:profiles!permit_approvals_performed_by_fkey (
          full_name,
          role
        )
      ),

      jhas:jhas (
        id,
        title,
        description,
        hazards_controls,
        status,
        verified_by,
        verified_at,
        created_at,
        hazards:jha_hazards (
          id,
          hazard,
          hazard_category,
          consequence,
          existing_controls,
          control_types,
          likelihood,
          severity,
          risk_rating,
          additional_controls,
          residual_likelihood,
          residual_severity,
          residual_risk,
          sort_order
        ),
        creator:profiles!jhas_created_by_fkey (
          full_name
        ),
        verifier:profiles!jhas_verified_by_fkey (
          full_name
        )
      ),

      loto_points:loto_isolation_points (
        id,
        tag_number,
        description,
        isolation_point,
        lock_number,
        energy_type,
        isolation_method,
        remarks,
        status,
        verified_by,
        verified_at,
        created_at,
        creator:profiles!loto_isolation_points_created_by_fkey (
          full_name
        ),
        verifier:profiles!loto_isolation_points_verified_by_fkey (
          full_name
        )
      ),

      gas_tests:gas_tests (
        id,
        tester_id,
        tested_at,
        o2,
        lel,
        h2s,
        co,
        remarks,
        instrument,
        instrument_id,
        calibration_status,
        test_location,
        result,
        status,
        verified_by,
        verified_at,
        created_at,
        readings:gas_test_readings (
          id,
          parameter,
          reading,
          unit,
          result
        ),
        tester:profiles!gas_tests_tester_id_fkey (
          full_name
        ),
        verifier:profiles!gas_tests_verified_by_fkey (
          full_name
        )
      ),

      attachments:permit_attachments (
        id,
        permit_id,
        uploaded_by,
        filename,
        storage_path,
        content_type,
        size_bytes,
        created_at,
        uploader:profiles!permit_attachments_uploaded_by_fkey (
          full_name
        )
      ),

      hirarc_documents (
        id,
        permit_id,
        uploaded_by,
        filename,
        storage_path,
        content_type,
        size_bytes,
        created_at,
        uploader:profiles!hirarc_documents_uploaded_by_fkey (
          full_name
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Failed to load permit:', error)
    notFound()
  }

  if (!data) {
    notFound()
  }

  const permit = data as unknown as Permit

  // ---------------------------------------------------------
  // Safety-document permissions (JHA / LOTO / gas testing)
  // ---------------------------------------------------------

  const canAddSafetyDocs =
    permit.status === 'draft' ||
    permit.status === 'pending_approval'

  const canVerifySafetyDocs =
    currentUserRole === 'safety_manager' ||
    currentUserRole === 'safety_coordinator'

  const canConfirmDeclaration =
    (permit.status === 'draft' || permit.status === 'rejected') &&
    user?.id === permit.requester?.id

  const canPerformSafetyVerification =
    canAddSafetyDocs && canVerifySafetyDocs

  // ---------------------------------------------------------
  // Site-verification checklist template for this permit type
  // ---------------------------------------------------------

  let siteChecklistTemplate: SiteChecklistTemplateItem[] = []

  if (permit.permit_type?.id) {
    const { data: checklistRows } = await supabase
      .from('permit_type_site_checklist')
      .select('item_key, label, is_required, sort_order')
      .eq('permit_type_id', permit.permit_type.id)
      .order('sort_order')

    siteChecklistTemplate = (checklistRows ?? []).map(
      (row) => ({
        item_key: row.item_key,
        label: row.label,
        is_required: row.is_required,
        sort_order: row.sort_order,
      })
    )
  }

  // ---------------------------------------------------------
  // Permit-type PPE mappings
  // ---------------------------------------------------------

  let ppeVerificationItems: PpeVerificationItem[] = []

  if (permit.permit_type?.id) {
    const { data: mappings } = await supabase
      .from('permit_type_ppe')
      .select(`
        ppe_item_id,
        requirement,
        ppe_items ( id, category, name )
      `)
      .eq('permit_type_id', permit.permit_type.id)

    const selectedMap = new Map(
      (permit.permit_ppe ?? []).map((item) => [
        item.ppe_item_id,
        item,
      ])
    )

    ppeVerificationItems = (mappings ?? [])
      .map((mapping) => {
        const ppe = mapping.ppe_items as unknown as
          | { id: number; category: string; name: string }
          | null
        const selected = selectedMap.get(mapping.ppe_item_id)
        return {
          ppe_item_id: mapping.ppe_item_id,
          name: ppe?.name ?? 'PPE item',
          category: ppe?.category ?? 'Other',
          requirement: mapping.requirement as
            | 'required'
            | 'recommended',
          is_selected: selected?.is_selected === true,
          verified: selected?.verified === true,
        }
      })
      .sort((a, b) => {
        const req = (r: string) =>
          r === 'required' ? 0 : 1
        return req(a.requirement) - req(b.requirement)
      })
  }

  // ---------------------------------------------------------
  // Overview summary labels (presentation only)
  // ---------------------------------------------------------

  const validityLabel =
    permit.planned_start || permit.planned_end
      ? `${formatDate(permit.planned_start)} → ${formatDate(permit.planned_end)}`
      : null

  const completionPercentage = calculateCompletionPercentage(permit)

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumb & Quick Actions */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <BackButton href="/permits" label="Back to Permits" />
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/permits/${permit.id}/print`}
              target="_blank"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Printer className="h-4 w-4" />
              Print / PDF
            </Link>
            {renderActionButtons(permit, currentUserRole, user)}
          </div>
        </div>

        {/* Hero Section */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-white sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {permit.permit_no}
                  </h1>
                  <StatusBadge status={permit.status} />
                  <Badge variant="secondary" className="bg-white/20 text-white">
                    {permit.permit_type?.name ?? 'Permit'}
                  </Badge>
                </div>
                <p className="text-lg font-medium text-white/90">
                  {permit.work_title}
                </p>
                <div className="flex flex-wrap gap-4 text-sm text-white/80">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {validityLabel || 'No validity period set'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" />
                    {permit.company?.name}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {permit.area?.name}
                  </span>
                </div>
              </div>
              
              {/* Progress Indicator */}
              <div className="w-full lg:w-64">
                <div className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Permit Progress</span>
                    <span className="text-sm font-bold">{completionPercentage}%</span>
                  </div>
                  <Progress value={completionPercentage} className="h-2 bg-white/20" />
                  <p className="mt-2 text-xs text-white/70">
                    {getProgressMessage(permit.status)}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 border-t border-gray-200 bg-gray-50 p-4 sm:grid-cols-4 dark:border-gray-700 dark:bg-gray-800">
            <QuickStat icon={User} label="Requester" value={permit.requester?.full_name} />
            <QuickStat icon={Users} label="Workers" value={`${permit.workers?.length ?? 0}`} />
            <QuickStat icon={Shield} label="Safety Controls" value={`${permit.safety_controls?.filter(c => c.is_required).length ?? 0} required`} />
            <QuickStat icon={Activity} label="Status" value={formatStatus(permit.status)} />
          </div>
        </Card>

        {/* Main Content with Tabs */}
        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
              <span className="sm:hidden">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="safety" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Safety</span>
              <span className="sm:hidden">Safety</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
              <span className="sm:hidden">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
              <span className="sm:hidden">History</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Main Information Column */}
              <div className="space-y-6 lg:col-span-2">
                {/* Work Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      Work Information
                    </CardTitle>
                    <CardDescription>
                      Permit type, location and equipment details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <InfoItem icon={FileText} label="Work Title" value={permit.work_title} />
                      <InfoItem icon={MapPin} label="Work Location" value={permit.work_location} />
                      <InfoItem icon={HardHat} label="Permit Type" value={permit.permit_type?.name} />
                      <InfoItem icon={MapPin} label="Area" value={permit.area?.name} />
                      <InfoItem icon={Wrench} label="Equipment" value={permit.equipment ? `${permit.equipment.name}${permit.equipment.equipment_no ? ` (${permit.equipment.equipment_no})` : ''}` : null} />
                      <InfoItem icon={Building2} label="Contractor" value={permit.contractor?.company_name} />
                    </div>
                    <Separator />
                    <div>
                      <h4 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Work Description</h4>
                      <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                        {permit.work_description || '—'}
                      </p>
                    </div>
                    {permit.work_method && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Work Method / Sequence</h4>
                          <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                            {permit.work_method}
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Workers Table */}
                {permit.workers && permit.workers.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-blue-600" />
                          Workers / Authorised Personnel
                        </span>
                        <Badge variant="secondary">{permit.workers.length} workers</Badge>
                      </CardTitle>
                      <CardDescription>
                        Personnel authorised to perform the work under this permit
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px]">
                        <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                            <tr className="border-b text-left">
                              <th className="px-4 py-3 font-medium">No.</th>
                              <th className="px-4 py-3 font-medium">Name</th>
                              <th className="px-4 py-3 font-medium">ID Number</th>
                              {permit.workers.some((w) => w.is_contractor) && (
                                <th className="px-4 py-3 font-medium">Nationality</th>
                              )}
                              <th className="px-4 py-3 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {permit.workers.map((worker, index) => (
                              <tr key={worker.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                                <td className="px-4 py-3 font-medium">{worker.full_name}</td>
                                <td className="px-4 py-3">{worker.id_number ?? '—'}</td>
                                {worker.is_contractor && (
                                  <td className="px-4 py-3">{worker.nationality ?? '—'}</td>
                                )}
                                <td className="px-4 py-3">
                                  <WorkerStatusBadge worker={worker} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </ScrollArea>
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        <Info className="mr-1 inline h-3 w-3" />
                        Only workers listed and authorised under this permit may perform the work / enter the designated work area.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Specialised Permit Details */}
                <SpecialisedPermitSection
                  permitId={permit.id}
                  code={permit.permit_type?.code ?? null}
                  initialDetails={permit.special_details ?? null}
                  initialWorkers={(permit.workers ?? []).map((worker) => ({
                    id: worker.id,
                    full_name: worker.full_name,
                  }))}
                  initialPersonnel={(permit.cse_personnel ?? []).map(
                    (assignment) => ({
                      id: assignment.id,
                      worker_id: assignment.worker_id,
                      responsibility: assignment.responsibility,
                    })
                  )}
                  canEdit={canAddSafetyDocs}
                />
              </div>

              {/* Right Column - Timeline & Quick Info */}
              <div className="space-y-6">
                {/* Work Period Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      Work Period
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Planned Start</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(permit.planned_start)}</p>
                      </div>
                      <ArrowLeft className="hidden h-4 w-4 text-gray-400 rotate-180 sm:block" />
                      <div className="sm:text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Planned End</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(permit.planned_end)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Workflow Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-blue-600" />
                      Workflow Status
                    </CardTitle>
                    <CardDescription>
                      Current progress through the approval process
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WorkflowTimeline permit={permit} />
                  </CardContent>
                </Card>

                {/* Requester Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-blue-600" />
                      Requester Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <InfoItem label="Name" value={permit.requester?.full_name} />
                    <InfoItem label="Employee No." value={permit.requester?.employee_no} />
                    <InfoItem label="Department" value={permit.requester?.department} />
                    <InfoItem label="Position" value={permit.requester?.position} />
                  </CardContent>
                </Card>

                {/* Applicant Declaration */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-blue-600" />
                      Applicant Declaration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ApplicantDeclarationConfirm
                      permitId={permit.id}
                      initiallyConfirmed={Boolean(permit.declaration_confirmed_at)}
                      editable={canConfirmDeclaration}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Safety Tab */}
          <TabsContent value="safety" className="mt-6 space-y-6">
            {/* JHA / HIRARC gets full width — its hazards table is wide */}
            <JhaSection
              permitId={permit.id}
              canAdd={canAddSafetyDocs}
              canVerify={canVerifySafetyDocs}
              initialJhas={permit.jhas ?? []}
              initialHirarc={permit.hirarc_documents ?? []}
            />

            {(permit.permit_type?.requires_loto ||
              permit.permit_type?.requires_gas_test) && (
              <div className="grid gap-6 lg:grid-cols-2">
                {permit.permit_type?.requires_loto && (
                  <LotoSection
                    permitId={permit.id}
                    canAdd={canAddSafetyDocs}
                    canVerify={canVerifySafetyDocs}
                    initialPoints={permit.loto_points ?? []}
                  />
                )}

                {permit.permit_type?.requires_gas_test && (
                  <GasTestSection
                    permitId={permit.id}
                    canAdd={canAddSafetyDocs}
                    canVerify={canVerifySafetyDocs}
                    initialTests={permit.gas_tests ?? []}
                  />
                )}
              </div>
            )}

            {/* Safety Controls */}
            <section className="mt-6 rounded-xl border bg-background">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Shield className="h-5 w-5 text-blue-600" />
                    Safety Controls
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Required and selected safety controls for this permit
                  </p>
                </div>
                <AddSafetyControlButton
                  permitId={permit.id}
                  canAdd={canPerformSafetyVerification}
                />
              </div>
              <div className="p-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {permit.safety_controls?.length ? (
                    permit.safety_controls.map((control) => (
                      <Requirement
                        key={control.id}
                        label={control.safety_control?.name ?? 'Safety Control'}
                        required={control.is_required}
                        status={control.status}
                        permitId={permit.id}
                        controlId={control.id}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground col-span-full">
                      No safety controls configured for this permit.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Recommended Controls */}
            {permit.recommended_controls &&
              permit.recommended_controls.filter(
                (item) => item.is_selected && item.safety_control
              ).length > 0 && (
                <section className="mt-6 rounded-xl border bg-background">
                  <div className="flex items-center justify-between border-b px-6 py-4">
                    <div>
                      <h2 className="font-semibold">Recommended Controls</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Additional controls selected for this permit
                      </p>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex flex-wrap gap-2">
                      {permit.recommended_controls
                        .filter((item) => item.is_selected && item.safety_control)
                        .map((item) => (
                          <Badge key={item.safety_control_id} variant="secondary">
                            {item.safety_control?.name}
                          </Badge>
                        ))}
                    </div>
                  </div>
                </section>
              )}

            {/* PPE Requirements */}
            {(permit.permit_ppe && permit.permit_ppe.length > 0) || permit.ppe_other ? (
              <section className="mt-6 rounded-xl border bg-background">
                <div className="flex items-center justify-between border-b px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold">
                      <HardHat className="h-5 w-5 text-blue-600" />
                      PPE Requirements
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Personal protective equipment required for this work
                    </p>
                  </div>
                </div>
                <div className="p-6">
                  <PpeDisplay permit={permit} />
                </div>
              </section>
            ) : null}

            {/* Site Verification */}
            {permit.permit_type?.requires_site_verification !== false && (
              <SiteVerificationSection
                permitId={permit.id}
                canEdit={canPerformSafetyVerification}
                template={siteChecklistTemplate}
                initialRecord={permit.site_verification as SiteVerificationRecord | null}
              />
            )}

            {/* PPE Verification */}
            <PpeVerificationSection
              permitId={permit.id}
              canEdit={canPerformSafetyVerification}
              initialItems={ppeVerificationItems}
            />

            {/* Emergency Arrangements */}
            {permit.permit_type?.requires_emergency_arrangements && (
              <EmergencyArrangementsSection
                permitId={permit.id}
                canEdit={canPerformSafetyVerification}
                initialRecord={permit.emergency_arrangements as EmergencyArrangementsRecord | null}
              />
            )}

            {/* Worker Briefing */}
            {(permit.workers && permit.workers.length > 0) || permit.permit_type?.requires_worker_briefing ? (
              <WorkerBriefingSection
                permitId={permit.id}
                canEdit={canPerformSafetyVerification}
                requiresLoto={permit.permit_type?.requires_loto ?? false}
                requiresGas={permit.permit_type?.requires_gas_test ?? false}
                initialRecord={permit.worker_briefing as WorkerBriefingRecord | null}
                initialWorkers={(permit.workers ?? []).map((worker) => ({
                  id: worker.id,
                  full_name: worker.full_name,
                  briefed: worker.briefed,
                  acknowledged: worker.acknowledged,
                }))}
              />
            ) : null}

            {/* Safety Verification Readiness — final section before lifecycle */}
            {permit.status === 'pending_approval' || permit.status === 'draft' ? (
              <section className="mt-6 rounded-xl border bg-background">
                <div className="flex items-center justify-between border-b px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold">
                      <Shield className="h-5 w-5 text-blue-600" />
                      Safety Verification Readiness
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Complete all safety verification requirements before approval
                    </p>
                  </div>
                </div>
                <div className="p-6">
                  <SafetyVerificationPanel
                    permitId={permit.id}
                    permitNo={permit.permit_no}
                    canApprove={
                      permit.status === 'pending_approval' &&
                      permit.workflow_stage === 'safety_approval' &&
                      (currentUserRole === 'safety_coordinator' || currentUserRole === 'safety_manager')
                    }
                  />
                </div>
              </section>
            ) : null}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-6 space-y-6">
            <AttachmentsSection
              permitId={permit.id}
              canUpload={permit.status !== 'closed' && permit.status !== 'cancelled'}
              canDelete={currentUserRole === 'safety_manager' || currentUserRole === 'platform_admin'}
              initialAttachments={permit.attachments ?? []}
            />
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-blue-600" />
                  Permit History
                </CardTitle>
                <CardDescription>
                  Chronological record of actions taken on this permit
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {permit.approvals?.length ? (
                      [...permit.approvals]
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((approval, index) => (
                          <TimelineItem
                            key={approval.id}
                            approval={approval}
                            isLast={index === permit.approvals.length - 1}
                          />
                        ))
                    ) : (
                      <p className="text-center text-sm text-muted-foreground py-8">
                        No approval history available.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Lifecycle Panel */}
        <CollapsibleSection title="Permit Lifecycle">
          <LifecyclePanel
            permitId={permit.id}
            status={permit.status}
            permitNo={permit.permit_no}
            canAct={currentUserRole === 'safety_manager' || currentUserRole === 'safety_coordinator'}
          />
        </CollapsibleSection>

        {/* Remarks Section */}
        {permit.remarks && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                Remarks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {permit.remarks}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {submitted === '1' && permit && (
        <SubmitSuccessModal
          permitId={permit.id}
          permitNo={permit.permit_no}
          status={permit.status}
          submittedByName={permit.requester?.full_name ?? 'You'}
        />
      )}
    </DashboardShell>
  )
}

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */

function renderActionButtons(permit: Permit, currentUserRole: string | null, user: any) {
  const buttons = []

  if (permit.status === 'draft' && permit.initiation_mode === 'internal') {
    buttons.push(
      <SubmitPermitButton key="submit" permitId={permit.id} permitNo={permit.permit_no} />
    )
  }

  if (permit.status === 'draft' && permit.initiation_mode === 'contractor_direct') {
    buttons.push(
      <SubmitPermitButton key="submit" permitId={permit.id} permitNo={permit.permit_no} />
    )
  }

  if (permit.status === 'draft' && user?.id === permit.requester?.id) {
    buttons.push(
      <Link
        key="edit"
        href={`/permits/new?edit=${permit.id}`}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        Edit Permit
      </Link>
    )
  }

  if (permit.status === 'rejected' && user?.id === permit.requester?.id) {
    buttons.push(
      <Link
        key="revise"
        href={`/permits/new?edit=${permit.id}`}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        Revise Permit
      </Link>,
      <ResubmitPermitButton key="resubmit" permitId={permit.id} permitNo={permit.permit_no} />
    )
  }

  if (permit.status === 'pending_approval' && permit.workflow_stage === 'safety_approval' && 
      (currentUserRole === 'safety_coordinator' || currentUserRole === 'safety_manager')) {
    buttons.push(
      <RejectPermitButton key="reject" permitId={permit.id} permitNo={permit.permit_no} />
    )
  }

  if (permit.status === 'active' && (currentUserRole === 'safety_manager' || currentUserRole === 'safety_coordinator')) {
    buttons.push(
      <SuspendPermitButton key="suspend" permitId={permit.id} permitNo={permit.permit_no} />
    )
  }

  if (['draft', 'pending_approval', 'rejected', 'approved', 'issued', 'suspended'].includes(permit.status) &&
      (user?.id === permit.requester?.id || currentUserRole === 'safety_manager' || currentUserRole === 'safety_coordinator')) {
    buttons.push(
      <CancelPermitButton key="cancel" permitId={permit.id} permitNo={permit.permit_no} />
    )
  }

  return buttons
}

function calculateCompletionPercentage(permit: Permit): number {
  const steps = [
    !!permit.work_title,
    !!permit.work_description,
    !!permit.work_location,
    !!permit.planned_start,
    !!permit.planned_end,
    permit.safety_controls?.some(c => c.is_required && c.status === 'verified'),
    permit.permit_type?.requires_jha ? permit.jhas?.some(j => j.status === 'verified') : true,
    permit.permit_type?.requires_loto ? permit.loto_points?.some(l => l.status === 'verified') : true,
    permit.permit_type?.requires_gas_test ? permit.gas_tests?.some(g => g.status === 'verified') : true,
    !!permit.declaration_confirmed_at,
  ]

  const completed = steps.filter(Boolean).length
  return Math.round((completed / steps.length) * 100)
}

function getProgressMessage(status: string): string {
  const messages: Record<string, string> = {
    draft: 'Permit is being drafted',
    pending_approval: 'Awaiting approval',
    approved: 'Permit has been approved',
    issued: 'Permit has been issued',
    active: 'Work is in progress',
    suspended: 'Work has been suspended',
    completed: 'Work completed',
    closed: 'Permit closed',
    cancelled: 'Permit cancelled',
    rejected: 'Permit rejected',
  }
  return messages[status] || 'Status unknown'
}

/* =========================================================
   ENHANCED COMPONENTS
   ========================================================= */

function QuickStat({ icon: Icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
        <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{value || '—'}</p>
      </div>
    </div>
  )
}

function WorkflowTimeline({ permit }: { permit: Permit }) {
  const steps = [
    { label: 'Created', date: permit.created_at, icon: FileText, completed: true },
    { label: 'Submitted', date: permit.submitted_at, icon: CheckCircle2, completed: !!permit.submitted_at },
    { label: 'Work Verified', date: permit.work_verified_at, icon: Shield, completed: !!permit.work_verified_at },
    { label: 'Approved', date: permit.approved_at, icon: CheckCircle2, completed: !!permit.approved_at },
    { label: 'Active', date: permit.status === 'active' ? permit.approved_at : null, icon: Activity, completed: ['active', 'completed', 'closed'].includes(permit.status) },
    { label: 'Completed', date: permit.completed_at, icon: CheckCircle2, completed: !!permit.completed_at },
  ]

  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
              step.completed 
                ? "border-green-500 bg-green-50 dark:bg-green-900/50" 
                : "border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800"
            )}>
              <step.icon className={cn(
                "h-4 w-4",
                step.completed ? "text-green-500" : "text-gray-400"
              )} />
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "w-0.5 flex-1 min-h-[2rem]",
                step.completed ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
              )} />
            )}
          </div>
          <div className="flex-1 pb-4">
            <p className={cn(
              "text-sm font-medium",
              step.completed ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
            )}>
              {step.label}
            </p>
            {step.date && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(step.date)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function TimelineItem({ approval, isLast }: { approval: PermitApproval; isLast: boolean }) {
  const actionIcons: Record<string, any> = {
    submitted: CheckCircle2,
    verified: Shield,
    approved: CheckCircle2,
    rejected: XCircle,
    suspended: PauseCircle,
    resumed: PlayCircle,
    completed: CheckCircle2,
    closed: CheckCircle2,
    cancelled: XCircle,
  }

  const actionColors: Record<string, string> = {
    submitted: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/50',
    verified: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/50',
    approved: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/50',
    rejected: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/50',
    suspended: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/50',
    resumed: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/50',
    completed: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/50',
    closed: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/50',
    cancelled: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/50',
  }

  const Icon = actionIcons[approval.action] || AlertTriangle
  const colorClass = actionColors[approval.action] || 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/50'

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", colorClass)}>
          <Icon className="h-5 w-5" />
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700" />}
      </div>
      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {formatAction(approval.action)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {approval.performer ? `${approval.performer.full_name} · ${formatAction(approval.performer.role)}` : 'Unknown user'}
            </p>
          </div>
          <time className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(approval.created_at)}
          </time>
        </div>
        {approval.remarks && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {approval.remarks}
          </div>
        )}
      </div>
    </div>
  )
}

function PpeDisplay({ permit }: { permit: Permit }) {
  const categories: string[] = []
  const selectedPpe = (permit.permit_ppe ?? [])
    .filter((item) => item.is_selected)
    .filter((item) => item.ppe_item)

  for (const item of selectedPpe) {
    const category = item.ppe_item?.category ?? 'Other'
    if (!categories.includes(category)) {
      categories.push(category)
    }
  }

  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <div key={category}>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
            {category}
          </h4>
          <div className="flex flex-wrap gap-2">
            {selectedPpe
              .filter((item) => (item.ppe_item?.category ?? 'Other') === category)
              .map((item) => (
                <Badge key={item.ppe_item_id} variant="secondary">
                  {item.ppe_item?.name}
                </Badge>
              ))}
          </div>
        </div>
      ))}
      {permit.ppe_other && (
        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
            Other
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">{permit.ppe_other}</p>
        </div>
      )}
    </div>
  )
}

function Requirement({ label, required, status, permitId, controlId }: {
  label: string
  required: boolean
  status?: string
  permitId?: number
  controlId?: number
}) {
  const isPending = status === 'pending'
  const isVerified = status === 'verified'

  return (
    <div className={cn(
      "rounded-lg border p-4 transition-colors",
      isVerified && "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20",
      isPending && "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
          <p className={cn(
            "mt-1 text-sm",
            required ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
          )}>
            {required ? 'Required' : 'Not required'}
          </p>
        </div>
        {status && (
          <Badge variant={isVerified ? "success" : isPending ? "warning" : "secondary"}>
            {status.replaceAll('_', ' ')}
          </Badge>
        )}
      </div>
      {isPending && permitId && controlId && (
        <div className="mt-3">
          <VerifySafetyControlButton permitId={permitId} controlId={controlId} />
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { variant: string; label: string }> = {
    draft: { variant: 'secondary', label: 'Draft' },
    pending_approval: { variant: 'warning', label: 'Pending Approval' },
    approved: { variant: 'info', label: 'Approved' },
    issued: { variant: 'info', label: 'Issued' },
    active: { variant: 'success', label: 'Active' },
    suspended: { variant: 'warning', label: 'Suspended' },
    completed: { variant: 'success', label: 'Completed' },
    closed: { variant: 'secondary', label: 'Closed' },
    cancelled: { variant: 'destructive', label: 'Cancelled' },
    rejected: { variant: 'destructive', label: 'Rejected' },
  }

  const config = statusConfig[status] || statusConfig.draft

  return (
    <Badge variant={config.variant as any}>
      {config.label}
    </Badge>
  )
}

function WorkerStatusBadge({ worker }: { worker: { briefed: boolean; acknowledged: boolean } }) {
  if (worker.acknowledged) {
    return <Badge variant="success">Acknowledged</Badge>
  }
  if (worker.briefed) {
    return <Badge variant="info">Briefed</Badge>
  }
  return <Badge variant="secondary">Not Briefed</Badge>
}

function InfoItem({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: any }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="mt-0.5 rounded-lg bg-gray-100 p-1.5 dark:bg-gray-800">
          <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        </div>
      )}
      <div className="flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-gray-900 dark:text-gray-100">
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

function formatDate(value?: string | null) {
  return formatDateTimeMY(value ?? null)
}

function formatAction(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}