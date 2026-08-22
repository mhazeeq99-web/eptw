import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

  const { data: control, error: updateError } =
    await supabase
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
