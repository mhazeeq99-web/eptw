import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'
import { getPermitSafetyReadiness } from '@/lib/safety-readiness'

/**
 * GET /api/permits/[id]/readiness
 *
 * Returns the central safety-readiness evaluation for the permit. The permit
 * detail page renders this panel from this endpoint so the UI always matches
 * the server-side rules (the same function drives the approval API).
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

  const readiness = await getPermitSafetyReadiness(
    supabase,
    permitId
  )

  return NextResponse.json({
    ready: readiness.ready,
    items: readiness.items,
    blocking_reasons: readiness.blocking_reasons,
  })
}
