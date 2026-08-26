'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Per-row Disable/Enable action for the platform user directory.
 *
 * Calls PATCH /api/admin/users/{id} (server-side platform_admin check; the
 * route toggles is_active off the current DB state) and refreshes the
 * server-rendered page so the status column reflects the change.
 */
export function UserStatusButton({
  userId,
  isActive,
}: {
  userId: string
  isActive: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    setBusy(true)
    setError('')

    try {
      const response = await fetch(
        `/api/admin/users/${userId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Failed to update user status'
        )
      }

      router.refresh()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update user status'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? 'Updating...'
          : isActive
            ? 'Disable'
            : 'Enable'}
      </button>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
