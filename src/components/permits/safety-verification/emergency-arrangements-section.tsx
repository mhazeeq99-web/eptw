'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifyPermitChanged } from '@/lib/permit-changed'

export type EmergencyArrangementsRecord = {
  id: number
  permit_id: number
  status: 'not_confirmed' | 'confirmed'
  emergency_contact: string | null
  muster_point: string | null
  emergency_procedure: string | null
  first_aid_available: boolean
  fire_response_available: boolean
  rescue_required: boolean
  rescue_available: boolean
  confirmed_by: string | null
  confirmed_at: string | null
  remarks: string | null
}

export function EmergencyArrangementsSection({
  permitId,
  canEdit,
  initialRecord,
}: {
  permitId: number
  canEdit: boolean
  initialRecord: EmergencyArrangementsRecord | null
}) {
  const router = useRouter()

  const [emergencyContact, setEmergencyContact] = useState(
    initialRecord?.emergency_contact ?? ''
  )
  const [musterPoint, setMusterPoint] = useState(
    initialRecord?.muster_point ?? ''
  )
  const [emergencyProcedure, setEmergencyProcedure] = useState(
    initialRecord?.emergency_procedure ?? ''
  )
  const [firstAid, setFirstAid] = useState(
    initialRecord?.first_aid_available ?? false
  )
  const [fireResponse, setFireResponse] = useState(
    initialRecord?.fire_response_available ?? false
  )
  const [rescueRequired, setRescueRequired] = useState(
    initialRecord?.rescue_required ?? false
  )
  const [rescueAvailable, setRescueAvailable] = useState(
    initialRecord?.rescue_available ?? false
  )
  const [remarks, setRemarks] = useState(
    initialRecord?.remarks ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const confirmed = initialRecord?.status === 'confirmed'

  async function handleConfirm() {
    setError('')

    const rescueOk = !rescueRequired || rescueAvailable

    if (!firstAid || !fireResponse || !rescueOk) {
      setError(
        'First aid and fire response must be available, and rescue must be available when required.'
      )
      return
    }

    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/emergency-arrangements`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'confirmed',
            emergency_contact:
              emergencyContact.trim() || null,
            muster_point: musterPoint.trim() || null,
            emergency_procedure:
              emergencyProcedure.trim() || null,
            first_aid_available: firstAid,
            fire_response_available: fireResponse,
            rescue_required: rescueRequired,
            rescue_available: rescueAvailable,
            remarks: remarks.trim() || null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to save emergency arrangements.'
        )
        return
      }

      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to save emergency arrangements.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Emergency Arrangements</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Minimum PTW readiness information for this work.
          </p>
        </div>

        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
            confirmed
              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
          }`}
        >
          {confirmed ? 'Confirmed' : 'Not confirmed'}
        </span>
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Emergency Contact
          </label>
          <input
            type="text"
            value={emergencyContact}
            onChange={(event) =>
              setEmergencyContact(event.target.value)
            }
            disabled={!canEdit}
            placeholder="e.g. Site Control Room 03-1234-5678"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Muster Point</label>
          <input
            type="text"
            value={musterPoint}
            onChange={(event) =>
              setMusterPoint(event.target.value)
            }
            disabled={!canEdit}
            placeholder="e.g. Assembly area A"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium">
            Emergency Procedure
          </label>
          <textarea
            value={emergencyProcedure}
            onChange={(event) =>
              setEmergencyProcedure(event.target.value)
            }
            disabled={!canEdit}
            rows={2}
            placeholder="Reference to the site emergency procedure..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={firstAid}
            disabled={!canEdit}
            onChange={(event) => setFirstAid(event.target.checked)}
          />
          First Aid available
        </label>

        <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={fireResponse}
            disabled={!canEdit}
            onChange={(event) =>
              setFireResponse(event.target.checked)
            }
          />
          Fire Response available
        </label>

        <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={rescueRequired}
            disabled={!canEdit}
            onChange={(event) => {
              setRescueRequired(event.target.checked)
              if (!event.target.checked) {
                setRescueAvailable(false)
              }
            }}
          />
          Rescue Arrangement required
        </label>

        <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={rescueAvailable}
            disabled={!canEdit || !rescueRequired}
            onChange={(event) =>
              setRescueAvailable(event.target.checked)
            }
          />
          Rescue Arrangement available
        </label>

        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium">Remarks</label>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            disabled={!canEdit}
            rows={2}
            placeholder="Any notes about emergency readiness..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        {initialRecord?.confirmed_by && (
          <p className="text-xs font-medium text-green-600 sm:col-span-2">
            ✓ Confirmed{initialRecord.confirmed_at
              ? ` at ${new Intl.DateTimeFormat('en-MY', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(initialRecord.confirmed_at))}`
              : ''}
          </p>
        )}

        {canEdit && (
          <>
            {error && (
              <p className="text-sm text-destructive sm:col-span-2">
                {error}
              </p>
            )}

            <div className="flex justify-end sm:col-span-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : confirmed
                    ? 'Re-confirm Arrangements'
                    : 'Confirm Emergency Arrangements'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
