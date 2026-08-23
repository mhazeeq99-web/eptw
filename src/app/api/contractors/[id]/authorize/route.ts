import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select('id, role, company_id, is_active')
      .eq('id', user.id)
      .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  if (!profile.is_active) {
    return NextResponse.json(
      { error: 'Your account is inactive' },
      { status: 403 }
    )
  }

  if (
    profile.role !== 'safety_manager' &&
    profile.role !== 'platform_admin'
  ) {
    return NextResponse.json(
      {
        error:
          'Only company administrators can manage contractor authorization',
      },
      { status: 403 }
    )
  }

  const contractorId = Number(id)

  if (!Number.isInteger(contractorId) || contractorId <= 0) {
    return NextResponse.json(
      { error: 'Invalid contractor id' },
      { status: 400 }
    )
  }

  let body: {
    is_active?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json(
      { error: 'is_active must be a boolean' },
      { status: 400 }
    )
  }

  // The RPC resolves the caller's company from the profile and creates /
  // updates the contractor_companies link (SECURITY DEFINER).
  const { data: result, error: rpcError } =
    await supabase.rpc(
      'set_contractor_authorization',
      {
        p_contractor_id: contractorId,
        p_is_active: body.is_active,
      }
    )

  if (rpcError) {
    console.error(
      'Failed to update contractor authorization:',
      rpcError
    )

    return NextResponse.json(
      {
        error:
          rpcError?.message ||
          'Unable to update contractor authorization',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    authorization: result,
  })
}
