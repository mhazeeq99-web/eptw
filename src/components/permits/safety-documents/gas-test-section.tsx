'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VerifySafetyDocButton } from './verify-button'

export type GasTest = {
  id: number
  tester_id: string
  tested_at: string
  o2: number | null
  lel: number | null
  h2s: number | null
  co: number | null
  remarks: string | null
  status: string
  verified_by: string | null
  verified_at: string | null
  created_at: string
  tester: {
    full_name: string
  } | null
  verifier: {
    full_name: string
  } | null
}

export function GasTestSection({
  permitId,
  canAdd,
  canVerify,
  initialTests,
}: {
  permitId: number
  canAdd: boolean
  canVerify: boolean
  initialTests: GasTest[]
}) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [testedAt, setTestedAt] = useState('')
  const [o2, setO2] = useState('')
  const [lel, setLel] = useState('')
  const [h2s, setH2s] = useState('')
  const [co, setCo] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setError('')

    if (!o2.trim() && !lel.trim() && !h2s.trim() && !co.trim()) {
      setError('Record at least one gas reading.')
      return
    }

    setSaving(true)

    const toNumberOrNull = (value: string) => {
      if (!value.trim()) return null
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }

    try {
      const response = await fetch(
        `/api/permits/${permitId}/gas-tests`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tested_at: testedAt || null,
            o2: toNumberOrNull(o2),
            lel: toNumberOrNull(lel),
            h2s: toNumberOrNull(h2s),
            co: toNumberOrNull(co),
            remarks: remarks.trim() || null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to record gas test.'
        )
        return
      }

      setTestedAt('')
      setO2('')
      setLel('')
      setH2s('')
      setCo('')
      setRemarks('')
      setShowForm(false)
      router.refresh()
    } catch {
      setError('Unable to record gas test.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Gas Testing</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Atmospheric gas test results for this permit.
          </p>
        </div>

        {canAdd && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Record Test
          </button>
        )}
      </div>

      {showForm && (
        <div className="grid gap-4 border-b p-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <label className="text-sm font-medium">
              Tested At
            </label>
            <input
              type="datetime-local"
              value={testedAt}
              onChange={(event) =>
                setTestedAt(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <ReadingField
            label="O₂ (%)"
            value={o2}
            onChange={setO2}
          />
          <ReadingField
            label="LEL (%)"
            value={lel}
            onChange={setLel}
          />
          <ReadingField
            label="H₂S (ppm)"
            value={h2s}
            onChange={setH2s}
          />
          <ReadingField
            label="CO (ppm)"
            value={co}
            onChange={setCo}
          />

          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <label className="text-sm font-medium">
              Remarks
            </label>
            <textarea
              value={remarks}
              onChange={(event) =>
                setRemarks(event.target.value)
              }
              rows={2}
              placeholder="Any notes about the test..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive sm:col-span-2 lg:col-span-3">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
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
              {saving ? 'Saving...' : 'Save Test'}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y">
        {initialTests.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No gas tests have been recorded for this permit.
          </p>
        ) : (
          initialTests.map((test) => (
            <div key={test.id} className="p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">
                    Test at {formatDate(test.tested_at)}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Tester:{' '}
                    {test.tester?.full_name ?? 'Unknown'}
                  </p>
                </div>

                <StatusBadge status={test.status} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Reading label="O₂" value={test.o2} unit="%" />
                <Reading label="LEL" value={test.lel} unit="%" />
                <Reading label="H₂S" value={test.h2s} unit="ppm" />
                <Reading label="CO" value={test.co} unit="ppm" />
              </div>

              {test.remarks && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {test.remarks}
                </p>
              )}

              {test.status === 'verified' &&
                test.verifier && (
                  <p className="mt-3 text-xs font-medium text-green-600">
                    ✓ Verified by{' '}
                    {test.verifier.full_name} ·{' '}
                    {formatDate(test.verified_at)}
                  </p>
                )}

              {canVerify && test.status === 'pending' && (
                <div className="mt-4">
                  <VerifySafetyDocButton
                    permitId={permitId}
                    kind="gas-test"
                    docId={test.id}
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

function ReadingField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </div>
  )
}

function Reading({
  label,
  value,
  unit,
}: {
  label: string
  value: number | null
  unit: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">
        {value === null ? '—' : `${value} ${unit}`}
      </p>
    </div>
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
