import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase E — Specialised Permit Requirements
 *
 * Shared definitions + server-side validation for the permit-type-driven
 * specialised layer. The specialised sections store ONLY permit-specific
 * job information in `permits.special_details` (JSONB); all safety controls
 * (fire watch, spark containment, attendant, rescue, electrical isolation,
 * test-before-touch...) are reused from the existing safety_controls /
 * permit-type configuration — nothing is duplicated here.
 *
 * CSE personnel responsibilities are permit-level assignments referencing
 * permit_workers (relational, in permit_cse_personnel). No global roles.
 */

export const CSE_RESPONSIBILITIES = [
  'entry_supervisor',
  'standby_attendant',
  'authorised_entrant',
] as const

export type CseResponsibility =
  (typeof CSE_RESPONSIBILITIES)[number]

export type CsePersonnelAssignment = {
  worker_id: number
  responsibility: CseResponsibility
}

// ---------------------------------------------------------------------------
// Field schemas per permit-type code
// ---------------------------------------------------------------------------

export const HOT_WORK_TYPES = [
  'Welding',
  'Cutting',
  'Grinding',
  'Brazing / Soldering',
  'Other',
] as const

export const WAH_ACCESS_METHODS = [
  'Scaffold',
  'Ladder',
  'MEWP / Elevated Work Platform',
  'Fixed Platform',
  'Other',
] as const

export const ELEC_WORK_TYPES = [
  'Installation',
  'Maintenance',
  'Testing',
  'Troubleshooting',
  'Repair',
  'Other',
] as const

export type SpecialDetails = Record<string, unknown>

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : null

const bool = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null

const strArray = (
  value: unknown,
  allowed: readonly string[] | null = null
): string[] | null => {
  if (!Array.isArray(value)) return null
  const items = value
    .map((item) =>
      typeof item === 'string' ? item.trim() : ''
    )
    .filter((item) => item.length > 0)
  if (allowed) {
    return items.filter((item) =>
      (allowed as readonly string[]).includes(item)
    )
  }
  return items
}

/** Validates + normalizes a raw special_details payload for a permit type code. */
export function normalizeSpecialDetails(
  code: string | null,
  raw: unknown
): Record<string, unknown> {
  const details: Record<string, unknown> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return details
  }
  const input = raw as Record<string, unknown>

  switch (code) {
    case 'HOT': {
      const types = strArray(input.hot_work_type, HOT_WORK_TYPES)
      if (types) details.hot_work_type = types
      const other = str(input.hot_work_type_other)
      if (other) details.hot_work_type_other = other
      const area = str(input.hot_work_area)
      if (area) details.hot_work_area = area
      const combustibles = bool(input.combustibles_present)
      if (combustibles !== null)
        details.combustibles_present = combustibles
      const combustibleMaterials = str(
        input.combustible_materials
      )
      if (combustibleMaterials)
        details.combustible_materials = combustibleMaterials
      const openings = bool(input.nearby_openings_drains)
      if (openings !== null)
        details.nearby_openings_drains = openings
      const spark = bool(input.spark_containment_required)
      if (spark !== null)
        details.spark_containment_required = spark
      const fireWatch = bool(input.fire_watch_required)
      if (fireWatch !== null)
        details.fire_watch_required = fireWatch
      const fireWatchPerson = str(input.fire_watch_person)
      if (fireWatchPerson)
        details.fire_watch_person = fireWatchPerson
      const extinguisher = bool(
        input.fire_extinguisher_available
      )
      if (extinguisher !== null)
        details.fire_extinguisher_available = extinguisher
      const prep = strArray(input.area_preparation)
      if (prep) details.area_preparation = prep
      break
    }

    case 'CSE': {
      const name = str(input.confined_space_name)
      if (name) details.confined_space_name = name
      const ref = str(input.confined_space_id)
      if (ref) details.confined_space_id = ref
      const purpose = str(input.entry_purpose)
      if (purpose) details.entry_purpose = purpose
      const entryPoint = str(input.entry_point)
      if (entryPoint) details.entry_point = entryPoint
      const access = str(input.access_egress_method)
      if (access) details.access_egress_method = access
      const depth = str(input.entry_depth)
      if (depth) details.entry_depth = depth
      const ventilation = str(input.ventilation_method)
      if (ventilation)
        details.ventilation_method = ventilation
      const continuous = str(input.continuous_ventilation)
      if (
        continuous === 'Yes' ||
        continuous === 'No' ||
        continuous === 'Not Applicable'
      ) {
        details.continuous_ventilation = continuous
      }
      break
    }

    case 'WAH': {
      const height = str(input.work_height)
      if (height) details.work_height = height
      const location = str(input.work_location)
      if (location) details.work_location = location
      const access = strArray(
        input.access_method,
        WAH_ACCESS_METHODS
      )
      if (access) details.access_method = access
      const other = str(input.access_method_other)
      if (other) details.access_method_other = other
      const position = str(input.work_position)
      if (position) details.work_position = position
      const falling = bool(input.falling_object_risk)
      if (falling !== null)
        details.falling_object_risk = falling
      const dropped = str(input.dropped_object_controls)
      if (dropped)
        details.dropped_object_controls = dropped
      const rescue = bool(input.rescue_arrangement_required)
      if (rescue !== null)
        details.rescue_arrangement_required = rescue
      break
    }

    case 'ELEC': {
      const equipment = str(input.equipment_circuit)
      if (equipment) details.equipment_circuit = equipment
      const equipmentId = str(input.equipment_id)
      if (equipmentId) details.equipment_id = equipmentId
      const voltage = str(input.voltage)
      if (voltage) details.voltage = voltage
      const workType = strArray(input.work_type, ELEC_WORK_TYPES)
      if (workType) details.work_type = workType
      const other = str(input.work_type_other)
      if (other) details.work_type_other = other
      const isolation = bool(input.electrical_isolation_required)
      if (isolation !== null)
        details.electrical_isolation_required = isolation
      const test = str(input.test_verification_completed)
      if (
        test === 'Yes' ||
        test === 'No' ||
        test === 'Not Applicable'
      ) {
        details.test_verification_completed = test
      }
      break
    }

    default:
      // COLD (and any unknown code): no specialised fields.
      break
  }

  return details
}

