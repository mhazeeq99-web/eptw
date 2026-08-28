'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VerifySafetyDocButton } from './verify-button'
import { notifyPermitChanged } from '@/lib/permit-changed'

export type LotoPoint = {
  id: number
  tag_number: string | null
  description: string
  isolation_point: string | null
  lock_number: string | null
  energy_type: string | null
  isolation_method: string | null
  remarks: string | null
  status: string
  verified_by: string | null
  verified_at: string | null
  created_at: string
  creator: {
    full_name: string
  } | null
  verifier: {
    full_name: string
  } | null
}

const ENERGY_TYPES = [
  'Electrical',
  'Mechanical',
  'Hydraulic',
  'Pneumatic',
  'Chemical / Process',
  'Pressure',
  'Thermal',
  'Gravity',
  'Other',
]

const ISOLATION_METHODS = [
  'Lock',
  'Tag',
  'Valve closed',
  'Breaker isolated',
  'Disconnected',
  'Blinded / blanked',
  'Drained',
  'Depressurised',
  'Other',
]

export function LotoSection({
  permitId,
  canAdd,
  canVerify,
  initialPoints,
  embedded,
}: {
  permitId: number
  canAdd: boolean
  canVerify: boolean
  initialPoints: LotoPoint[]
  embedded?: boolean
}) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [tagNumber, setTagNumber] = useState('')
  const [isolationPoint, setIsolationPoint] = useState('')
  const [lockNumber, setLockNumber] = useState('')
  const [energyType, setEnergyType] = useState('')
  const [isolationMethod, setIsolationMethod] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setError('')

    if (!description.trim()) {
      setError('Isolation point description is required.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/loto`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description: description.trim(),
            tag_number: tagNumber.trim() || null,
            isolation_point: isolationPoint.trim() || null,
            lock_number: lockNumber.trim() || null,
            energy_type: energyType || null,
            isolation_method: isolationMethod || null,
            remarks: remarks.trim() || null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to add isolation point.'
        )
        return
      }

      setDescription('')
      setTagNumber('')
      setIsolationPoint('')
      setLockNumber('')
      setEnergyType('')
      setIsolationMethod('')
      setRemarks('')
      setShowForm(false)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to add isolation point.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={embedded ? '' : 'mt-6 rounded-xl border bg-background'}>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">LOTO — Isolation Points</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lock-out / tag-out isolation points for this permit.
          </p>
        </div>

        {canAdd && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Add Point
          </button>
        )}
      </div>

      {showForm && (
        <div className="grid gap-4 border-b p-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium">
              Isolation Point Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="e.g. Inlet valve V-101"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Tag Number
            </label>
            <input
              type="text"
              value={tagNumber}
              onChange={(event) =>
                setTagNumber(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Lock Number
            </label>
            <input
              type="text"
              value={lockNumber}
              onChange={(event) =>
                setLockNumber(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium">
              Isolation Point (location)
            </label>
            <input
              type="text"
              value={isolationPoint}
              onChange={(event) =>
                setIsolationPoint(event.target.value)
              }
              placeholder="e.g. Switchgear room, panel 3"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Energy Type
            </label>
            <select
              value={energyType}
              onChange={(event) =>
                setEnergyType(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select energy type</option>
              {ENERGY_TYPES.map((energy) => (
                <option key={energy} value={energy}>
                  {energy}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Isolation Method
            </label>
            <select
              value={isolationMethod}
              onChange={(event) =>
                setIsolationMethod(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select isolation method</option>
              {ISOLATION_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium">Remarks</label>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={2}
              placeholder="Any notes about this isolation point..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setError('')
              }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Point'}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y">
        {initialPoints.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No isolation points have been recorded for this permit.
          </p>
        ) : (
          initialPoints.map((point) => (
            <div key={point.id} className="p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">
                    {point.description}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Added by{' '}
                    {point.creator?.full_name ?? 'Unknown'}
                    {' · '}
                    {formatDate(point.created_at)}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {point.tag_number && (
                      <span className="rounded-md bg-muted px-2 py-1">
                        Tag: {point.tag_number}
                      </span>
                    )}
                    {point.lock_number && (
                      <span className="rounded-md bg-muted px-2 py-1">
                        Lock: {point.lock_number}
                      </span>
                    )}
                    {point.isolation_point && (
                      <span className="rounded-md bg-muted px-2 py-1">
                        At: {point.isolation_point}
                      </span>
                    )}
                    {point.energy_type && (
                      <span className="rounded-md bg-muted px-2 py-1">
                        Energy: {point.energy_type}
                      </span>
                    )}
                    {point.isolation_method && (
                      <span className="rounded-md bg-muted px-2 py-1">
                        Method: {point.isolation_method}
                      </span>
                    )}
                  </div>

                  {point.remarks && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {point.remarks}
                    </p>
                  )}
                </div>

                <StatusBadge status={point.status} />
              </div>

              {point.status === 'verified' &&
                point.verifier && (
                  <p className="mt-3 text-xs font-medium text-green-600">
                    ✓ Verified by{' '}
                    {point.verifier.full_name} ·{' '}
                    {formatDate(point.verified_at)}
                  </p>
                )}

              {canVerify && point.status === 'pending' && (
                <div className="mt-4">
                  <VerifySafetyDocButton
                    permitId={permitId}
                    kind="loto"
                    docId={point.id}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    verified: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
        styles[status] ?? 'bg-muted text-muted-foreground'
      }`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  )
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
