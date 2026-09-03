import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase F — Final Operational Hardening: central permit validity + lifecycle
 * logic. This is the SINGLE source of truth for validity calculations used
 * by the dashboard, permit detail, active/suspended/history pages, reports
 * and the lifecycle APIs. UI components must not re-implement these rules.
 */

export type PermitValidityState =
  | 'none'
  | 'active'
  | 'expiring_soon'
  | 'expired'

export type PermitValidity = {
  state: PermitValidityState
  valid_from: string | null
  valid_until: string | null
  /** Minutes remaining until expiry (positive when still valid). */
  minutes_remaining: number | null
}

export type PermitValidityInput = {
  status: string
  valid_from: string | null
  valid_until: string | null
  planned_start: string | null
  planned_end: string | null
}

/**
 * Central validity calculation.
 *
 * - Only ACTIVE permits have a validity state.
 * - The authoritative window is valid_until (set at approval); when it is
 *   missing it falls back to planned_end so legacy rows still evaluate.
 * - EXPIRING SOON uses the configured warning window (default 120 minutes,
 *   a system/company configuration — not a legal mandate).
 * - EXPIRED is a DERIVED state: the underlying permit status is unchanged
 *   and the permit is never auto-closed or deleted.
 */
export function getPermitValidity(
  permit: PermitValidityInput | null | undefined,
  warningMinutes = 120
): PermitValidity {
  if (!permit || permit.status !== 'active') {
    return {
      state: 'none',
      valid_from: permit?.valid_from ?? null,
      valid_until: permit?.valid_until ?? null,
      minutes_remaining: null,
    }
  }

  const validUntil = permit.valid_until ?? permit.planned_end
  const validFrom = permit.valid_from ?? permit.planned_start

  if (!validUntil) {
    return {
      state: 'none',
      valid_from: validFrom,
      valid_until: null,
      minutes_remaining: null,
    }
  }

  const until = new Date(validUntil).getTime()
  const now = Date.now()

  if (until <= now) {
    return {
      state: 'expired',
      valid_from: validFrom,
      valid_until: validUntil,
      minutes_remaining: Math.max(0, Math.floor((until - now) / 60000)),
    }
  }

  const remainingMs = until - now
  const remainingMinutes = Math.floor(remainingMs / 60000)

  if (remainingMs <= warningMinutes * 60 * 1000) {
    return {
      state: 'expiring_soon',
      valid_from: validFrom,
      valid_until: validUntil,
      minutes_remaining: remainingMinutes,
    }
  }

  return {
    state: 'active',
    valid_from: validFrom,
    valid_until: validUntil,
    minutes_remaining: remainingMinutes,
  }
}

/**
 * Computes the authoritative validity window at approval/issue time.
 *
 * valid_from = actual start (the moment the permit is approved/issued).
 * valid_until = min(planned_end, valid_from + max_validity_hours) when
 * max_validity_hours is configured; otherwise planned_end. When neither
 * planned_end nor max_validity_hours exist, valid_until is null (no cap).
 */
export function computeValidityWindow(
  actualStart: Date,
  plannedEnd: string | null,
  maxValidityHours: number | null
): { valid_from: string; valid_until: string | null } {
  const validFrom = actualStart.toISOString()

  let validUntil: string | null = null

  if (maxValidityHours !== null && maxValidityHours > 0) {
    const capped = new Date(
      actualStart.getTime() + maxValidityHours * 60 * 60 * 1000
    )
    validUntil = capped.toISOString()

    if (plannedEnd) {
      const planned = new Date(plannedEnd).getTime()
      const cappedMs = capped.getTime()
      if (planned < cappedMs) {
        validUntil = new Date(planned).toISOString()
      }
    }
  } else if (plannedEnd) {
    validUntil = plannedEnd
  }

  return { valid_from: validFrom, valid_until: validUntil }
}

