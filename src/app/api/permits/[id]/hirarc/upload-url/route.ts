import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermitAccess } from '@/lib/permit-access'
import { canUploadAttachment } from '@/lib/entitlements'

const BUCKET = 'permit-attachments'

/**
 * Prepares an upload of an existing HIRARC document. Mirrors the attachment
 * upload flow: storage entitlement is enforced server-side before a signed
 * upload URL is issued. Files land in the shared 'permit-attachments' bucket
 * so the existing storage RLS / entitlement checks apply unchanged.
 */
export async function POST(
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

  const blockedStatuses = ['closed', 'cancelled']

  if (blockedStatuses.includes(access.data.permit.status)) {
    return NextResponse.json(
      {
        error:
          `HIRARC documents cannot be uploaded while the permit status is ${access.data.permit.status}`,
      },
      { status: 400 }
    )
  }

  let body: {
    filename?: string
    content_type?: string | null
    size_bytes?: number
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const filename =
    typeof body.filename === 'string'
      ? body.filename.trim()
      : ''

  if (!filename) {
    return NextResponse.json(
      { error: 'Filename is required' },
      { status: 400 }
    )
  }

  const sizeBytes = Number(body.size_bytes)

  if (
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0 ||
    !Number.isInteger(sizeBytes)
  ) {
    return NextResponse.json(
      { error: 'A valid file size (size_bytes) is required' },
      { status: 400 }
    )
  }

  if (access.data.permit.company_id == null) {
    return NextResponse.json(
      { error: 'Permit has no company; storage limit cannot be resolved' },
      { status: 400 }
    )
  }

  const storageCheck = await canUploadAttachment(
    createAdminClient(),
    access.data.permit.company_id,
    sizeBytes
  )

  if (!storageCheck.ok) {
    return NextResponse.json(
      {
        error: storageCheck.error,
        usage: storageCheck.usage,
        limit: storageCheck.limit,
        plan: storageCheck.planCode,
      },
      { status: 403 }
    )
  }

  const safeName = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120)

  const storagePath =
    `${access.data.permit.id}/${crypto.randomUUID()}-${safeName}`

  const admin = createAdminClient()

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    console.error(
      'Failed to create signed HIRARC upload URL:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Unable to prepare upload. Please try again.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    upload_url: data.signedUrl,
    token: data.token,
    storage_path: storagePath,
  })
}
