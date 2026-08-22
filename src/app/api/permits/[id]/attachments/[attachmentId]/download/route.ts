import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermitAccess } from '@/lib/permit-access'

const BUCKET = 'permit-attachments'

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; attachmentId: string }>
  }
) {
  const { id, attachmentId } = await params

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

  const attachmentIdNumber = Number(attachmentId)

  if (
    !Number.isInteger(attachmentIdNumber) ||
    attachmentIdNumber <= 0
  ) {
    return NextResponse.json(
      { error: 'Invalid attachment id' },
      { status: 400 }
    )
  }

  const { data: attachment, error: attachmentError } =
    await supabase
      .from('permit_attachments')
      .select('id, permit_id, filename, storage_path')
      .eq('id', attachmentIdNumber)
      .eq('permit_id', Number(id))
      .single()

  if (attachmentError || !attachment) {
    return NextResponse.json(
      { error: 'Attachment not found' },
      { status: 404 }
    )
  }

  const admin = createAdminClient()

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, 300) // 5 minutes

  if (error || !data) {
    console.error(
      'Failed to create download URL:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Unable to generate download link. Please try again.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    download_url: data.signedUrl,
    filename: attachment.filename,
  })
}
