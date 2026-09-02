'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, Lock, Paperclip, Trash2 } from 'lucide-react'

export type Attachment = {
  id: number
  permit_id: number
  uploaded_by: string
  filename: string
  storage_path: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
  uploader: {
    full_name: string
  } | null
}

export function AttachmentsSection({
  permitId,
  canUpload,
  canDelete,
  attachmentsEnabled,
  isCompanyOnFreePlan,
  isCompanyAdmin,
  isContractor,
  initialAttachments,
  embedded,
  onAttachmentsChange,
}: {
  permitId: number
  canUpload: boolean
  canDelete: boolean
  /** Whether the PTW-owning company's plan allows attachments (Free = false). */
  attachmentsEnabled?: boolean
  isCompanyOnFreePlan?: boolean
  isCompanyAdmin?: boolean
  isContractor?: boolean
  initialAttachments: Attachment[]
  embedded?: boolean
  onAttachmentsChange?: (count: number) => void
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [attachments, setAttachments] =
    useState<Attachment[]>(initialAttachments)

  useEffect(() => {
    onAttachmentsChange?.(attachments.length)
  }, [attachments, onAttachmentsChange])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const uploadBlockedByPlan =
    !attachmentsEnabled && canUpload

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file) return

    if (!attachmentsEnabled) {
      setError(
        isContractor
          ? 'Attachments are available on Pro. This company is currently using the Free plan. Contact the company\u2019s Safety Manager to upgrade.'
          : 'Attachments are available on Pro. This company is currently using the Free plan.'
      )
      return
    }

    setError('')
    setUploading(true)

    try {
      // 1. Request a signed upload URL from the server.
      const urlResponse = await fetch(
        `/api/permits/${permitId}/attachments/upload-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type || null,
            size_bytes: file.size,
          }),
        }
      )

      const urlResult = await urlResponse.json()

      if (!urlResponse.ok) {
        throw new Error(
          urlResult.error ?? 'Unable to prepare upload'
        )
      }

      // 2. Upload the file bytes to the signed URL.
      const uploadResponse = await fetch(
        urlResult.upload_url,
        {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        }
      )

      if (!uploadResponse.ok) {
        throw new Error('Upload to storage failed')
      }

      // 3. Record the attachment metadata.
      const recordResponse = await fetch(
        `/api/permits/${permitId}/attachments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            permit_id: permitId,
            filename: file.name,
            storage_path: urlResult.storage_path,
            content_type: file.type || null,
            size_bytes: file.size,
          }),
        }
      )

      const recordResult = await recordResponse.json()

      if (!recordResponse.ok) {
        throw new Error(
          recordResult.error ?? 'Unable to record attachment'
        )
      }

      setAttachments((current) => [
        recordResult.attachment,
        ...current,
      ])
      router.refresh()
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Unable to upload attachment'
      )
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function handleDownload(attachment: Attachment) {
    setError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/attachments/${attachment.id}/download`
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.error ?? 'Unable to download attachment'
        )
      }

      window.open(result.download_url, '_blank')
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Unable to download attachment'
      )
    }
  }

  async function handleDelete(attachment: Attachment) {
    setError('')

    const confirmed = window.confirm(
      `Delete attachment "${attachment.filename}"?`
    )

    if (!confirmed) return

    try {
      const response = await fetch(
        `/api/permits/${permitId}/attachments/${attachment.id}`,
        {
          method: 'DELETE',
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.error ?? 'Unable to delete attachment'
        )
      }

      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id)
      )
      router.refresh()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete attachment'
      )
    }
  }

  return (
    <section className={embedded ? '' : 'mt-6 rounded-xl border bg-background'}>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Attachments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Documents, photos and supporting files.
          </p>
        </div>

        {canUpload && !attachmentsEnabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground dark:border-gray-700">
            <Lock className="h-3.5 w-3.5" />
            Attachments on Pro
          </span>
        ) : (
          canUpload && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          )
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>

      {error && (
        <div className="border-b px-6 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {uploadBlockedByPlan && (
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Attachments available on Pro
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isContractor
                    ? 'Upload photos, documents and supporting evidence with your permits. This company is currently on the Free plan — contact the company\u2019s Safety Manager to upgrade.'
                    : 'Upload photos, documents and supporting evidence with your permits. This company is currently on the Free plan.'}
                </p>
              </div>
            </div>

            {!isContractor && isCompanyAdmin && (
              <Link
                href="/pricing"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="divide-y">
        {attachments.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No attachments have been uploaded for this permit.
          </p>
        ) : (
          attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Paperclip className="h-5 w-5 shrink-0 text-muted-foreground" />

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {attachment.filename}
                  </p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Uploaded by{' '}
                    {attachment.uploader?.full_name ?? 'Unknown'}
                    {' · '}
                    {formatDate(attachment.created_at)}
                    {attachment.size_bytes
                      ? ` · ${formatBytes(attachment.size_bytes)}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(attachment)}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
