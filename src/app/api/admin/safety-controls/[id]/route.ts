import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminProfile } from '@/lib/admin-auth'

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

  const admin = await requireAdminProfile(
    supabase,
    user.id
  )

  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.error },
      { status: admin.status }
    )
  }

  const controlId = Number(id)

  if (!Number.isInteger(controlId) || controlId <= 0) {
    return NextResponse.json(
      { error: 'Invalid safety control id' },
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

  // safety_controls has no UPDATE RLS policy for authenticated users;
  // use the service-role client after the user-scoped authorization above
  // (same pattern as DELETE below and permit types).
  const { data: control, error: updateError } =
    await createAdminClient()
      .from('safety_controls')
      .update({ is_active: body.is_active })
      .eq('id', controlId)
      .select(`
        id,
        code,
        name,
        description,
        category,
        is_active
      `)
      .single()

  if (updateError || !control) {
    console.error('Failed to update safety control:', updateError)
    return NextResponse.json(
      {
        error:
          updateError?.message || 'Unable to update safety control',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, safety_control: control })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await requireAdminProfile(supabase, user.id)

  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.error },
      { status: admin.status }
    )
  }

  const controlId = Number(id)

  if (!Number.isInteger(controlId) || controlId <= 0) {
    return NextResponse.json(
      { error: 'Invalid safety control id' },
      { status: 400 }
    )
  }

  const { data: control, error: readError } = await supabase
    .from('safety_controls')
    .select('id, code, name, is_system')
    .eq('id', controlId)
    .maybeSingle()

  if (readError || !control) {
    return NextResponse.json(
      { error: 'Safety control not found' },
      { status: 404 }
    )
  }

  if ((control as { is_system?: boolean }).is_system) {
    return NextResponse.json(
      {
        error:
          'System safety controls cannot be deleted. Deactivate them instead.',
      },
      { status: 400 }
    )
  }

  // Do not delete a control that is referenced by permit types or permits.
  const { count: mappingCount } = await supabase
    .from('permit_type_safety_controls')
    .select('id', { count: 'exact', head: true })
    .eq('safety_control_id', controlId)

  const { count: instanceCount } = await supabase
    .from('permit_safety_controls')
    .select('id', { count: 'exact', head: true })
    .eq('safety_control_id', controlId)

  if ((mappingCount ?? 0) > 0 || (instanceCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          'This safety control is in use and cannot be deleted.',
      },
      { status: 400 }
    )
  }

  // safety_controls has no DELETE RLS policy for admins; use service role
  // after the user-scoped authorization above (same pattern as permit types).
  const { error: deleteError } = await createAdminClient()
    .from('safety_controls')
    .delete()
    .eq('id', controlId)

  if (deleteError) {
    console.error('Failed to delete safety control:', deleteError)
    return NextResponse.json(
      { error: 'Unable to delete safety control' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
