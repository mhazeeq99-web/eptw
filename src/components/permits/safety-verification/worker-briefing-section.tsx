'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifyPermitChanged } from '@/lib/permit-changed'

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
}

const TOPIC_DEFS: Array<{
  key: string
  label: string
  applicableIf?: 'loto' | 'gas'
}> = [
  { key: 'work_scope', label: 'Work scope explained' },
  { key: 'hazards', label: 'Hazards explained' },
  { key: 'jha', label: 'JHA/HIRARC explained' },
  { key: 'safety_controls', label: 'Safety controls explained' },
  { key: 'ppe', label: 'PPE requirements explained' },
  {
    key: 'loto',
    label: 'LOTO / isolation requirements explained',
    applicableIf: 'loto',
  },
  {
    key: 'gas_testing',
    label: 'Gas testing requirements explained',
    applicableIf: 'gas',
  },
  { key: 'emergency', label: 'Emergency arrangements explained' },
  { key: 'permit_conditions', label: 'Permit conditions explained' },
  { key: 'stop_work', label: 'Stop-work requirements explained' },
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

  const topics = TOPIC_DEFS.filter((topic) => {
    if (topic.applicableIf === 'loto') return requiresLoto
    if (topic.applicableIf === 'gas') return requiresGas
    return true
  })

  const [covered, setCovered] = useState<Record<string, boolean>>(
    () => {
      const state: Record<string, boolean> = {}
      for (const topic of topics) {
        state[topic.key] =
          initialRecord?.topics.find(
            (t) => t.key === topic.key
          )?.covered ?? false
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

  const briefed = initialRecord?.status === 'briefed'
  const acknowledgedCount = initialWorkers.filter(
    (worker) => worker.acknowledged
  ).length

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
            topics: topics.map((topic) => ({
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

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Worker Briefing — Safety Personnel responsibility</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Safety personnel brief the authorised workers before work
            commences. This is recorded for audit and is a Safety
            Personnel responsibility, not an applicant task.
          </p>
        </div>

        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
            briefed
              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
          }`}
        >
          {briefed ? 'Briefed' : 'Not briefed'}
        </span>
      </div>

      <div className="p-6">
        <div className="space-y-2">
          {topics.map((topic) => (
            <label
              key={topic.key}
              className="flex items-center gap-3 rounded-md border p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={covered[topic.key] === true}
                disabled={!canEdit}
                onChange={(event) =>
                  setCovered((current) => ({
                    ...current,
                    [topic.key]: event.target.checked,
                  }))
                }
              />
              {topic.label}
            </label>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium">
            Briefing Remarks
          </label>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            disabled={!canEdit}
            rows={2}
            placeholder="Notes about the toolbox talk..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        {initialRecord?.briefed_by && (
          <p className="mt-3 text-xs font-medium text-green-600">
            ✓ Briefed{initialRecord.briefed_at
              ? ` at ${new Intl.DateTimeFormat('en-MY', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(initialRecord.briefed_at))}`
              : ''}
          </p>
        )}

        {canEdit && (
          <>
            {error && (
              <p className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleMarkBriefed}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Mark Briefed'}
              </button>
            </div>
          </>
        )}

        {initialWorkers.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">
                Worker Acknowledgement
              </p>
              <p className="text-xs text-muted-foreground">
                {acknowledgedCount} / {initialWorkers.length}{' '}
                acknowledged
              </p>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">
                      Worker
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      Briefed
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      Acknowledged
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {initialWorkers.map((worker) => (
                    <tr key={worker.id}>
                      <td className="px-4 py-2">
                        {worker.full_name}
                      </td>
                      <td className="px-4 py-2">
                        {worker.briefed ? (
                          <span className="font-medium text-green-600">
                            ✓
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleAcknowledge(
                                worker.id,
                                !worker.acknowledged
                              )
                            }
                            disabled={ackSavingId === worker.id}
                            className={`rounded-md border px-3 py-1 text-xs font-medium ${
                              worker.acknowledged
                                ? 'border-green-600 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                                : 'hover:bg-muted'
                            }`}
                          >
                            {worker.acknowledged
                              ? '✓ Acknowledged'
                              : 'Mark Acknowledged'}
                          </button>
                        ) : worker.acknowledged ? (
                          <span className="font-medium text-green-600">
                            ✓ Acknowledged
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Not acknowledged
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
