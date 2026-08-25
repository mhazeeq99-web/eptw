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
  instrument: string | null
  instrument_id: string | null
  calibration_status: string | null
  test_location: string | null
  result: 'PASS' | 'CONDITIONAL' | 'FAIL' | null
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
  readings: Array<{
    id: number
    parameter: string
    reading: number | null
    unit: string | null
    result: 'PASS' | 'CONDITIONAL' | 'FAIL' | null
  }> | null
}

type ReadingDraft = {
  parameter: string
  reading: string
  unit: string
  result: 'PASS' | 'CONDITIONAL' | 'FAIL' | ''
}

const DEFAULT_READINGS: ReadingDraft[] = [
  { parameter: 'O₂', reading: '', unit: '%', result: 'PASS' },
  { parameter: 'LEL', reading: '', unit: '%LEL', result: 'PASS' },
  { parameter: 'H₂S', reading: '', unit: 'ppm', result: 'PASS' },
  { parameter: 'CO', reading: '', unit: 'ppm', result: 'PASS' },
]

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
  const [instrument, setInstrument] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [calibrationStatus, setCalibrationStatus] = useState('')
  const [testLocation, setTestLocation] = useState('')
  const [result, setResult] = useState<
    'PASS' | 'CONDITIONAL' | 'FAIL' | ''
  >('PASS')
  const [readings, setReadings] = useState<ReadingDraft[]>(
    DEFAULT_READINGS
  )
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateReading(
    index: number,
    patch: Partial<ReadingDraft>
  ) {
    setReadings((current) =>
      current.map((reading, i) =>
        i === index ? { ...reading, ...patch } : reading
      )
    )
  }

  function addReading() {
    setReadings((current) => [
      ...current,
      { parameter: 'Other', reading: '', unit: '', result: '' },
    ])
  }

  function removeReading(index: number) {
    setReadings((current) =>
      current.filter((_, i) => i !== index)
    )
  }

  async function handleCreate() {
    setError('')

    const filledReadings = readings.filter(
      (reading) =>
        reading.parameter.trim() &&
        reading.reading.trim() !== ''
    )

    if (filledReadings.length === 0) {
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
            instrument: instrument.trim() || null,
            instrument_id: instrumentId.trim() || null,
            calibration_status: calibrationStatus || null,
            test_location: testLocation.trim() || null,
            result: result || null,
            readings: filledReadings.map((reading) => ({
              parameter: reading.parameter.trim(),
              reading: toNumberOrNull(reading.reading),
              unit: reading.unit.trim() || null,
              result: reading.result || null,
            })),
            remarks: remarks.trim() || null,
          }),
        }
      )

      const res = await response.json()

      if (!response.ok) {
        setError(
          res.error || 'Unable to record gas test.'
        )
        return
      }

      setTestedAt('')
      setInstrument('')
      setInstrumentId('')
      setCalibrationStatus('')
      setTestLocation('')
      setResult('PASS')
      setReadings(DEFAULT_READINGS)
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
              Test Date / Time
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Instrument</label>
            <input
              type="text"
              value={instrument}
              onChange={(event) => setInstrument(event.target.value)}
              placeholder="e.g. Gas Detector GD-001"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Instrument ID / Serial
            </label>
            <input
              type="text"
              value={instrumentId}
              onChange={(event) => setInstrumentId(event.target.value)}
              placeholder="e.g. GD-001"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Calibration / Validity
            </label>
            <select
              value={calibrationStatus}
              onChange={(event) =>
                setCalibrationStatus(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select status</option>
              <option value="Valid">Valid</option>
              <option value="Expired">Expired</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Test Location</label>
            <input
              type="text"
              value={testLocation}
              onChange={(event) => setTestLocation(event.target.value)}
              placeholder="e.g. Manhole MH-3 entry point"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Result</label>
            <select
              value={result}
              onChange={(event) =>
                setResult(
                  event.target.value as
                    | 'PASS'
                    | 'CONDITIONAL'
                    | 'FAIL'
                    | ''
                )
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="PASS">PASS</option>
              <option value="CONDITIONAL">CONDITIONAL</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <label className="text-sm font-medium">
              Parameter Readings
            </label>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Parameter</th>
                    <th className="px-3 py-2 font-medium">Reading</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {readings.map((reading, index) => (
                    <tr key={index} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={reading.parameter}
                          onChange={(event) =>
                            updateReading(index, {
                              parameter: event.target.value,
                            })
                          }
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="any"
                          value={reading.reading}
                          onChange={(event) =>
                            updateReading(index, {
                              reading: event.target.value,
                            })
                          }
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={reading.unit}
                          onChange={(event) =>
                            updateReading(index, {
                              unit: event.target.value,
                            })
                          }
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={reading.result}
                          onChange={(event) =>
                            updateReading(index, {
                              result: event.target.value as
                                | 'PASS'
                                | 'CONDITIONAL'
                                | 'FAIL'
                                | '',
                            })
                          }
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        >
                          <option value="">—</option>
                          <option value="PASS">PASS</option>
                          <option value="CONDITIONAL">
                            CONDITIONAL
                          </option>
                          <option value="FAIL">FAIL</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeReading(index)}
                          aria-label="Remove parameter"
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addReading}
              className="mt-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              + Add Parameter
            </button>
          </div>

          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <label className="text-sm font-medium">Remarks</label>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
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

              {(test.instrument ||
                test.instrument_id ||
                test.calibration_status ||
                test.test_location) && (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                  {test.instrument && (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Instrument
                      </dt>
                      <dd className="text-sm font-medium">
                        {test.instrument}
                      </dd>
                    </div>
                  )}
                  {test.instrument_id && (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Instrument ID
                      </dt>
                      <dd className="text-sm font-medium">
                        {test.instrument_id}
                      </dd>
                    </div>
                  )}
                  {test.calibration_status && (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Calibration
                      </dt>
                      <dd className="text-sm font-medium">
                        {test.calibration_status}
                      </dd>
                    </div>
                  )}
                  {test.test_location && (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Test location
                      </dt>
                      <dd className="text-sm font-medium">
                        {test.test_location}
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {test.readings && test.readings.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {test.readings.map((reading) => (
                    <Reading
                      key={reading.id}
                      label={reading.parameter}
                      value={reading.reading}
                      unit={reading.unit ?? ''}
                      result={reading.result}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Reading label="O₂" value={test.o2} unit="%" />
                  <Reading label="LEL" value={test.lel} unit="%" />
                  <Reading label="H₂S" value={test.h2s} unit="ppm" />
                  <Reading label="CO" value={test.co} unit="ppm" />
                </div>
              )}

              {test.result && (
                <p className="mt-3 text-sm">
                  <span className="font-medium">Result: </span>
                  <span
                    className={
                      test.result === 'FAIL'
                        ? 'font-medium text-red-600'
                        : test.result === 'CONDITIONAL'
                          ? 'font-medium text-yellow-600'
                          : 'font-medium text-green-600'
                    }
                  >
                    {test.result}
                  </span>
                </p>
              )}

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

function Reading({
  label,
  value,
  unit,
  result,
}: {
  label: string
  value: number | null
  unit: string
  result?: 'PASS' | 'CONDITIONAL' | 'FAIL' | null
}) {
  const valueClass =
    result === 'FAIL'
      ? 'text-red-600'
      : result === 'CONDITIONAL'
        ? 'text-yellow-600'
        : ''

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-sm font-medium ${valueClass}`}>
        {value === null ? '—' : `${value} ${unit}`}
      </p>
      {result && (
        <p className={`mt-0.5 text-xs font-medium uppercase ${valueClass}`}>
          {result}
        </p>
      )}
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