/** True when the specialised details section has been meaningfully filled. */
export function isSpecialDetailsComplete(
  code: string | null,
  details: Record<string, unknown> | null | undefined
): boolean {
  if (!details) return false
  switch (code) {
    case 'HOT':
      return Array.isArray(details.hot_work_type) &&
        details.hot_work_type.length > 0
        ? true
        : typeof details.hot_work_area === 'string' &&
            details.hot_work_area.length > 0
    case 'CSE':
      return typeof details.confined_space_name === 'string' &&
        details.confined_space_name.length > 0
    case 'WAH':
      return Array.isArray(details.access_method) &&
        details.access_method.length > 0
        ? true
        : typeof details.work_height === 'string' &&
            details.work_height.length > 0
    case 'ELEC':
      return typeof details.equipment_circuit === 'string' &&
        details.equipment_circuit.length > 0
    default:
      return true // no specialised section required
  }
}

export function cseSpecialDetailsLabel(code: string | null): string | null {
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
}

/**
 * Validates CSE personnel assignments against the permit's worker list and
 * the company's (configurable) separation-of-duty policy.
 *
 * Returns { ok: true, assignments } or { ok: false, error }.
 * - every worker_id must belong to the permit
 * - no duplicate responsibility per worker (DB also enforces uniqueness)
 * - when company.cse_separation_of_duties = true: one worker cannot be both
 *   Entry Supervisor and Standby, and neither can be an Authorised Entrant.
 */
export async function validateCsePersonnel(
  supabase: SupabaseClient,
  permitId: number,
  assignments: CsePersonnelAssignment[]
): Promise<
  | { ok: true; assignments: CsePersonnelAssignment[] }
  | { ok: false; error: string }
> {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { ok: true, assignments: [] }
  }

  // De-duplicate exact (worker, responsibility) pairs.
  const seen = new Set<string>()
  const unique: CsePersonnelAssignment[] = []
  for (const assignment of assignments) {
    const workerId = Number(assignment.worker_id)
    const responsibility = assignment.responsibility
    if (!Number.isInteger(workerId) || workerId <= 0) {
      return {
        ok: false,
        error: 'Invalid worker reference in CSE assignment',
      }
    }
    if (
      !CSE_RESPONSIBILITIES.includes(
        responsibility as CseResponsibility
      )
    ) {
      return {
        ok: false,
        error: `Unknown CSE responsibility: ${String(responsibility)}`,
      }
    }
    const key = `${workerId}:${responsibility}`
    if (seen.has(key)) {
      return {
        ok: false,
        error:
          'Duplicate CSE assignment: a worker can only be assigned once per responsibility',
      }
    }
    seen.add(key)
    unique.push({ worker_id: workerId, responsibility })
  }

  // Every worker must be on the permit.
  const workerIds = unique.map((item) => item.worker_id)
  const { data: workers, error: workersError } =
    await supabase
      .from('permit_workers')
      .select('id')
      .eq('permit_id', permitId)
      .in('id', workerIds)

  if (workersError) {
    return {
      ok: false,
      error: 'Unable to validate CSE personnel',
    }
  }

  const listed = new Set((workers ?? []).map((worker) => worker.id))
  const missing = workerIds.filter((id) => !listed.has(id))

  if (missing.length > 0) {
    return {
      ok: false,
      error:
        'CSE assignment references a worker who is not listed on this permit',
    }
  }

  // Configurable company separation-of-duty policy.
  const { data: permit } = await supabase
    .from('permits')
    .select('company_id')
    .eq('id', permitId)
    .maybeSingle()

  const { data: company } = await supabase
    .from('companies')
    .select('cse_separation_of_duties')
    .eq('id', permit?.company_id ?? -1)
    .maybeSingle()

  if (company?.cse_separation_of_duties !== false) {
    const supervisorIds = unique
      .filter((item) => item.responsibility === 'entry_supervisor')
      .map((item) => item.worker_id)
    const standbyIds = unique
      .filter((item) => item.responsibility === 'standby_attendant')
      .map((item) => item.worker_id)
    const entrantIds = unique
      .filter((item) => item.responsibility === 'authorised_entrant')
      .map((item) => item.worker_id)

    const supervisorSet = new Set(supervisorIds)
    const standbySet = new Set(standbyIds)
    const entrantSet = new Set(entrantIds)

    const overlaps = new Set<number>([
      ...supervisorIds,
      ...standbyIds,
      ...entrantIds,
    ])
    const countById = new Map<number, number>()
    for (const id of overlaps) {
      let count = 0
      if (supervisorSet.has(id)) count++
      if (standbySet.has(id)) count++
      if (entrantSet.has(id)) count++
      countById.set(id, count)
    }
    const conflicting = [...countById.entries()].filter(
      ([, count]) => count > 1
    )

    if (conflicting.length > 0) {
      return {
        ok: false,
        error:
          'CSE separation of duties: a worker cannot hold multiple CSE responsibilities on the same permit (company policy)',
      }
    }
  }

  return { ok: true, assignments: unique }
}
