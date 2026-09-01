'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  ClipboardCheck,
  UserCheck,
  Shield,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { cn } from '@/lib/utils'
import { SafetyStatusPill } from '../safety-status-pill'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export type BriefingWorker = {
  id: number
  full_name: string
  briefed: boolean
  acknowledged: boolean
}

export type WorkerBriefingRecord = {
  id: number
  permit_id: number
  status: 'not_briefed' | 'briefed'
  topics: Array<{
    key: string
    label: string
    covered: boolean
  }>
  briefed_by: string | null
  briefed_at: string | null
  remarks: string | null
  briefer?: {
    full_name: string
    role?: string
  } | null
}

const TOPIC_GROUPS: Array<{
  group: string
  topics: Array<{
    key: string
    label: string
    applicableIf?: 'loto' | 'gas'
  }>
}> = [
  {
    group: 'Work & Hazards',
    topics: [
      { key: 'work_scope', label: 'Work scope explained' },
      { key: 'hazards', label: 'Hazards explained' },
      { key: 'jha', label: 'JHA/HIRARC explained' },
    ],
  },
  {
    group: 'Controls',
    topics: [
      { key: 'safety_controls', label: 'Safety controls explained' },
      { key: 'ppe', label: 'PPE requirements explained' },
      { key: 'loto', label: 'LOTO / isolation requirements explained', applicableIf: 'loto' },
      { key: 'gas_testing', label: 'Gas testing requirements explained', applicableIf: 'gas' },
    ],
  },
  {
    group: 'Emergency & Permit',
    topics: [
      { key: 'emergency', label: 'Emergency arrangements explained' },
      { key: 'permit_conditions', label: 'Permit conditions explained' },
      { key: 'stop_work', label: 'Stop-work requirements explained' },
    ],
  },
]

