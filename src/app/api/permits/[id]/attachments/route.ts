import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'

export async function GET(
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
    id
  )

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  const permitId = Number(id)

  const { data: attachments, error } = await supabase
    .from('permit_attachments')
    .select(`
      id,
      permit_id,
      uploaded_by,
      filename,
      storage_path,
      content_type,
      size_bytes,
      created_at,
      uploader:profiles!permit_attachments_uploaded_by_fkey (
        full_name
      )
    `)
    .eq('permit_id', permitId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(
      'Failed to load attachments:',
      error
    )

    return NextResponse.json(
      { error: 'Failed to load attachments' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    attachments: attachments ?? [],
  })
}

export async function POST(request: Request) {
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

  let body: {
    permit_id?: number
    filename?: string
    storage_path?: string
    content_type?: string | null
    size_bytes?: number | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const permitId = Number(body.permit_id)

  if (!Number.isInteger(permitId) || permitId <= 0) {
    return NextResponse.json(
      { error: 'A valid permit id is required' },
      { status: 400 }
    )
  }

  const access = await requirePermitAccess(
    supabase,
    user,
    permitId
  )

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  // Attachments may be recorded while the permit is being prepared,
  // active, or suspended — but not after it is closed/cancelled.
  const blockedStatuses = ['closed', 'cancelled']

  if (blockedStatuses.includes(access.data.permit.status)) {
    return NextResponse.json(
      {
        error:
          `Attachments cannot be added while the permit status is ${access.data.permit.status}`,
      },
      { status: 400 }
    )
  }

  const filename =
    typeof body.filename === 'string'
      ? body.filename.trim()
      : ''

  const storagePath =
    typeof body.storage_path === 'string'
      ? body.storage_path.trim()
      : ''

  if (!filename || !storagePath) {
    return NextResponse.json(
      { error: 'Filename and storage path are required' },
      { status: 400 }
    )
  }

  const { data: attachment, error: insertError } =
    await supabase
      .from('permit_attachments')
      .insert({
        permit_id: permitId,
        uploaded_by: user.id,
        filename,
        storage_path: storagePath,
        content_type:
          typeof body.content_type === 'string' &&
          body.content_type
            ? body.content_type
            : null,
        size_bytes:
          typeof body.size_bytes === 'number' &&
          Number.isFinite(body.size_bytes)
            ? body.size_bytes
            : null,
      })
      .select(`
        id,
        permit_id,
        uploaded_by,
        filename,
        storage_path,
        content_type,
        size_bytes,
        created_at
      `)
      .single()

  if (insertError) {
    console.error(
      'Failed to record attachment:',
      insertError
    )

    return NextResponse.json(
      {
        error:
          insertError?.message ||
          'Unable to record attachment',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      attachment,
    },
    { status: 201 }
  )
}
