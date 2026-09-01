'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

/**
 * Delete button for a draft permit in the permits list. Shows a confirm
 * before deleting; only rendered for drafts (the caller decides). Deletes via
 * DELETE /api/permits/[id] then refreshes the list.
 */
export function DeleteDraftButton({
  permitId,
  permitNo,
}: {
  permitId: number
  permitNo: string
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete draft ${permitNo}? This cannot be undone.`
    )
    if (!confirmed) return

    setDeleting(true)
    setError('')
    try {
      const response = await fetch(`/api/permits/${permitId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const result = await response.json()
        setError(result.error || 'Unable to delete draft')
        return
      }
      router.refresh()
    } catch {
      setError('Unable to delete draft')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        title={`Delete draft ${permitNo}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {deleting ? 'Deleting...' : 'Delete'}
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
