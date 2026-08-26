import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermitAccess } from '@/lib/permit-access'

const BUCKET = 'permit-attachments'

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; documentId: string }>
  }
) {
  const { id, documentId } = await params

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

  const documentIdNumber = Number(documentId)

  if (
    !Number.isInteger(documentIdNumber) ||
    documentIdNumber <= 0
  ) {
    return NextResponse.json(
      { error: 'Invalid document id' },
      { status: 400 }
    )
  }

  const { data: document, error: documentError } =
    await supabase
      .from('hirarc_documents')
      .select('id, permit_id, uploaded_by, storage_path')
      .eq('id', documentIdNumber)
      .eq('permit_id', Number(id))
      .single()

  if (documentError || !document) {
    return NextResponse.json(
      { error: 'HIRARC document not found' },
      { status: 404 }
    )
  }

  // Only the uploader, an administrator, or platform admin may delete.
  const profile = access.data.profile
  const isAdmin =
    profile.role === 'safety_manager' ||
    profile.role === 'platform_admin'

  if (document.uploaded_by !== user.id && !isAdmin) {
    return NextResponse.json(
      {
        error:
          'Only the uploader or an administrator can delete this document',
      },
      { status: 403 }
    )
  }

  const admin = createAdminClient()

  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .remove([document.storage_path])

  if (storageError) {
    console.error(
      'Failed to remove storage object:',
      storageError
    )

    return NextResponse.json(
      {
        error:
          'Unable to delete the file from storage. Please try again.',
      },
      { status: 500 }
    )
  }

  const { error: deleteError } = await supabase
    .from('hirarc_documents')
    .delete()
    .eq('id', document.id)
    .eq('permit_id', Number(id))

  if (deleteError) {
    console.error(
      'Failed to delete HIRARC document record:',
      deleteError
    )

    return NextResponse.json(
      {
        error:
          'File was removed, but the document record could not be deleted. Please contact support.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
  })
}
