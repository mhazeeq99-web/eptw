'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Lock, 
  Tag, 
  MapPin, 
  Zap, 
  Shield, 
  CheckCircle2, 
  Plus,
  ChevronDown,
  ChevronUp,
  Wrench,
  Power,
  Droplets,
  Wind,
  Flame,
  ArrowDown,
  Circle
} from 'lucide-react'
import { VerifySafetyDocButton } from './verify-button'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { SafetyStatusPill } from '../safety-status-pill'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
  { value: 'Electrical', icon: Zap, color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400' },
  { value: 'Mechanical', icon: Wrench, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400' },
  { value: 'Hydraulic', icon: Droplets, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950 dark:text-cyan-400' },
  { value: 'Pneumatic', icon: Wind, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950 dark:text-teal-400' },
  { value: 'Chemical / Process', icon: Circle, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400' },
  { value: 'Pressure', icon: ArrowDown, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400' },
  { value: 'Thermal', icon: Flame, color: 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400' },
  { value: 'Gravity', icon: ArrowDown, color: 'text-gray-600 bg-gray-50 dark:bg-gray-950 dark:text-gray-400' },
  { value: 'Other', icon: Power, color: 'text-slate-600 bg-slate-50 dark:bg-slate-950 dark:text-slate-400' },
] as const

const ISOLATION_METHODS = [
  { value: 'Lock', icon: Lock, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400' },
  { value: 'Tag', icon: Tag, color: 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400' },
  { value: 'Valve closed', icon: Circle, color: 'text-gray-600 bg-gray-50 dark:bg-gray-950 dark:text-gray-400' },
  { value: 'Breaker isolated', icon: Power, color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400' },
  { value: 'Disconnected', icon: Zap, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400' },
  { value: 'Blinded / blanked', icon: Shield, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400' },
  { value: 'Drained', icon: Droplets, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950 dark:text-cyan-400' },
  { value: 'Depressurised', icon: Wind, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950 dark:text-teal-400' },
  { value: 'Other', icon: Wrench, color: 'text-slate-600 bg-slate-50 dark:bg-slate-950 dark:text-slate-400' },
] as const

export function LotoSection({
  permitId,
  canAdd,
  canVerify,
  initialPoints,
  embedded,
  onPointsChange,
}: {
  permitId: number
  canAdd: boolean
  canVerify: boolean
  initialPoints: LotoPoint[]
  embedded?: boolean
  onPointsChange?: (count: number) => void
}) {
  const [points, setPoints] = useState<LotoPoint[]>(initialPoints)
  const [showForm, setShowForm] = useState(false)
  const [expandedPoint, setExpandedPoint] = useState<number | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  
  useEffect(() => {
    onPointsChange?.(points.length)
  }, [points, onPointsChange])
  
  const router = useRouter()

  const [description, setDescription] = useState('')
  const [tagNumber, setTagNumber] = useState('')
  const [isolationPoint, setIsolationPoint] = useState('')
  const [lockNumber, setLockNumber] = useState('')
  const [energyType, setEnergyType] = useState('')
  const [isolationMethod, setIsolationMethod] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const verifiedCount = points.filter(p => p.status === 'verified').length
  const pendingCount = points.filter(p => p.status === 'pending').length

  useEffect(() => {
    if (!savedFlash) return
    const timer = setTimeout(() => setSavedFlash(null), 4000)
    return () => clearTimeout(timer)
  }, [savedFlash])

  async function handleCreate() {
    setError('')

    if (!description.trim()) {
      setError('Equipment / isolation point is required.')
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
      if (result?.loto) {
        setPoints((current) => [...current, result.loto])
      }
      setSavedFlash('Isolation point added successfully')
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
      {savedFlash && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          {savedFlash}
        </div>
      )}

      {/* Header with summary */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Lock className="h-5 w-5 text-blue-600" />
            LOTO — Isolation Points
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {points.length > 0 ? (
              <>
                {points.length} isolation point{points.length !== 1 ? 's' : ''}
                {' · '}
                {verifiedCount} verified
                {pendingCount > 0 && ` · ${pendingCount} pending`}
              </>
            ) : (
              'Lock-out / tag-out isolation points for this permit.'
            )}
          </p>
        </div>

        {canAdd && !showForm && (
          <Button
            type="button"
            onClick={() => setShowForm(true)}
            variant="outline"
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Isolation Point
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="space-y-6 border-b p-6">
          {/* What are you isolating? */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              1. What are you isolating?
            </h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Equipment / Isolation Point *
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
                  Location
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
            </div>
          </div>

          {/* What energy is involved? */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              2. What energy is involved?
            </h3>
            
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {ENERGY_TYPES.map((energy) => (
                <button
                  key={energy.value}
                  type="button"
                  onClick={() => setEnergyType(energy.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all",
                    energyType === energy.value
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                  )}
                >
                  <energy.icon className={cn("h-4 w-4 shrink-0", energy.color)} />
                  <span className="text-xs font-medium">{energy.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* How is it isolated? */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              3. How is it isolated?
            </h3>
            
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {ISOLATION_METHODS.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setIsolationMethod(method.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all",
                    isolationMethod === method.value
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                  )}
                >
                  <method.icon className={cn("h-4 w-4 shrink-0", method.color)} />
                  <span className="text-xs font-medium">{method.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Identification */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              4. Identification
            </h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
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
                  placeholder="e.g. LOTO-024"
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
                  placeholder="e.g. L-1023"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              5. Notes (Optional)
            </h3>
            
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={2}
              placeholder="Any additional notes about this isolation point..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">
              {error}
            </p>
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
              {saving ? 'Saving...' : 'Save Isolation Point'}
            </Button>
          </div>
        </div>
      )}

      {/* Points list */}
      <div className="divide-y">
        {points.length === 0 ? (
          <div className="p-6 text-center">
            <Lock className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
              No isolation points added yet.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add every energy isolation point required before work begins.
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
                Add Isolation Point
              </Button>
            )}
          </div>
        ) : (
          points.map((point, index) => (
            <LotoPointCard
              key={point.id}
              point={point}
              index={index}
              canVerify={canVerify}
              permitId={permitId}
              expanded={expandedPoint === point.id}
              onToggleExpand={() =>
                setExpandedPoint(
                  expandedPoint === point.id ? null : point.id
                )
              }
              onVerified={() =>
                setPoints((current) =>
                  current.map((item) =>
                    item.id === point.id
                      ? { ...item, status: 'verified' as const }
                      : item
                  )
                )
              }
            />
          ))
        )}
      </div>
    </section>
  )
}

/* =========================================================
   LOTO POINT CARD
   ========================================================= */

function LotoPointCard({
  point,
  index,
  canVerify,
  permitId,
  expanded,
  onToggleExpand,
  onVerified,
}: {
  point: LotoPoint
  index: number
  canVerify: boolean
  permitId: number
  expanded: boolean
  onToggleExpand: () => void
  onVerified?: () => void
}) {
  const energyType = ENERGY_TYPES.find(e => e.value === point.energy_type)
  const isolationMethod = ISOLATION_METHODS.find(m => m.value === point.isolation_method)
  
  return (
    <div className="p-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex-1 text-left hover:underline"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                {point.description}
              </h3>
            </div>
          </button>
          
          <div className="flex items-center gap-2">
            <SafetyStatusPill status={point.status} />
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Summary metadata */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {point.energy_type && (
            <div className="flex items-center gap-2">
              {energyType && (
                <energyType.icon className={cn("h-4 w-4", energyType.color)} />
              )}
              <span className="text-xs text-muted-foreground">Energy:</span>
              <span className="text-sm font-medium">{point.energy_type}</span>
            </div>
          )}
          
          {point.isolation_method && (
            <div className="flex items-center gap-2">
              {isolationMethod && (
                <isolationMethod.icon className={cn("h-4 w-4", isolationMethod.color)} />
              )}
              <span className="text-xs text-muted-foreground">Method:</span>
              <span className="text-sm font-medium">{point.isolation_method}</span>
            </div>
          )}
          
          {point.isolation_point && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-muted-foreground">Location:</span>
              <span className="text-sm font-medium">{point.isolation_point}</span>
            </div>
          )}
        </div>

        {/* Tag and lock info */}
        {(point.tag_number || point.lock_number) && (
          <div className="flex flex-wrap gap-3">
            {point.tag_number && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
                <Tag className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">Tag:</span>
                <span className="text-sm font-medium">{point.tag_number}</span>
              </div>
            )}
            
            {point.lock_number && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
                <Lock className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">Lock:</span>
                <span className="text-sm font-medium">{point.lock_number}</span>
              </div>
            )}
          </div>
        )}

        {/* Added by info */}
        <p className="text-xs text-muted-foreground">
          Added by {point.creator?.full_name ?? 'Unknown'}
          {' · '}
          {formatDate(point.created_at)}
        </p>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-2 space-y-3 rounded-lg border bg-muted/20 p-4">
            {point.remarks && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Remarks
                </p>
                <p className="text-sm">{point.remarks}</p>
              </div>
            )}
            
            {/* Isolation chain visualization */}
            {point.energy_type && point.isolation_method && (
              <div className="flex items-center gap-3 py-2">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Energy</p>
                  <p className="text-sm font-medium">{point.energy_type}</p>
                </div>
                <ArrowDown className="h-4 w-4 text-gray-400" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Equipment</p>
                  <p className="text-sm font-medium">{point.description}</p>
                </div>
                <ArrowDown className="h-4 w-4 text-gray-400" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Method</p>
                  <p className="text-sm font-medium">{point.isolation_method}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Verification */}
      {point.status === 'verified' && (
        <div className="mt-4">
          <SafetyStatusPill status="verified" />
        </div>
      )}

      {canVerify && point.status === 'pending' && (
        <div className="mt-4 flex justify-end">
          <VerifySafetyDocButton
            permitId={permitId}
            kind="loto"
            docId={point.id}
            onVerified={onVerified}
          />
        </div>
      )}
    </div>
  )
}

/* =========================================================
   STATUS BADGE
   ========================================================= */


function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
