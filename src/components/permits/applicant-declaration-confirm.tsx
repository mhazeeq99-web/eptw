'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Interactive Applicant Declaration confirmation.
 *
 * Lets the requester confirm (or revoke) the applicant declaration for a
 * permit. The server-side submission gate requires declaration_confirmed_at
 * before any permit may be submitted/resubmitted, so this is the UI control
 * that satisfies that gate on the detail/edit views.
 *
 * @param permitId        The permit to update.
 * @param initiallyConfirmed Whether the permit is currently declared.
 * @param editable         Whether the current user may confirm the declaration.
 */
export function ApplicantDeclarationConfirm({
  permitId,
  initiallyConfirmed,
  editable,
}: {
  permitId: number
  initiallyConfirmed: boolean
  editable: boolean
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(initiallyConfirmed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleChange(next: boolean) {
    setSaving(true)
    setError('')
    setChecked(next)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/update`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            declaration_confirmed_at: next
              ? new Date().toISOString()
              : null,
            declaration_confirmed_by: next ? undefined : null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Unable to save the declaration. Please try again.'
        )
        setChecked(initiallyConfirmed)
        return
      }

      router.refresh()
    } catch {
      setError(
        'Unable to save the declaration. Please try again.'
      )
      setChecked(initiallyConfirmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="flex items-start gap-3 rounded-md border px-4 py-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={!editable || saving}
          onChange={(event) =>
            handleChange(event.target.checked)
          }
          className="mt-0.5 h-4 w-4 rounded border"
        />
        <span>
          I confirm that the information provided in this permit
          application is accurate and that I am authorised to apply for
          this permit.{' '}
          {editable && <span className="text-destructive">*</span>}
        </span>
      </label>

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}

      {!editable && !initiallyConfirmed && (
        <p className="mt-2 text-sm text-muted-foreground">
          Only the requester can confirm the applicant declaration.
        </p>
      )}
    </div>
  )
}