/**
 * Resume / revalidation checklist items, built from the permit type
 * configuration. Only APPLICABLE requirements appear; every item can be
 * completed or marked not applicable by the authorised safety role.
 */
export const RESUME_CHECKLIST_DEFS: Array<{
  key: string
  label: string
  applicableIf?: (type: PermitTypeConfig, workerCount: number) => boolean
  /**
   * When true, this item represents a genuine current safety condition that
   * must be re-confirmed (completed) on resume — it can never be arbitrarily
   * marked "not applicable".
   */
  intrinsicallyApplicable?: boolean
}> = [
  {
    key: 'work_conditions',
    label: 'Work conditions remain unchanged',
    applicableIf: () => true,
    intrinsicallyApplicable: true,
  },
  {
    key: 'workers',
    label: 'Workers remain the same',
    applicableIf: (_type, workerCount) => workerCount > 0,
    intrinsicallyApplicable: true,
  },
  {
    key: 'jha',
    label: 'JHA remains valid',
    applicableIf: (type) => type.requires_jha === true,
    intrinsicallyApplicable: true,
  },
  {
    key: 'safety_controls',
    label: 'Safety controls remain effective',
    applicableIf: (type) => type.requires_jha === true, // controls always sync for configured types
    intrinsicallyApplicable: true,
  },
  {
    key: 'ppe',
    label: 'PPE remains available',
    applicableIf: () => true, // required PPE rechecked on resume
    intrinsicallyApplicable: true,
  },
  {
    key: 'loto',
    label: 'LOTO remains valid',
    applicableIf: (type) => type.requires_loto === true,
    intrinsicallyApplicable: true,
  },
  {
    key: 'gas_testing',
    label: 'Gas test remains acceptable',
    applicableIf: (type) => type.requires_gas_test === true,
    intrinsicallyApplicable: true,
  },
  {
    key: 'site',
    label: 'Site remains safe',
    applicableIf: (type) => type.requires_site_verification !== false,
    intrinsicallyApplicable: true,
  },
  {
    key: 'briefing',
    label: 'Worker briefing remains valid',
    applicableIf: (_type, workerCount) => workerCount > 0,
    intrinsicallyApplicable: true,
  },
  {
    key: 'emergency',
    label: 'Emergency arrangements remain valid',
    applicableIf: (type) =>
      type.requires_emergency_arrangements === true,
    intrinsicallyApplicable: false,
  },
]

/** Keys of resume-checklist items that can never be marked "not applicable". */
export const INTRINSICALLY_APPLICABLE_KEYS = new Set(
  RESUME_CHECKLIST_DEFS.filter((def) => def.intrinsicallyApplicable).map(
    (def) => def.key
  )
)

export type PermitTypeConfig = {
  code: string | null
  requires_jha: boolean
  requires_loto: boolean
  requires_gas_test: boolean
  requires_site_verification: boolean
  requires_worker_briefing: boolean
  requires_emergency_arrangements: boolean
}

export function buildResumeChecklist(
  type: PermitTypeConfig | null,
  workerCount: number
): Array<{ item_key: string; label: string; status: string }> {
  return RESUME_CHECKLIST_DEFS.filter((def) =>
    def.applicableIf
      ? def.applicableIf(
          type ?? {
            code: null,
            requires_jha: false,
            requires_loto: false,
            requires_gas_test: false,
            requires_site_verification: false,
            requires_worker_briefing: false,
            requires_emergency_arrangements: false,
          },
          workerCount
        )
      : true
  ).map((def) => ({
    item_key: def.key,
    label: def.label,
    status: 'applicable',
  }))
}

/**
 * Completion checklist (work has actually ended). Only the core "work
 * completed" item is universally required; the rest are company-configurable
 * (is_required can be adjusted per row).
 */
