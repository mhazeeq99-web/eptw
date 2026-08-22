'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VerifySafetyDocButton } from './verify-button'

export type Jha = {
  id: number
  title: string
  description: string | null
  hazards_controls: Array<{
    hazard: string
    control: string
  }> | null
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

export function JhaSection({
  permitId,
  canAdd,
  canVerify,
  initialJhas,
}: {
  permitId: number
  canAdd: boolean
  canVerify: boolean
  initialJhas: Jha[]
}) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hazardsControls, setHazardsControls] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setError('')

    if (!title.trim()) {
      setError('JHA title is required.')
      return
    }

    setSaving(true)

    const hazards_controls = hazardsControls
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [hazard, ...controlParts] = line
          .split('|')
          .map((part) => part.trim())
        return {
          hazard: hazard ?? '',
          control: controlParts.join(' | '),
        }
      })

    try {
      const response = await fetch(
        `/api/permits/${permitId}/jha`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            hazards_controls:
              hazards_controls.length > 0
                ? hazards_controls
                : null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to add JHA.'
        )
        return
      }

      setTitle('')
      setDescription('')
      setHazardsControls('')
      setShowForm(false)
      router.refresh()
    } catch {
      setError('Unable to add JHA.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">JHA / JSA</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Job Hazard Analysis attached to this permit.
          </p>
        </div>

        {canAdd && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Add JHA
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-4 border-b p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="e.g. Welding task hazard analysis"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Description
            </label>
            <textarea
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              rows={3}
              placeholder="Describe the task and scope..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Hazards &amp; Controls
            </label>
            <textarea
              value={hazardsControls}
              onChange={(event) =>
                setHazardsControls(event.target.value)
              }
              rows={4}
              placeholder={'One per line:  HAZARD | CONTROL\ne.g. Fire risk | Keep extinguisher on site'}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
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
              {saving ? 'Saving...' : 'Save JHA'}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y">
        {initialJhas.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No JHA has been added to this permit.
          </p>
        ) : (
          initialJhas.map((jha) => (
            <div key={jha.id} className="p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">
                    {jha.title}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Added by{' '}
                    {jha.creator?.full_name ?? 'Unknown'}
                    {' · '}
                    {formatDate(jha.created_at)}
                  </p>
                </div>

                <StatusBadge status={jha.status} />
              </div>

              {jha.description && (
                <p className="mt-3 text-sm whitespace-pre-wrap">
                  {jha.description}
                </p>
              )}

              {jha.hazards_controls &&
                jha.hazards_controls.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">
                            Hazard
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            Control
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {jha.hazards_controls.map(
                          (item, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2">
                                {item.hazard}
                              </td>
                              <td className="px-4 py-2">
                                {item.control}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

              {jha.status === 'verified' &&
                jha.verifier && (
                  <p className="mt-3 text-xs font-medium text-green-600">
                    ✓ Verified by{' '}
                    {jha.verifier.full_name} ·{' '}
                    {formatDate(jha.verified_at)}
                  </p>
                )}

              {canVerify && jha.status === 'pending' && (
                <div className="mt-4">
                  <VerifySafetyDocButton
                    permitId={permitId}
                    kind="jha"
                    docId={jha.id}
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
