'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  MapPin, 
  Gauge, 
  Plus,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Timer,
  Shield,
  FileCheck,
  CalendarClock
} from 'lucide-react'
import { VerifySafetyDocButton } from './verify-button'
import { SectionVerifyButton } from '../section-verify-button'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { SafetyStatusPill } from '../safety-status-pill'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

const STANDARD_READINGS: ReadingDraft[] = [
  { parameter: 'O₂', reading: '', unit: '%', result: 'PASS' },
  { parameter: 'LEL', reading: '', unit: '%LEL', result: 'PASS' },
  { parameter: 'H₂S', reading: '', unit: 'ppm', result: 'PASS' },
  { parameter: 'CO', reading: '', unit: 'ppm', result: 'PASS' },
]

const ADDITIONAL_GASES = [
  'NH₃',
  'Cl₂',
  'SO₂',
  'VOC',
  'CO₂',
  'Other',
]

export function GasTestSection({
  permitId,
  canAdd,
  canVerify,
  initialTests,
  embedded,
  onTestsChange,
}: {
  permitId: number
  canAdd: boolean
  canVerify: boolean
  initialTests: GasTest[]
  embedded?: boolean
  onTestsChange?: (count: number) => void
}) {
  const [tests, setTests] = useState<GasTest[]>(initialTests)
  const [showForm, setShowForm] = useState(false)
  const [showPreviousTests, setShowPreviousTests] = useState(false)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  useEffect(() => {
    onTestsChange?.(tests.length)
  }, [tests, onTestsChange])
  
  const router = useRouter()

  const [testedAt, setTestedAt] = useState('')
  const [instrument, setInstrument] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [calibrationStatus, setCalibrationStatus] = useState('')
  const [testLocation, setTestLocation] = useState('')
  const [result, setResult] = useState<'PASS' | 'CONDITIONAL' | 'FAIL' | ''>('PASS')
  const [readings, setReadings] = useState<ReadingDraft[]>(STANDARD_READINGS)
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Sort tests by date (latest first)
  const sortedTests = [...tests].sort((a, b) => {
    const dateA = a.tested_at ? new Date(a.tested_at).getTime() : 0
    const dateB = b.tested_at ? new Date(b.tested_at).getTime() : 0
    return dateB - dateA
  })

  const latestTest = sortedTests[0]
  const previousTests = sortedTests.slice(1)

  function handleVerified(testId: number) {
    setTests((current) =>
      current.map((item) =>
        item.id === testId
          ? { ...item, status: 'verified' as const }
          : item
      )
    )
  }

  const hasVerifiedTest = tests.some((t) => t.status === 'verified')

  async function handleVerifyAll(): Promise<boolean> {
    const response = await fetch(
      `/api/permits/${permitId}/gas-tests/verify`,
      { method: 'POST' }
    )
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Unable to verify gas tests')
    }
    // Optimistically flip every pending test to verified.
    setTests((current) =>
      current.map((test) =>
        test.status === 'pending'
          ? { ...test, status: 'verified' as const }
          : test
      )
    )
    notifyPermitChanged()
    router.refresh()
    return true
  }

  useEffect(() => {
    if (!savedFlash) return
    const timer = setTimeout(() => setSavedFlash(null), 4000)
    return () => clearTimeout(timer)
  }, [savedFlash])

  function updateReading(index: number, patch: Partial<ReadingDraft>) {
    setReadings((current) =>
      current.map((reading, i) =>
        i === index ? { ...reading, ...patch } : reading
      )
    )
  }

  function addOtherGas(gas?: string) {
    setReadings((current) => [
      ...current,
      { 
        parameter: gas || 'Other', 
        reading: '', 
        unit: '', 
        result: '' 
      },
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
        setError(res.error || 'Unable to record gas test.')
        return
      }

      setTestedAt('')
      setInstrument('')
      setInstrumentId('')
      setCalibrationStatus('')
      setTestLocation('')
      setResult('PASS')
      setReadings(STANDARD_READINGS)
      setRemarks('')
      if (res?.gas_test) {
        setTests((current) => [...current, res.gas_test])
      }
      setShowForm(false)
      setSavedFlash('Gas test recorded successfully')
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to record gas test.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={embedded ? '' : 'mt-6 rounded-xl border bg-background'}>
      {savedFlash && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          {savedFlash}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <FlaskConical className="h-5 w-5 text-blue-600" />
            Gas Testing
          </h2>
          {latestTest ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Latest: {latestTest.result && <ResultBadge result={latestTest.result} />}
              {' · '}
              {getRelativeTime(latestTest.tested_at)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Atmospheric gas test results for this permit.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canAdd && !showForm && (
            <Button
              type="button"
              onClick={() => setShowForm(true)}
              variant="outline"
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              Record New Test
            </Button>
          )}
          {canVerify && (
            <SectionVerifyButton
              verified={hasVerifiedTest}
              onVerify={handleVerifyAll}
            />
          )}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="space-y-6 border-b p-6">
          {/* Test details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              1. Test Details
            </h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Test Location *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={testLocation}
                    onChange={(event) => setTestLocation(event.target.value)}
                    placeholder="e.g. Manhole MH-3 entry point"
                    className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Date & Time *
                </label>
                <div className="relative">
                  <CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="datetime-local"
                    value={testedAt}
                    onChange={(event) => setTestedAt(event.target.value)}
                    className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Atmospheric readings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              2. Atmospheric Readings
            </h3>
            
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {readings.map((reading, index) => (
                <ReadingInputCard
                  key={index}
                  reading={reading}
                  index={index}
                  isStandard={index < 4}
                  onChange={(patch) => updateReading(index, patch)}
                  onRemove={() => removeReading(index)}
                />
              ))}
            </div>
            
            <div className="flex flex-wrap gap-2">
              {ADDITIONAL_GASES.map((gas) => (
                <Button
                  key={gas}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addOtherGas(gas)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {gas}
                </Button>
              ))}
            </div>
          </div>

          {/* Instrument details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              3. Instrument Details
            </h3>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Instrument</label>
                <input
                  type="text"
                  value={instrument}
                  onChange={(event) => setInstrument(event.target.value)}
                  placeholder="e.g. GasAlert MicroClip XL"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Serial No. / ID
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
                  Calibration Status
                </label>
                <select
                  value={calibrationStatus}
                  onChange={(event) => setCalibrationStatus(event.target.value)}
                  className={cn(
                    "w-full rounded-md border bg-background px-3 py-2 text-sm",
                    calibrationStatus === 'Expired' && "border-red-500 text-red-600"
                  )}
                >
                  <option value="">Select status</option>
                  <option value="Valid">Valid</option>
                  <option value="Expired">Expired</option>
                  <option value="Unknown">Unknown</option>
                </select>
                {calibrationStatus === 'Expired' && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Instrument calibration expired
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              4. Remarks (Optional)
            </h3>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={2}
              placeholder="Any notes about the test..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false)
                setError('')
              }}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleCreate}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Gas Test'}
            </Button>
          </div>
        </div>
      )}

      {/* Latest test display */}
      {latestTest && (
        <GasTestCard
          test={latestTest}
          isLatest={true}
          canVerify={canVerify}
          permitId={permitId}
          onVerified={() => handleVerified(latestTest.id)}
        />
      )}

      {/* Previous tests */}
      {previousTests.length > 0 && (
        <div className="border-t">
          <button
            type="button"
            onClick={() => setShowPreviousTests(!showPreviousTests)}
            className="flex w-full items-center justify-between px-6 py-4"
          >
            <span className="text-sm font-medium">
              Previous Tests ({previousTests.length})
            </span>
            {showPreviousTests ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          
          {showPreviousTests && (
            <div className="divide-y">
              {previousTests.map((test) => (
                <GasTestCard
                  key={test.id}
                  test={test}
                  isLatest={false}
                  canVerify={canVerify}
                  permitId={permitId}
                  onVerified={() => handleVerified(test.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {tests.length === 0 && (
        <div className="p-6 text-center">
          <FlaskConical className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            No gas test recorded
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Atmospheric testing is required before work begins.
          </p>
          {canAdd && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setShowForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Record Gas Test
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

/* =========================================================
   READING INPUT CARD
   ========================================================= */

function ReadingInputCard({
  reading,
  index,
  isStandard,
  onChange,
  onRemove,
}: {
  reading: ReadingDraft
  index: number
  isStandard: boolean
  onChange: (patch: Partial<ReadingDraft>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">
          {reading.parameter}
        </label>
        {!isStandard && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Remove
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={reading.reading}
          onChange={(e) => onChange({ reading: e.target.value })}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          placeholder="0.0"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {reading.unit}
        </span>
      </div>
      
      <select
        value={reading.result}
        onChange={(e) => 
          onChange({ 
            result: e.target.value as 'PASS' | 'CONDITIONAL' | 'FAIL' | '' 
          })
        }
        className={cn(
          "mt-2 w-full rounded-md border px-2 py-1.5 text-sm",
          reading.result === 'PASS' && "border-green-500 text-green-600",
          reading.result === 'CONDITIONAL' && "border-yellow-500 text-yellow-600",
          reading.result === 'FAIL' && "border-red-500 text-red-600"
        )}
      >
        <option value="">—</option>
        <option value="PASS">PASS</option>
        <option value="CONDITIONAL">CONDITIONAL</option>
        <option value="FAIL">FAIL</option>
      </select>
    </div>
  )
}

/* =========================================================
   GAS TEST CARD
   ========================================================= */

function GasTestCard({
  test,
  isLatest,
  canVerify,
  permitId,
  onVerified,
}: {
  test: GasTest
  isLatest: boolean
  canVerify: boolean
  permitId: number
  onVerified?: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      "p-6",
      isLatest && "bg-blue-50/50 dark:bg-blue-950/20"
    )}>
      {/* Result banner */}
      <div className={cn(
        "rounded-lg border-2 p-4 mb-4",
        test.result === 'PASS' && "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
        test.result === 'CONDITIONAL' && "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30",
        test.result === 'FAIL' && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {test.result === 'PASS' && (
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            )}
            {test.result === 'CONDITIONAL' && (
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            )}
            {test.result === 'FAIL' && (
              <XCircle className="h-8 w-8 text-red-600" />
            )}
            <div>
              <p className="text-2xl font-bold">
                {test.result}
              </p>
              {isLatest && (
                <p className="text-xs text-muted-foreground">
                  Latest test · {getRelativeTime(test.tested_at)}
                </p>
              )}
            </div>
          </div>
          
          <SafetyStatusPill status={test.status} />
        </div>

        {/* Location and time */}
        <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
          {test.test_location && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {test.test_location}
            </p>
          )}
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {formatDate(test.tested_at)}
          </p>
        </div>
      </div>

      {/* Readings */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {test.readings && test.readings.length > 0 ? (
          test.readings.map((reading) => (
            <ReadingDisplayCard
              key={reading.id}
              label={reading.parameter}
              value={reading.reading}
              unit={reading.unit ?? ''}
              result={reading.result}
            />
          ))
        ) : (
          <>
            <ReadingDisplayCard label="O₂" value={test.o2} unit="%" />
            <ReadingDisplayCard label="LEL" value={test.lel} unit="%LEL" />
            <ReadingDisplayCard label="H₂S" value={test.h2s} unit="ppm" />
            <ReadingDisplayCard label="CO" value={test.co} unit="ppm" />
          </>
        )}
      </div>

      {/* Instrument details */}
      {(test.instrument || test.instrument_id || test.calibration_status) && (
        <div className="mt-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium mb-2">Instrument</h4>
          <div className="space-y-1 text-sm">
            {test.instrument && (
              <p className="font-medium">{test.instrument}</p>
            )}
            {test.instrument_id && (
              <p className="text-xs text-muted-foreground">
                Serial: {test.instrument_id}
              </p>
            )}
            {test.calibration_status && (
              <p className={cn(
                "text-xs flex items-center gap-1",
                test.calibration_status === 'Expired' 
                  ? "text-red-600" 
                  : "text-green-600"
              )}>
                {test.calibration_status === 'Expired' ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Calibration {test.calibration_status.toLowerCase()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Remarks */}
      {test.remarks && (
        <p className="mt-3 text-sm text-muted-foreground">
          {test.remarks}
        </p>
      )}

      {/* Tester info */}
      <p className="mt-3 text-xs text-muted-foreground">
        Tested by {test.tester?.full_name ?? 'Unknown'}
      </p>

      {/* Verification */}
      {test.status === 'verified' && (
        <div className="mt-4">
          <SafetyStatusPill status="verified" />
        </div>
      )}

      {canVerify && test.status === 'pending' && (
        <div className="mt-4 flex justify-end">
          <VerifySafetyDocButton
            permitId={permitId}
            kind="gas-test"
            docId={test.id}
            onVerified={onVerified}
          />
        </div>
      )}
    </div>
  )
}

/* =========================================================
   READING DISPLAY CARD
   ========================================================= */

function ReadingDisplayCard({
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
  return (
    <div className={cn(
      "rounded-lg border p-4 text-center",
      result === 'PASS' && "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20",
      result === 'CONDITIONAL' && "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/20",
      result === 'FAIL' && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
    )}>
      <p className="text-xs font-medium text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold">
        {value === null ? '—' : value}
        {value !== null && unit && (
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </p>
      {result && (
        <p className={cn(
          "mt-2 inline-flex items-center gap-1 text-xs font-medium uppercase",
          result === 'PASS' && "text-green-600",
          result === 'CONDITIONAL' && "text-yellow-600",
          result === 'FAIL' && "text-red-600"
        )}>
          {result === 'PASS' && <CheckCircle2 className="h-3 w-3" />}
          {result === 'CONDITIONAL' && <AlertTriangle className="h-3 w-3" />}
          {result === 'FAIL' && <XCircle className="h-3 w-3" />}
          {result}
        </p>
      )}
    </div>
  )
}

/* =========================================================
   BADGES
   ========================================================= */

function ResultBadge({ result }: { result: 'PASS' | 'CONDITIONAL' | 'FAIL' }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
      result === 'PASS' && "bg-green-100 text-green-700",
      result === 'CONDITIONAL' && "bg-yellow-100 text-yellow-700",
      result === 'FAIL' && "bg-red-100 text-red-700"
    )}>
      {result}
    </span>
  )
}


/* =========================================================
   HELPERS
   ========================================================= */

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getRelativeTime(value: string | null) {
  if (!value) return '—'
  
  const date = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
}