export const COMPLETION_CHECKLIST_DEFS: Array<{
  key: string
  label: string
  is_required: boolean
}> = [
  { key: 'work_completed', label: 'Work completed', is_required: true },
  { key: 'tools_removed', label: 'Tools removed', is_required: false },
  { key: 'equipment_removed', label: 'Equipment removed', is_required: false },
  {
    key: 'temporary_materials_removed',
    label: 'Temporary materials removed',
    is_required: false,
  },
  { key: 'waste_removed', label: 'Waste removed', is_required: false },
  { key: 'area_cleaned', label: 'Work area cleaned', is_required: false },
  {
    key: 'barricades_removed',
    label: 'Barricades / signage removed where appropriate',
    is_required: false,
  },
  {
    key: 'guards_restored',
    label: 'Guards / covers restored where applicable',
    is_required: false,
  },
  {
    key: 'equipment_safe',
    label: 'Equipment returned to safe condition',
    is_required: false,
  },
  { key: 'area_handed_back', label: 'Area handed back', is_required: false },
]

/**
 * Closure checklist (final administrative confirmation). All items are
 * confirmed by the authorised user performing closure.
 */
export const CLOSURE_CHECKLIST_DEFS: Array<{
  key: string
  label: string
}> = [
  { key: 'work_completed', label: 'Work completed' },
  { key: 'area_restored', label: 'Area restored' },
  { key: 'tools_equipment_removed', label: 'Tools / equipment removed' },
  { key: 'temporary_controls_removed', label: 'Temporary controls removed' },
  { key: 'permit_conditions_completed', label: 'Permit conditions completed' },
  { key: 'outstanding_issues_reviewed', label: 'Outstanding issues reviewed' },
]

/** Ensures checklist rows exist for a permit (idempotent). */
export async function ensureResumeChecklist(
  supabase: SupabaseClient,
  permitId: number,
  type: PermitTypeConfig | null,
  workerCount: number
): Promise<void> {
  const { data: existing } = await supabase
    .from('permit_resume_checklists')
    .select('item_key')
    .eq('permit_id', permitId)

  const keys = new Set((existing ?? []).map((row) => row.item_key))
  const missing = buildResumeChecklist(type, workerCount).filter(
    (item) => !keys.has(item.item_key)
  )

  if (missing.length > 0) {
    await supabase.from('permit_resume_checklists').insert(
      missing.map((item) => ({
        permit_id: permitId,
        item_key: item.item_key,
        label: item.label,
        status: item.status,
      }))
    )
  }
}

/** Ensures completion checklist rows exist (idempotent). */
export async function ensureCompletionChecklist(
  supabase: SupabaseClient,
  permitId: number
): Promise<void> {
  const { data: existing } = await supabase
    .from('permit_completion_checklists')
    .select('item_key')
    .eq('permit_id', permitId)

  const keys = new Set((existing ?? []).map((row) => row.item_key))
  const missing = COMPLETION_CHECKLIST_DEFS.filter(
    (item) => !keys.has(item.key)
  )

  if (missing.length > 0) {
    await supabase.from('permit_completion_checklists').insert(
      missing.map((item) => ({
        permit_id: permitId,
        item_key: item.key,
        label: item.label,
        is_required: item.is_required,
        completed: false,
      }))
    )
  }
}

/** Ensures closure checklist rows exist (idempotent). */
export async function ensureClosureChecklist(
  supabase: SupabaseClient,
  permitId: number
): Promise<void> {
  const { data: existing } = await supabase
    .from('permit_closure_checklists')
    .select('item_key')
    .eq('permit_id', permitId)

  const keys = new Set((existing ?? []).map((row) => row.item_key))
  const missing = CLOSURE_CHECKLIST_DEFS.filter(
    (item) => !keys.has(item.key)
  )

  if (missing.length > 0) {
    await supabase.from('permit_closure_checklists').insert(
      missing.map((item) => ({
        permit_id: permitId,
        item_key: item.key,
        label: item.label,
        completed: false,
      }))
    )
  }
}
