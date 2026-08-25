import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import {
  ensureResumeChecklist,
  ensureCompletionChecklist,
  ensureClosureChecklist,
  getPermitValidity,
  type PermitTypeConfig,
} from '@/lib/permit-lifecycle'

/**
 * GET /api/permits/[id]/lifecycle
 *
 * Returns the permit's central validity state plus the Phase F lifecycle
 * checklists (resume / completion / closure) with their current status.
 * The same validity logic drives the dashboard, list pages and reports.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const access = await requirePermitAccess(
    supabase,
    user,
    id
  )

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  const permitId = Number(id)

  if (!Number.isInteger(permitId) || permitId <= 0) {
    return NextResponse.json(
      { error: 'Invalid permit id' },
      { status: 400 }
    )
  }

  const { data: permit } = await supabase
    .from('permits')
    .select(`
      id,
      status,
      permit_type_id,
      valid_from,
      valid_until,
      planned_start,
      planned_end,
      permit_type:permit_types (
        code,
        requires_jha,
        requires_loto,
        requires_gas_test,
        requires_site_verification,
        requires_worker_briefing,
        requires_emergency_arrangements,
        expiry_warning_minutes
      )
    `)
    .eq('id', permitId)
    .maybeSingle()

  const type = permit?.permit_type as
    | (PermitTypeConfig & { expiry_warning_minutes: number })
    | null
    | undefined

  const { count: workerCount } = await supabase
    .from('permit_workers')
    .select('id', { count: 'exact', head: true })
    .eq('permit_id', permitId)

  await ensureResumeChecklist(supabase, permitId, type ?? null, workerCount ?? 0)
  await ensureCompletionChecklist(supabase, permitId)
  await ensureClosureChecklist(supabase, permitId)

  const [{ data: resume }, { data: completion }, { data: closure }] =
    await Promise.all([
      supabase
        .from('permit_resume_checklists')
        .select('item_key, label, status, verified_by, verified_at, remarks')
        .eq('permit_id', permitId)
        .order('id'),
      supabase
        .from('permit_completion_checklists')
        .select('item_key, label, is_required, completed')
        .eq('permit_id', permitId)
        .order('id'),
      supabase
        .from('permit_closure_checklists')
        .select('item_key, label, completed')
        .eq('permit_id', permitId)
        .order('id'),
    ])

  const validity = getPermitValidity(
    {
      status: permit?.status ?? 'draft',
      valid_from: permit?.valid_from ?? null,
      valid_until: permit?.valid_until ?? null,
      planned_start: permit?.planned_start ?? null,
      planned_end: permit?.planned_end ?? null,
    },
    type?.expiry_warning_minutes ?? 120
  )

  return NextResponse.json({
    validity,
    resume_checklist: resume ?? [],
    completion_checklist: completion ?? [],
    closure_checklist: closure ?? [],
  })
}
