import type { SupabaseClient } from '@supabase/supabase-js'

export type ReadinessStatus =
  | 'complete'
  | 'incomplete'
  | 'not_required'

export type ReadinessItem = {
  key: string
  label: string
  required: boolean
  status: ReadinessStatus
  reason: string | null
  /** Lower = checked first when surfacing blocking reasons (legacy order). */
  priority: number
}

export type SafetyReadiness = {
  ready: boolean
  items: ReadinessItem[]
  /** Blocking messages only, in legacy priority order. */
  blocking_reasons: string[]
}

/**
 * Central safety-readiness evaluation used by BOTH the approval API and the
 * permit detail page. This is the single source of truth for the Phase D
 * readiness panel — UI components must not re-implement these rules.
 *
 * Existing Phase B/C gates are preserved verbatim (required safety controls,
 * required PPE selection, JHA, LOTO, gas testing) and extended with:
 *   - Site / work-area verification (per permit-type checklist)
 *   - Worker briefing + acknowledgement (reuses permit_workers)
 *   - Required-PPE availability/verification
 *   - Emergency arrangements (where the permit type requires them)
 *
 * RLS: run with the caller's Supabase client so company isolation applies.
 */
export async function getPermitSafetyReadiness(
  supabase: SupabaseClient,
  permitId: number
): Promise<SafetyReadiness> {
  const items: ReadinessItem[] = []

  // ---------------------------------------------------------
  // 1. Permit + permit type configuration
  // ---------------------------------------------------------
  const { data: permit } = await supabase
    .from('permits')
    .select(`
      id,
      company_id,
      contractor_id,
      requester_id,
      permit_type_id,
      work_title,
      status,
      workflow_stage,
      special_details,
      special_verified_at,
      permit_type:permit_types (
        id,
        code,
        requires_jha,
        requires_loto,
        requires_gas_test,
        requires_site_verification,
        requires_worker_briefing,
        requires_emergency_arrangements
      )
    `)
    .eq('id', permitId)
    .maybeSingle()

  const type = permit?.permit_type as
    | {
        id: number
        code: string | null
        requires_jha: boolean
        requires_loto: boolean
        requires_gas_test: boolean
        requires_site_verification: boolean
        requires_worker_briefing: boolean
        requires_emergency_arrangements: boolean
      }
    | null
    | undefined

  const push = (
    key: string,
    label: string,
    required: boolean,
    status: ReadinessStatus,
    reason: string | null,
    priority: number
  ) => {
    items.push({ key, label, required, status, reason, priority })
  }

  // ---------------------------------------------------------
  // Permit information
  // ---------------------------------------------------------
  push(
    'permit_info',
    'Permit Information',
    true,
    permit && permit.work_title?.trim() ? 'complete' : 'incomplete',
    permit && permit.work_title?.trim()
      ? null
      : 'Permit information is incomplete.',
    0
  )

  // ---------------------------------------------------------
  // Workers (contractor list is mandatory at creation)
  // ---------------------------------------------------------
  const { data: workers } = await supabase
    .from('permit_workers')
    .select('id, full_name, briefed, acknowledged')
    .eq('permit_id', permitId)
    .order('id')

  const workerCount = workers?.length ?? 0
  const workersRequired =
    permit?.contractor_id != null || workerCount > 0
  push(
    'workers',
    'Workers',
    workersRequired,
    workerCount > 0
      ? 'complete'
      : workersRequired
        ? 'incomplete'
        : 'not_required',
    workerCount > 0
      ? `${workerCount} worker${workerCount === 1 ? '' : 's'}`
      : workersRequired
        ? 'Worker list is required for contractor permits.'
        : 'No workers listed (internal permit).',
    0
  )

  // ---------------------------------------------------------
  // JHA / HIRARC — satisfied by EITHER a verified manual JHA OR an uploaded
  // HIRARC document. The requirement is never forced through both methods.
  // ---------------------------------------------------------
  const jhaRequired = type?.requires_jha === true
  let jhaStatus: ReadinessStatus = 'not_required'
  let jhaReason: string | null = null
  if (jhaRequired) {
    const { data: verifiedJha } = await supabase
      .from('jhas')
      .select('id')
      .eq('permit_id', permitId)
      .eq('status', 'verified')
      .maybeSingle()

    const { data: hirarcDoc } = await supabase
      .from('hirarc_documents')
      .select('id')
      .eq('permit_id', permitId)
      .limit(1)
      .maybeSingle()

    const satisfied =
      verifiedJha != null || hirarcDoc != null

    jhaStatus = satisfied ? 'complete' : 'incomplete'
    jhaReason = satisfied
      ? null
      : 'Approval blocked: JHA/HIRARC has not been completed (fill a JHA or upload an existing HIRARC).'
  }
  push('jha', 'JHA / HIRARC', jhaRequired, jhaStatus, jhaReason, 20)

  // ---------------------------------------------------------
  // PPE — required items must be selected AND verified
  // ---------------------------------------------------------
  let ppeStatus: ReadinessStatus = 'not_required'
  let ppeReason: string | null = null
  let ppeHasRequired = false
  if (type) {
    const { data: requiredMappings } = await supabase
      .from('permit_type_ppe')
      .select(`
        ppe_item_id,
        ppe_items ( name )
      `)
      .eq('permit_type_id', type.id)
      .eq('requirement', 'required')

    if (requiredMappings && requiredMappings.length > 0) {
      ppeHasRequired = true
      const { data: selectedPpe } = await supabase
        .from('permit_ppe')
        .select('ppe_item_id, is_selected, verified')
        .eq('permit_id', permitId)

      const selected = new Map<number, { verified: boolean }>()
      for (const row of selectedPpe ?? []) {
        if (row.is_selected) {
          selected.set(row.ppe_item_id, {
            verified: row.verified === true,
          })
        }
      }

      const missing: string[] = []
      const unverified: string[] = []
      for (const mapping of requiredMappings) {
        const name = (
          mapping.ppe_items as unknown as
            | { name: string }
            | null
        )?.name
        const label = name ?? 'PPE item'
        const state = selected.get(mapping.ppe_item_id)
        if (!state) {
          missing.push(label)
        } else if (!state.verified) {
          unverified.push(label)
        }
      }

      if (missing.length > 0) {
        ppeStatus = 'incomplete'
        ppeReason = `Approval blocked: Required PPE '${missing.join(', ')}' has not been selected.`
      } else if (unverified.length > 0) {
        ppeStatus = 'incomplete'
        ppeReason =
          'Approval blocked: Required PPE was not verified as available.'
      } else {
        ppeStatus = 'complete'
      }
    }
  }
  push('ppe', 'PPE', ppeHasRequired, ppeStatus, ppeReason, 50)

  // ---------------------------------------------------------
  // Safety controls (required only). If the safety manager has not marked any
  // controls as required for this permit type, the gate is NOT enforced —
  // approval is not blocked for an absent required-controls configuration.
  // When required controls exist, every one of them must be verified.
  // ---------------------------------------------------------
  const { data: requiredControls } = await supabase
    .from('permit_safety_controls')
    .select('id, is_required, status')
    .eq('permit_id', permitId)
    .eq('is_required', true)

  const hasRequiredControls =
    (requiredControls ?? []).length > 0
  const controlsRequired = hasRequiredControls
  const incompleteControls = (requiredControls ?? []).filter(
    (control) => control.status !== 'verified'
  )

  let controlsStatus: ReadinessStatus
  let controlsReason: string | null

  if (!hasRequiredControls) {
    controlsStatus = 'not_required'
    controlsReason = null
  } else if (incompleteControls.length > 0) {
    controlsStatus = 'incomplete'
    controlsReason =
      'Permit cannot be approved because required safety controls are not verified.'
  } else {
    controlsStatus = 'complete'
    controlsReason = null
  }

  push(
    'safety_controls',
    'Safety Controls',
    controlsRequired,
    controlsStatus,
    controlsReason,
    10
  )

  // ---------------------------------------------------------
  // LOTO — every isolation point must be verified
  // ---------------------------------------------------------
  const lotoRequired = type?.requires_loto === true
  let lotoStatus: ReadinessStatus = 'not_required'
  let lotoReason: string | null = null
  if (lotoRequired) {
    const { data: lotoPoints } = await supabase
      .from('loto_isolation_points')
      .select('id, status')
      .eq('permit_id', permitId)

    const points = lotoPoints ?? []
    if (points.length === 0) {
      lotoStatus = 'incomplete'
      lotoReason =
        'Approval blocked: this permit type requires LOTO isolation points.'
    } else {
      const unverified = points.filter(
        (point) => point.status !== 'verified'
      )
      lotoStatus =
        unverified.length === 0 ? 'complete' : 'incomplete'
      lotoReason =
        unverified.length === 0
          ? null
          : `Approval blocked: ${unverified.length} LOTO isolation point(s) have not been verified.`
    }
  }
  push('loto', 'LOTO', lotoRequired, lotoStatus, lotoReason, 30)

  // ---------------------------------------------------------
  // Gas testing — latest verified test must not be FAIL
  // ---------------------------------------------------------
  const gasRequired = type?.requires_gas_test === true
  let gasStatus: ReadinessStatus = 'not_required'
  let gasReason: string | null = null
  if (gasRequired) {
    const { data: verifiedTests } = await supabase
      .from('gas_tests')
      .select('id, result, tested_at')
      .eq('permit_id', permitId)
      .eq('status', 'verified')
      .order('tested_at', { ascending: false })

    const tests = verifiedTests ?? []
    if (tests.length === 0) {
      gasStatus = 'incomplete'
      gasReason =
        'Approval blocked: gas testing has not been verified.'
    } else if (tests[0].result === 'FAIL') {
      gasStatus = 'incomplete'
      gasReason =
        'Approval blocked: gas test result is not acceptable.'
    } else {
      gasStatus = 'complete'
    }
  }
  push('gas_testing', 'Gas Testing', gasRequired, gasStatus, gasReason, 40)

  // ---------------------------------------------------------
  // Site / work-area verification (per-type checklist)
  // ---------------------------------------------------------
  const siteRequired = type?.requires_site_verification !== false
  let siteStatus: ReadinessStatus = 'not_required'
  let siteReason: string | null = null
  if (siteRequired) {
    const { data: siteVerification } = await supabase
      .from('permit_site_verifications')
      .select('id, status, checklist, verified_by, verified_at, remarks')
      .eq('permit_id', permitId)
      .maybeSingle()

    if (!siteVerification || siteVerification.status !== 'verified') {
      siteStatus = 'incomplete'
      siteReason =
        siteVerification?.status === 'failed'
          ? 'Approval blocked: Work area verification failed.'
          : 'Approval blocked: Work area verification has not been completed.'
    } else {
      // Even when the record says verified, any required item marked
      // 'fail' means the work area is not acceptable.
      const checklist = (siteVerification.checklist ?? []) as Array<{
        key: string
        required?: boolean
        status?: string
      }>
      const failedRequired = checklist.find(
        (item) =>
          item.required === true &&
          (item.status === 'fail' || item.status === 'failed')
      )
      if (failedRequired) {
        siteStatus = 'incomplete'
        siteReason = `Approval blocked: Work area verification failed (${failedRequired.key}).`
      } else {
        siteStatus = 'complete'
      }
    }
  }
  push('site_verification', 'Site Verification', siteRequired, siteStatus, siteReason, 60)

  // ---------------------------------------------------------
  // Worker briefing + acknowledgement
  // ---------------------------------------------------------
  // Briefing is part of the safety approval gate whenever the permit lists
  // workers: the permit detail page shows the Worker Briefing section for any
  // permit with workers, so the gate must match that visibility. A permit
  // with no workers has nobody to brief and the item is not required.
  const briefingRequired = workerCount > 0
  let briefingStatus: ReadinessStatus = 'not_required'
  let briefingReason: string | null = null
  if (briefingRequired) {
    const { data: briefing } = await supabase
      .from('permit_worker_briefings')
      .select('id, status, briefed_by, briefed_at, remarks')
      .eq('permit_id', permitId)
      .maybeSingle()

    const briefed = briefing?.status === 'briefed'
    const unacknowledged = (workers ?? []).filter(
      (worker) => !worker.acknowledged
    )

    if (!briefed) {
      briefingStatus = 'incomplete'
      briefingReason =
        'Approval blocked: Worker briefing has not been completed.'
    } else if (unacknowledged.length > 0) {
      briefingStatus = 'incomplete'
      briefingReason = `Approval blocked: ${unacknowledged.length} worker(s) have not acknowledged the required briefing.`
    } else {
      briefingStatus = 'complete'
    }
  }
  push('worker_briefing', 'Worker Briefing', briefingRequired, briefingStatus, briefingReason, 70)

  // ---------------------------------------------------------
  // Emergency arrangements
  // ---------------------------------------------------------
  const emergencyRequired =
    type?.requires_emergency_arrangements === true
  let emergencyStatus: ReadinessStatus = 'not_required'
  let emergencyReason: string | null = null
  if (emergencyRequired) {
    const { data: emergency } = await supabase
      .from('permit_emergency_arrangements')
      .select(`
        id,
        status,
        first_aid_available,
        fire_response_available,
        rescue_required,
        rescue_available,
        confirmed_by,
        confirmed_at
      `)
      .eq('permit_id', permitId)
      .maybeSingle()

    const confirmed = emergency?.status === 'confirmed'
    const rescueOk =
      !emergency?.rescue_required ||
      emergency?.rescue_available === true
    const firstAidOk = emergency?.first_aid_available === true
    const fireOk = emergency?.fire_response_available === true

    emergencyStatus =
      confirmed && rescueOk && firstAidOk && fireOk
        ? 'complete'
        : 'incomplete'
    emergencyReason =
      emergencyStatus === 'complete'
        ? null
        : 'Approval blocked: Emergency arrangements have not been confirmed.'
  }
  push('emergency_arrangements', 'Emergency Arrangements', emergencyRequired, emergencyStatus, emergencyReason, 80)

  // ---------------------------------------------------------
  // Specialised permit-type layer (Phase E).
  // Only genuinely new, permit-specific requirements are evaluated here:
  //   - the specialised details section must be completed for its type
  //   - CSE personnel responsibilities must be assigned (permit-level)
  // Everything else (JHA/LOTO/gas/PPE/controls/site/briefing/emergency)
  // is already evaluated above and is NOT duplicated.
  // ---------------------------------------------------------
  const code = type?.code ?? null

  const specialisedLabel = (() => {
    switch (code) {
      case 'HOT':
        return 'Hot Work details'
      case 'CSE':
        return 'Confined Space details'
      case 'WAH':
        return 'Work at Height details'
      case 'ELEC':
        return 'Electrical Work details'
      default:
        return null
    }
  })()

  if (specialisedLabel) {
    const details = (permit as { special_details?: unknown })
      ?.special_details as Record<string, unknown> | null | undefined
    const specialVerifiedAt = (
      permit as { special_verified_at?: unknown }
    )?.special_verified_at as string | null | undefined

    const isComplete = (() => {
      if (!details || typeof details !== 'object') return false
      switch (code) {
        case 'HOT':
          return (
            (Array.isArray(details.hot_work_type) &&
              details.hot_work_type.length > 0) ||
            typeof details.hot_work_area === 'string'
          )
        case 'CSE':
          return (
            typeof details.confined_space_name === 'string' &&
            details.confined_space_name.length > 0
          )
        case 'WAH':
          return (
            (Array.isArray(details.access_method) &&
              details.access_method.length > 0) ||
            typeof details.work_height === 'string'
          )
        case 'ELEC':
          return (
            typeof details.equipment_circuit === 'string' &&
            details.equipment_circuit.length > 0
          )
        default:
          return true
      }
    })()

    // The specialised requirements must be BOTH completed AND verified by a
    // Safety Manager / Safety Coordinator before approval. Internal staff and
    // contractor admin cannot self-certify this section.
    const isVerified = isComplete && Boolean(specialVerifiedAt)

    push(
      'special_details',
      specialisedLabel,
      true,
      isVerified ? 'complete' : 'incomplete',
      isVerified
        ? null
        : isComplete
          ? `Approval blocked: ${specialisedLabel} have not been verified by a Safety Manager / Safety Coordinator.`
          : `Approval blocked: ${specialisedLabel} have not been completed.`,
      85
    )
  }

  if (code === 'CSE') {
    const { data: personnel } = await supabase
      .from('permit_cse_personnel')
      .select('id, worker_id, responsibility')
      .eq('permit_id', permitId)

    const assignments = personnel ?? []
    const supervisor = assignments.find(
      (item) => item.responsibility === 'entry_supervisor'
    )
    const standby = assignments.find(
      (item) => item.responsibility === 'standby_attendant'
    )
    const entrants = assignments.filter(
      (item) => item.responsibility === 'authorised_entrant'
    )

    push(
      'cse_entry_supervisor',
      'Entry Supervisor',
      true,
      supervisor ? 'complete' : 'incomplete',
      supervisor
        ? null
        : 'Approval blocked: Confined Space Entry Supervisor has not been assigned.',
      86
    )

    push(
      'cse_standby',
      'Standby / Attendant',
      true,
      standby ? 'complete' : 'incomplete',
      standby
        ? null
        : 'Approval blocked: Standby / Attendant has not been assigned.',
      87
    )

    push(
      'cse_entrants',
      'Authorised Entrants',
      true,
      entrants.length > 0 ? 'complete' : 'incomplete',
      entrants.length > 0
        ? null
        : 'Approval blocked: No authorised entrants have been assigned.',
      88
    )
  }

  // ---------------------------------------------------------
  // Aggregate
  // ---------------------------------------------------------
  const blocking = items.filter(
    (item) =>
      item.required &&
      item.status === 'incomplete'
  )
  blocking.sort((a, b) => a.priority - b.priority)

  return {
    ready: blocking.length === 0,
    items,
    blocking_reasons: blocking.map(
      (item) => item.reason ?? `${item.label} is incomplete.`
    ),
  }
}
