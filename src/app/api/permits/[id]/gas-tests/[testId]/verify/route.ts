import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'

const VERIFY_ROLES = [
  'safety_manager',
  'safety_coordinator',
]

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; testId: string }>
  }
) {
  const { id, testId } = await params

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

  let body: {
    status?: 'verified' | 'rejected'
  } = {}

  try {
    body = await request.json()
  } catch {
    // Body is optional.
  }

  const nextStatus = body.status ?? 'verified'

  if (nextStatus !== 'verified' && nextStatus !== 'rejected') {
    return NextResponse.json(
      { error: 'Invalid gas test status' },
      { status: 400 }
    )
  }

  const testIdNumber = Number(testId)

  if (!Number.isInteger(testIdNumber) || testIdNumber <= 0) {
    return NextResponse.json(
      { error: 'Invalid gas test id' },
      { status: 400 }
    )
  }

  const { data: gasTest, error: gasTestError } =
    await supabase
      .from('gas_tests')
      .select('id, permit_id, status')
      .eq('id', testIdNumber)
      .eq('permit_id', permit.id)
      .single()

  if (gasTestError || !gasTest) {
    return NextResponse.json(
      { error: 'Gas test not found for this permit' },
      { status: 404 }
    )
  }

  if (gasTest.status !== 'pending') {
    return NextResponse.json(
      {
        error:
          `Gas test cannot be verified while its status is ${gasTest.status}`,
      },
      { status: 400 }
    )
  }

  const { data: updatedGasTest, error: updateError } =
    await supabase
      .from('gas_tests')
      .update({
        status: nextStatus,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', gasTest.id)
      .eq('permit_id', permit.id)
      .eq('status', 'pending')
      .select(`
        id,
        permit_id,
        status,
        verified_by,
        verified_at
      `)
      .single()

  if (updateError || !updatedGasTest) {
    console.error(
      'Failed to update gas test status:',
      updateError
    )

    return NextResponse.json(
      {
        error:
          updateError?.message ||
          'Unable to update gas test status',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    gas_test: updatedGasTest,
  })
}
