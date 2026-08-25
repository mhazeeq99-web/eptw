import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { VERIFY_ROLES } from '@/lib/safety-roles'

export async function PATCH(
  request: Request,
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
    id,
    { roles: VERIFY_ROLES }
  )

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  const permit = access.data.permit

  // Site verification is a safety-verification action: only Safety Manager
  // or Safety Coordinator may record it (never self-certified by the
  // requester/contractor).
  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `Site verification can only be recorded while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    status?: 'not_verified' | 'verified' | 'failed'
    checklist?: Array<{
      key: string
      status: 'ok' | 'fail' | 'na'
    }>
    remarks?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const status =
    body.status === 'verified' ||
    body.status === 'failed' ||
    body.status === 'not_verified'
      ? body.status
      : 'not_verified'

  const checklist = Array.isArray(body.checklist)
    ? body.checklist
        .map((item) => ({
          key:
            typeof item.key === 'string'
              ? item.key.trim()
              : '',
          status:
            item.status === 'ok' ||
            item.status === 'fail' ||
            item.status === 'na'
              ? item.status
              : 'na',
        }))
        .filter((item) => item.key.length > 0)
    : []

  const remarks =
    typeof body.remarks === 'string' && body.remarks.trim()
      ? body.remarks.trim()
      : null

  // Load the permit type's checklist template so the stored checklist only
  // ever contains keys the company's permit type actually defines.
  const { data: permitType } = await supabase
    .from('permit_types')
    .select('id')
    .eq('id', permit.permit_type_id ?? -1)
    .maybeSingle()

  let templateKeys: string[] = []
  if (permitType) {
    const { data: template } = await supabase
      .from('permit_type_site_checklist')
      .select('item_key')
      .eq('permit_type_id', permitType.id)
    templateKeys = (template ?? []).map((row) => row.item_key)
  }

  const validKeys = new Set(templateKeys)
  const checklistState = checklist.filter((item) =>
    validKeys.has(item.key)
  )

  // A failed required item must surface as FAILED status; verifying with a
  // failed required item is not allowed.
  const { data: templateRows } = permitType
    ? await supabase
        .from('permit_type_site_checklist')
        .select('item_key, is_required')
        .eq('permit_type_id', permitType.id)
    : { data: null }

  const requiredKeys = new Set(
    (templateRows ?? [])
      .filter((row) => row.is_required)
      .map((row) => row.item_key)
  )

  const failedRequired = checklistState.some(
    (item) => item.status === 'fail' && requiredKeys.has(item.key)
  )

  const finalStatus = failedRequired
    ? 'failed'
    : status === 'failed'
      ? 'failed'
      : status

  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('permit_site_verifications')
    .select('id')
    .eq('permit_id', permit.id)
    .maybeSingle()

  let result

  if (existing) {
    const { data, error } = await supabase
      .from('permit_site_verifications')
      .update({
        status: finalStatus,
        checklist: checklistState,
        remarks,
        verified_by:
          finalStatus === 'verified' ? user.id : null,
        verified_at:
          finalStatus === 'verified' ? now : null,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select(`
        id,
        permit_id,
        status,
        checklist,
        verified_by,
        verified_at,
        remarks,
        updated_at
      `)
      .single()

    result = { data, error }
  } else {
    const { data, error } = await supabase
      .from('permit_site_verifications')
      .insert({
        permit_id: permit.id,
        status: finalStatus,
        checklist: checklistState,
        remarks,
        verified_by:
          finalStatus === 'verified' ? user.id : null,
        verified_at:
          finalStatus === 'verified' ? now : null,
      })
      .select(`
        id,
        permit_id,
        status,
        checklist,
        verified_by,
        verified_at,
        remarks,
        updated_at
      `)
      .single()

    result = { data, error }
  }

  if (result.error || !result.data) {
    console.error(
      'Failed to save site verification:',
      result.error
    )
    return NextResponse.json(
      {
        error:
          result.error?.message ||
          'Unable to save site verification',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    site_verification: result.data,
  })
}