export function WorkerBriefingSection({
  permitId,
  canEdit,
  requiresLoto,
  requiresGas,
  initialRecord,
  initialWorkers,
}: {
  permitId: number
  canEdit: boolean
  requiresLoto: boolean
  requiresGas: boolean
  initialRecord: WorkerBriefingRecord | null
  initialWorkers: BriefingWorker[]
}) {
  const router = useRouter()

  const [covered, setCovered] = useState<Record<string, boolean>>(
    () => {
      const state: Record<string, boolean> = {}
      for (const group of TOPIC_GROUPS) {
        for (const topic of group.topics) {
          if (topic.applicableIf === 'loto' && !requiresLoto) continue
          if (topic.applicableIf === 'gas' && !requiresGas) continue
          state[topic.key] =
            initialRecord?.topics.find(
              (t) => t.key === topic.key
            )?.covered ?? false
        }
      }
      return state
    }
  )
  const [remarks, setRemarks] = useState(
    initialRecord?.remarks ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [ackSavingId, setAckSavingId] = useState<number | null>(
    null
  )
  const [error, setError] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [expandedWorkers, setExpandedWorkers] = useState(true)

  const briefed = initialRecord?.status === 'briefed'
  
  // Calculate totals
  const applicableTopics = TOPIC_GROUPS.flatMap(group => 
    group.topics.filter(topic => {
      if (topic.applicableIf === 'loto' && !requiresLoto) return false
      if (topic.applicableIf === 'gas' && !requiresGas) return false
      return true
    })
  )
  
  const coveredCount = applicableTopics.filter(
    topic => covered[topic.key] === true
  ).length
  
  const totalTopics = applicableTopics.length
  
  const acknowledgedCount = initialWorkers.filter(
    (worker) => worker.acknowledged
  ).length
  
  const totalWorkers = initialWorkers.length
  
  const topicsComplete = coveredCount === totalTopics
  const workersComplete = acknowledgedCount === totalWorkers && totalWorkers > 0
  
  const briefingProgress = totalTopics > 0 
    ? Math.round((coveredCount / totalTopics) * 100)
    : 0
    
  const workerProgress = totalWorkers > 0
    ? Math.round((acknowledgedCount / totalWorkers) * 100)
    : 0

  async function handleMarkBriefed() {
    setError('')

    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/worker-briefing`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topics: applicableTopics.map((topic) => ({
              key: topic.key,
              label: topic.label,
              covered: covered[topic.key] === true,
            })),
            remarks: remarks.trim() || null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to save worker briefing.'
        )
        return
      }

      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 4000)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to save worker briefing.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAcknowledge(
    workerId: number,
    acknowledged: boolean
  ) {
    setError('')
    setAckSavingId(workerId)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/worker-briefing/${workerId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ acknowledged }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to update acknowledgement.'
        )
        return
      }

      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to update acknowledgement.')
    } finally {
      setAckSavingId(null)
    }
  }

  const isReadOnly = !canEdit || briefed

  return (
    <section className="mt-6 rounded-xl border bg-background">
      {savedFlash && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          Briefing saved successfully
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="h-5 w-5 text-blue-600" />
            Worker Briefing
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Safety personnel must brief authorised workers before work begins.
          </p>
        </div>

        <BriefingStatusBadge 
          briefed={briefed}
          topicsComplete={topicsComplete}
          workersComplete={workersComplete}
        />
      </div>

      <div className="p-6 space-y-8">
        {/* SECTION 1: BRIEFING CHECKLIST */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                <ClipboardCheck className="h-5 w-5 text-blue-600" />
                Briefing Topics
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Safety personnel confirm all required topics are covered
              </p>
            </div>
            <span className={cn(
              "text-sm font-medium",
              topicsComplete ? "text-green-600" : "text-yellow-600"
            )}>
              {coveredCount} / {totalTopics} covered
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-4 dark:bg-gray-700">
            <div 
              className={cn(
                "h-full transition-all",
                topicsComplete ? "bg-green-500" : "bg-yellow-500"
              )}
              style={{ width: `${briefingProgress}%` }}
            />
          </div>

          {/* Grouped topics */}
          <div className="space-y-6">
            {TOPIC_GROUPS.map((group) => {
              const groupTopics = group.topics.filter(topic => {
                if (topic.applicableIf === 'loto' && !requiresLoto) return false
                if (topic.applicableIf === 'gas' && !requiresGas) return false
                return true
              })
              
              if (groupTopics.length === 0) return null
              
              return (
                <div key={group.group}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {group.group}
                  </h4>
                  <div className="space-y-1">
                    {groupTopics.map((topic) => (
                      <label
                        key={topic.key}
                        className={cn(
                          "flex items-center gap-3 rounded-md border p-3 text-sm cursor-pointer transition-colors",
                          covered[topic.key] 
                            ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20" 
                            : "hover:bg-muted/50",
                          isReadOnly && "cursor-not-allowed opacity-60"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={covered[topic.key] === true}
                          disabled={isReadOnly}
                          onChange={(event) =>
                            setCovered((current) => ({
                              ...current,
                              [topic.key]: event.target.checked,
                            }))
                          }
                          className="h-4 w-4"
                        />
                        <span className="flex-1">
                          {topic.label}
                        </span>
                        {covered[topic.key] && (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Briefing notes */}
          <div className="mt-6 space-y-2">
            <label className="text-sm font-medium">
              Briefing Notes
            </label>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              disabled={isReadOnly}
              rows={2}
              placeholder="Key points, questions raised, or issues discussed..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>

          {/* Briefing record */}
          {initialRecord?.briefed_by && (
            <div className="mt-4">
              <SafetyStatusPill status="verified" />
            </div>
          )}

          {/* Action button */}
          {!isReadOnly && (
            <>
              {!topicsComplete && (
                <div className="mt-4 flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">
                    {totalTopics - coveredCount} briefing topic{totalTopics - coveredCount !== 1 ? 's' : ''} remaining
                  </span>
                </div>
              )}

              {error && (
                <p className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  onClick={handleMarkBriefed}
                  disabled={saving || !topicsComplete}
                >
                  {saving ? 'Saving...' : 'Mark Briefing Complete'}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="border-t" />

        {/* SECTION 2: WORKER ACKNOWLEDGEMENT */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                <UserCheck className="h-5 w-5 text-green-600" />
                Worker Acknowledgement
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Each worker confirms they received and understood the briefing
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpandedWorkers(!expandedWorkers)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {acknowledgedCount} / {totalWorkers} acknowledged
              {expandedWorkers ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Progress bar */}
          {totalWorkers > 0 && (
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-4 dark:bg-gray-700">
              <div 
                className={cn(
                  "h-full transition-all",
                  workersComplete ? "bg-green-500" : "bg-yellow-500"
                )}
                style={{ width: `${workerProgress}%` }}
              />
            </div>
          )}

          {/* Completion message */}
          {workersComplete && totalWorkers > 0 && (
            <div className="mb-4 flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                All {totalWorkers} workers acknowledged
              </span>
            </div>
          )}

          {/* Worker list */}
          {expandedWorkers && totalWorkers > 0 && (
            <div className="space-y-2">
              {initialWorkers.map((worker) => (
                <WorkerAcknowledgementCard
                  key={worker.id}
                  worker={worker}
                  canEdit={canEdit}
                  saving={ackSavingId === worker.id}
                  onAcknowledge={() =>
                    handleAcknowledge(
                      worker.id,
                      !worker.acknowledged
                    )
                  }
                />
              ))}
            </div>
          )}

          {totalWorkers === 0 && (
            <p className="text-sm text-muted-foreground">
              No workers have been assigned to this permit.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

/* =========================================================
   WORKER ACKNOWLEDGEMENT CARD
   ========================================================= */

function WorkerAcknowledgementCard({
  worker,
  canEdit,
  saving,
  onAcknowledge,
}: {
  worker: BriefingWorker
  canEdit: boolean
  saving: boolean
  onAcknowledge: () => void
}) {
  return (
    <div className={cn(
      "rounded-md border p-3 transition-colors",
      worker.acknowledged 
        ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20" 
        : "border-gray-200 dark:border-gray-700"
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {worker.acknowledged ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
          )}
          <div>
            <p className="text-sm font-medium">
              {worker.full_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {worker.acknowledged ? 'Acknowledged' : 'Not acknowledged'}
            </p>
          </div>
        </div>

        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant={worker.acknowledged ? "outline" : "default"}
            onClick={onAcknowledge}
            disabled={saving}
            className={cn(
              worker.acknowledged && "text-green-600 border-green-600 hover:bg-green-50"
            )}
          >
            {saving ? 'Saving...' : worker.acknowledged ? '✓ Acknowledged' : 'Acknowledge'}
          </Button>
        )}
      </div>
    </div>
  )
}

/* =========================================================
   STATUS BADGE
   ========================================================= */

function BriefingStatusBadge({
  briefed,
  topicsComplete,
  workersComplete,
}: {
  briefed: boolean
  topicsComplete: boolean
  workersComplete: boolean
}) {
  let config: { label: string; className: string; icon: any }
  
  if (briefed && topicsComplete && workersComplete) {
    config = {
      label: 'Complete',
      className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
      icon: CheckCircle2,
    }
  } else if (briefed) {
    config = {
      label: 'Briefed',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      icon: ClipboardCheck,
    }
  } else {
    config = {
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
      icon: AlertTriangle,
    }
  }
  
  const Icon = config.icon

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        config.className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}
