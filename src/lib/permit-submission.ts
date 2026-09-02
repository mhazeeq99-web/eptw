import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Submission-level validation for permits.
 *
 * This is deliberately SEPARATE from the approval/readiness engine
 * (`getPermitSafetyReadiness`). Submission checks only what the requester /
 * contractor must supply to hand the permit to the Safety Officer; it does
 * NOT require JHA verification, site verification, worker briefing, etc.,
 * which are performed later by authorised safety verifiers.
 *
 * The approval/readiness engine remains the final authority before a permit
 * is activated.
 */

export type SubmissionError = {
  field: string
  message: string
}

/**
 * Validates the planned work period. Both dates are REQUIRED for a permit to
 * be submitted (handed to the Safety Officer). When both are present, the end
 * must be strictly after the start. The window is never silently swapped.
 */
export function validateWorkPeriod(
  plannedStart: string | null | undefined,
  plannedEnd: string | null | undefined
): SubmissionError[] {
  const errors: SubmissionError[] = []

  const start = plannedStart ? new Date(plannedStart) : null
  const end = plannedEnd ? new Date(plannedEnd) : null

  if (!start || Number.isNaN(start.getTime())) {
    errors.push({
      field: 'planned_start',
      message: 'Planned Start is required.',
    })
  }
  if (!end || Number.isNaN(end.getTime())) {
    errors.push({
      field: 'planned_end',
      message: 'Planned End is required.',
    })
  }

  const startValid = start && !Number.isNaN(start.getTime())
  const endValid = end && !Number.isNaN(end.getTime())

  if (
    startValid &&
    endValid &&
    (end as Date) <= (start as Date)
  ) {
    errors.push({
      field: 'planned_end',
      message: 'Planned End must be later than Planned Start.',
    })
  }

  return errors
}

/**
 * Validate the work title is present (a minimum for both submission and
 * a usable draft that is ready to be handed over).
 */
export function validateWorkTitle(
  workTitle: string | null | undefined
): SubmissionError[] {
  if (!workTitle?.trim()) {
    return [
      {
        field: 'work_title',
        message: 'Work Title is required.',
      },
    ]
  }
  return []
}

/**
 * Loads and validates everything the requester / contractor must supply
 * before the permit may be handed to the Safety Officer. This runs against
 * the persisted permit record so both the create-with-submit path and the
 * existing submit route share ONE source of truth.
 *
 * Approval/readiness checks (JHA verification, site verification, worker
 * briefing, safety-control verification, etc.) are deliberately NOT part of
 * submission — they are evaluated later by the approval engine.
 */
export async function validatePermitSubmission(
  supabase: SupabaseClient,
  permitId: number
): Promise<{ ok: boolean; errors: SubmissionError[] }> {
  const errors: SubmissionError[] = []

  const { data: permit, error: permitError } = await supabase
    .from('permits')
    .select(`
      id,
      company_id,
      contractor_id,
      work_title,
      planned_start,
      planned_end,
      staff_reference_name,
      initiation_mode,
      declaration_confirmed_at
    `)
    .eq('id', permitId)
    .single()

  if (permitError || !permit) {
    return {
      ok: false,
      errors: [
        {
          field: 'permit',
          message: 'Permit not found.',
        },
      ],
    }
  }

  errors.push(...validateWorkTitle(permit.work_title))
  errors.push(
    ...validateWorkPeriod(permit.planned_start, permit.planned_end)
  )

  // The Applicant Declaration must be confirmed before the permit can be
  // handed to the Safety Officer. This is authoritative and applies to every
  // submission path (new form, detail page, resubmit).
  if (!permit.declaration_confirmed_at) {
    errors.push({
      field: 'declaration',
      message:
        'You must confirm the Applicant Declaration before submitting the permit.',
    })
  }

  // Contractor permits require at least one worker (with a name + ID/NRIC)
  // and the customer staff reference before submission.
  if (permit.contractor_id != null) {
    const { data: workers } = await supabase
      .from('permit_workers')
      .select('id, full_name, id_number')
      .eq('permit_id', permitId)

    const validWorkers = (workers ?? []).filter(
      (worker) =>
        worker.full_name?.trim() &&
        worker.id_number?.trim()
    )

    if (validWorkers.length === 0) {
      errors.push({
        field: 'workers',
        message:
          'At least one worker with a name and NRIC/passport is required for contractor permits.',
      })
    }

    if (!permit.staff_reference_name?.trim()) {
      errors.push({
        field: 'staff_reference_name',
        message:
          'Customer staff reference is required for contractor permits.',
      })
    }
  }

  return { ok: errors.length === 0, errors }
}

