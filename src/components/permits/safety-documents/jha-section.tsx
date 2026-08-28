'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Trash2 } from 'lucide-react'
import { VerifySafetyDocButton } from './verify-button'
import { notifyPermitChanged } from '@/lib/permit-changed'

/**
 * 5x5 likelihood x severity risk matrix adopted by the company
 * (rating = likelihood x severity). This is a company-adopted matrix,
 * not a statutory requirement; band labels are shown for readability.
 */
const RISK_BANDS = [
  { min: 16, max: 25, label: 'VERY HIGH', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  { min: 10, max: 15, label: 'HIGH', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  { min: 5, max: 9, label: 'MEDIUM', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' },
  { min: 1, max: 4, label: 'LOW', className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
] as const

export function riskBand(rating: number | null) {
  if (rating === null) return null
  return (
    RISK_BANDS.find(
      (band) => rating >= band.min && rating <= band.max
    ) ?? null
  )
}

const HAZARD_CATEGORIES = [
  'Physical',
  'Chemical',
  'Biological',
  'Ergonomic',
  'Psychological',
  'Electrical',
  'Mechanical',
  'Environmental',
  'Other',
]

const CONTROL_TYPES = [
  'Elimination',
  'Substitution',
  'Engineering',
  'Administrative',
  'PPE',
] as const

export type JhaHazard = {
  id: number
  hazard: string
  hazard_category: string | null
  consequence: string | null
  existing_controls: string | null
  control_types: string[]
  likelihood: number | null
  severity: number | null
  risk_rating: number | null
  additional_controls: string | null
  residual_likelihood: number | null
  residual_severity: number | null
  residual_risk: number | null
  sort_order: number
}

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
  hazards: JhaHazard[] | null
}

export type HirarcDocument = {
  id: number
  permit_id: number
  uploaded_by: string
  filename: string
  storage_path: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
  uploader: {
    full_name: string
  } | null
}

type HazardDraft = {
  hazard: string
  hazard_category: string
  consequence: string
  existing_controls: string
  control_types: string[]
  likelihood: string
  severity: string
  additional_controls: string
  residual_likelihood: string
  residual_severity: string
}

function emptyHazard(): HazardDraft {
  return {
    hazard: '',
    hazard_category: '',
    consequence: '',
    existing_controls: '',
    control_types: [],
    likelihood: '',
    severity: '',
    additional_controls: '',
    residual_likelihood: '',
    residual_severity: '',
  }
}

function toNumber(value: string): number | null {
  if (!value) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) return null
  return n
}

export function JhaSection({
  permitId,
  canAdd,
  canVerify,
  initialJhas,
  initialHirarc,
}: {
  permitId: number
  canAdd: boolean
  canVerify: boolean
  initialJhas: Jha[]
  initialHirarc: HirarcDocument[]
}) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hazards, setHazards] = useState<HazardDraft[]>([
    emptyHazard(),
  ])
  const [saving, setSaving] = useState(false)
  const [completingId, setCompletingId] = useState<
    number | null
  >(null)
  const [error, setError] = useState('')

  // Local copy of the JHA list so records saved in this component (the new
  // permit form passes a static EMPTY_JHAS prop) appear immediately instead of
  // requiring the parent's `initialJhas` prop to change. `hirarc` already does
  // this; `jhas` mirrors the same behaviour.
  const [jhas, setJhas] = useState<Jha[]>(initialJhas)

  const [hirarc, setHirarc] = useState<HirarcDocument[]>(
    initialHirarc
  )
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(
    null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const satisfied =
    jhas.some((jha) => jha.status === 'verified') ||
    hirarc.length > 0

  const methodLabels: string[] = []
  if (jhas.some((jha) => jha.status === 'verified')) {
    methodLabels.push('Manual JHA')
  }
  if (hirarc.length > 0) {
    methodLabels.push('Uploaded HIRARC')
  }

  async function handleHirarcSelected(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError('')
    setUploading(true)

    try {
      // 1. Request a signed upload URL.
      const urlResponse = await fetch(
        `/api/permits/${permitId}/hirarc/upload-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type || null,
            size_bytes: file.size,
          }),
        }
      )

      const urlResult = await urlResponse.json()

      if (!urlResponse.ok) {
        throw new Error(
          urlResult.error ?? 'Unable to prepare upload'
        )
      }

      // 2. Upload the file bytes to the signed URL.
      const uploadResponse = await fetch(
        urlResult.upload_url,
        {
          method: 'PUT',
          headers: {
            'Content-Type':
              file.type || 'application/octet-stream',
          },
          body: file,
        }
      )

      if (!uploadResponse.ok) {
        throw new Error('Upload to storage failed')
      }

      // 3. Record the HIRARC document metadata.
      const recordResponse = await fetch(
        `/api/permits/${permitId}/hirarc`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            permit_id: permitId,
            filename: file.name,
            storage_path: urlResult.storage_path,
            content_type: file.type || null,
            size_bytes: file.size,
          }),
        }
      )

      const recordResult = await recordResponse.json()

      if (!recordResponse.ok) {
        throw new Error(
          recordResult.error ?? 'Unable to record document'
        )
      }

      setHirarc((current) => [
        recordResult.document,
        ...current,
      ])
      notifyPermitChanged()
      router.refresh()
    } catch (uploadError) {
      setUploadError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Unable to upload HIRARC document'
      )
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function handleHirarcDownload(document: HirarcDocument) {
    setUploadError('')

    try {
      const response = await fetch(
        `/api/permits/${permitId}/hirarc/${document.id}/download`
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.error ?? 'Unable to download document'
        )
      }

      window.open(result.download_url, '_blank')
    } catch (downloadError) {
      setUploadError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Unable to download document'
      )
    }
  }

  async function handleHirarcDelete(document: HirarcDocument) {
    setUploadError('')

    const confirmed = window.confirm(
      `Delete HIRARC document "${document.filename}"?`
    )

    if (!confirmed) return

    setDeletingId(document.id)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/hirarc/${document.id}`,
        {
          method: 'DELETE',
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.error ?? 'Unable to delete document'
        )
      }

      setHirarc((current) =>
        current.filter((item) => item.id !== document.id)
      )
      notifyPermitChanged()
      router.refresh()
    } catch (deleteError) {
      setUploadError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete document'
      )
    } finally {
      setDeletingId(null)
    }
  }

  function updateHazard(
    index: number,
    patch: Partial<HazardDraft>
  ) {
    setHazards((current) =>
      current.map((hazard, i) =>
        i === index ? { ...hazard, ...patch } : hazard
      )
    )
  }

  function toggleControlType(
    index: number,
    controlType: string
  ) {
    setHazards((current) =>
      current.map((hazard, i) => {
        if (i !== index) return hazard
        const has = hazard.control_types.includes(controlType)
        return {
          ...hazard,
          control_types: has
            ? hazard.control_types.filter(
                (item) => item !== controlType
              )
            : [...hazard.control_types, controlType],
        }
      })
    )
  }

  async function handleCreate() {
    setError('')

    if (!title.trim()) {
      setError('JHA title is required.')
      return
    }

    const structuredHazards = hazards
      .filter((hazard) => hazard.hazard.trim().length > 0)
      .map((hazard) => ({
        hazard: hazard.hazard.trim(),
        hazard_category:
          hazard.hazard_category.trim() || null,
        consequence: hazard.consequence.trim() || null,
        existing_controls:
          hazard.existing_controls.trim() || null,
        control_types: hazard.control_types,
        likelihood: toNumber(hazard.likelihood),
        severity: toNumber(hazard.severity),
        additional_controls:
          hazard.additional_controls.trim() || null,
        residual_likelihood: toNumber(
          hazard.residual_likelihood
        ),
        residual_severity: toNumber(
          hazard.residual_severity
        ),
      }))

    if (structuredHazards.length === 0) {
      setError(
        'Add at least one hazard with a description.'
      )
      return
    }

    setSaving(true)

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
            hazards: structuredHazards,
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

      const created = result.jha
      setTitle('')
      setDescription('')
      setHazards([emptyHazard()])
      setShowForm(false)
      if (created) {
        setJhas((current) => [...current, created])
      }
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to add JHA.')
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete(jhaId: number) {
    setError('')
    setCompletingId(jhaId)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/jha/${jhaId}/complete`,
        { method: 'POST' }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to mark JHA as completed.'
        )
        return
      }

      setJhas((current) =>
        current.map((jha) =>
          jha.id === jhaId
            ? { ...jha, status: 'completed' }
            : jha
        )
      )
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to mark JHA as completed.')
    } finally {
      setCompletingId(null)
    }
  }

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">JHA / HIRARC</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose one method: fill a JHA/HIRARC in the system{' '}
            <span className="font-medium">or</span> upload an
            existing HIRARC document.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
              satisfied
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
            }`}
          >
            {satisfied ? 'Complete' : 'Incomplete'}
          </span>

          {satisfied && (
            <span className="text-xs text-muted-foreground">
              Method: {methodLabels.join(' + ')}
            </span>
          )}

          {canAdd && !showForm && !satisfied && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(true)
                  setUploadError('')
                }}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Fill JHA / HIRARC
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {uploading
                  ? 'Uploading...'
                  : 'Upload Existing HIRARC'}
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleHirarcSelected}
          />
        </div>
      </div>

      {showForm && (
        <div className="space-y-4 border-b p-6">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <input
                type="text"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="Describe the task and scope..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Hazards &amp; Risk Assessment
              </p>
              <button
                type="button"
                onClick={() =>
                  setHazards((current) => [
                    ...current,
                    emptyHazard(),
                  ])
                }
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                + Add Hazard
              </button>
            </div>

            {hazards.map((hazard, index) => {
              const likelihood = toNumber(hazard.likelihood)
              const severity = toNumber(hazard.severity)
              const rating =
                likelihood !== null && severity !== null
                  ? likelihood * severity
                  : null
              const band = riskBand(rating)
              const residualLikelihood = toNumber(
                hazard.residual_likelihood
              )
              const residualSeverity = toNumber(
                hazard.residual_severity
              )
              const residualRating =
                residualLikelihood !== null &&
                residualSeverity !== null
                  ? residualLikelihood * residualSeverity
                  : null
              const residualBand = riskBand(residualRating)

              return (
                <div
                  key={index}
                  className="space-y-3 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Hazard {index + 1}
                    </p>
                    {hazards.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setHazards((current) =>
                            current.filter(
                              (_, i) => i !== index
                            )
                          )
                        }
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Remove Hazard
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Hazard description *
                      </label>
                      <input
                        type="text"
                        value={hazard.hazard}
                        onChange={(event) =>
                          updateHazard(index, {
                            hazard: event.target.value,
                          })
                        }
                        placeholder="e.g. Fire / explosion from hot work sparks"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Hazard category
                      </label>
                      <select
                        value={hazard.hazard_category}
                        onChange={(event) =>
                          updateHazard(index, {
                            hazard_category:
                              event.target.value,
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">
                          Select category
                        </option>
                        {HAZARD_CATEGORIES.map((category) => (
                          <option
                            key={category}
                            value={category}
                          >
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Consequence
                    </label>
                    <textarea
                      value={hazard.consequence}
                      onChange={(event) =>
                        updateHazard(index, {
                          consequence: event.target.value,
                        })
                      }
                      rows={2}
                      placeholder="What could go wrong and how severe could it be?"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Existing controls
                    </label>
                    <textarea
                      value={hazard.existing_controls}
                      onChange={(event) =>
                        updateHazard(index, {
                          existing_controls:
                            event.target.value,
                        })
                      }
                      rows={2}
                      placeholder="Controls already in place before this assessment..."
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Hierarchy of controls
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CONTROL_TYPES.map((controlType) => {
                        const checked =
                          hazard.control_types.includes(
                            controlType
                          )
                        return (
                          <button
                            key={controlType}
                            type="button"
                            onClick={() =>
                              toggleControlType(
                                index,
                                controlType
                              )
                            }
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'hover:bg-muted'
                            }`}
                          >
                            {checked ? '✓ ' : ''}
                            {controlType}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Likelihood (1–5)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={hazard.likelihood}
                        onChange={(event) =>
                          updateHazard(index, {
                            likelihood: event.target.value,
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Severity (1–5)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={hazard.severity}
                        onChange={(event) =>
                          updateHazard(index, {
                            severity: event.target.value,
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Initial risk (L × S)
                      </label>
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
                        {rating === null ? (
                          '—'
                        ) : (
                          <>
                            {rating}{' '}
                            {band && (
                              <span
                                className={`ml-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${band.className}`}
                              >
                                {band.label}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Risk matrix
                      </label>
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        LOW 1–4 · MEDIUM 5–9 · HIGH 10–15 ·
                        VERY HIGH 16–25
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Additional controls
                    </label>
                    <textarea
                      value={hazard.additional_controls}
                      onChange={(event) =>
                        updateHazard(index, {
                          additional_controls:
                            event.target.value,
                        })
                      }
                      rows={2}
                      placeholder="Further controls to reduce the risk..."
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Residual likelihood (1–5)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={hazard.residual_likelihood}
                        onChange={(event) =>
                          updateHazard(index, {
                            residual_likelihood:
                              event.target.value,
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Residual severity (1–5)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={hazard.residual_severity}
                        onChange={(event) =>
                          updateHazard(index, {
                            residual_severity:
                              event.target.value,
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Residual risk (L × S)
                      </label>
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
                        {residualRating === null ? (
                          '—'
                        ) : (
                          <>
                            {residualRating}{' '}
                            {residualBand && (
                              <span
                                className={`ml-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${residualBand.className}`}
                              >
                                {residualBand.label}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
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
        {jhas.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No JHA has been added to this permit.
          </p>
        ) : (
          jhas.map((jha) => (
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

              {jha.hazards && jha.hazards.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          #
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Hazard
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Category
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Consequence
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Existing controls
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Control hierarchy
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          L / S
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Initial risk
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Additional controls
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Residual L / S
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Residual risk
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {jha.hazards.map((hazard, index) => {
                        const band = riskBand(
                          hazard.risk_rating
                        )
                        const residualBand = riskBand(
                          hazard.residual_risk
                        )
                        return (
                          <tr key={hazard.id}>
                            <td className="px-4 py-3 text-muted-foreground">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3">
                              {hazard.hazard}
                            </td>
                            <td className="px-4 py-3">
                              {hazard.hazard_category ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              {hazard.consequence ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              {hazard.existing_controls ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              {hazard.control_types.length > 0
                                ? hazard.control_types.join(
                                    ', '
                                  )
                                : '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {hazard.likelihood !== null &&
                              hazard.severity !== null
                                ? `${hazard.likelihood} / ${hazard.severity}`
                                : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {hazard.risk_rating !== null ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                                    band?.className ??
                                    'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {hazard.risk_rating}{' '}
                                  {band?.label ?? ''}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {hazard.additional_controls ?? '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {hazard.residual_likelihood !==
                                null &&
                              hazard.residual_severity !== null
                                ? `${hazard.residual_likelihood} / ${hazard.residual_severity}`
                                : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {hazard.residual_risk !== null ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                                    residualBand?.className ??
                                    'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {hazard.residual_risk}{' '}
                                  {residualBand?.label ?? ''}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                jha.hazards_controls &&
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
                )
              )}

              {jha.status === 'completed' && (
                <p className="mt-3 text-xs font-medium text-blue-600">
                  ✓ Marked as completed by the requester
                </p>
              )}

              {jha.status === 'verified' &&
                jha.verifier && (
                  <p className="mt-3 text-xs font-medium text-green-600">
                    ✓ Verified by{' '}
                    {jha.verifier.full_name} ·{' '}
                    {formatDate(jha.verified_at)}
                  </p>
                )}

              {canAdd &&
                jha.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => handleComplete(jha.id)}
                    disabled={completingId === jha.id}
                    className="mt-4 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {completingId === jha.id
                      ? 'Marking...'
                      : 'Mark Completed'}
                  </button>
                )}

              {canVerify &&
                (jha.status === 'pending' ||
                  jha.status === 'completed') && (
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

      {/* Uploaded HIRARC documents (Option B — satisfies the requirement) */}
      <div className="border-t">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium">
              Uploaded HIRARC Documents
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              An uploaded HIRARC satisfies the JHA/HIRARC requirement
              without a manual JHA.
            </p>
          </div>

          {canAdd && hirarc.length > 0 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          )}
        </div>

        {uploadError && (
          <div className="border-b px-6 py-3 text-sm text-destructive">
            {uploadError}
          </div>
        )}

        {hirarc.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No HIRARC document uploaded yet.
          </p>
        ) : (
          <div className="divide-y">
            {hirarc.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border text-sm">
                    📄
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {document.filename}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Uploaded by{' '}
                      {document.uploader?.full_name ?? 'Unknown'}
                      {' · '}
                      {formatDate(document.created_at)}
                      {document.size_bytes
                        ? ` · ${formatBytes(document.size_bytes)}`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleHirarcDownload(document)
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>

                  {canAdd && (
                    <button
                      type="button"
                      onClick={() =>
                        handleHirarcDelete(document)
                      }
                      disabled={deletingId === document.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingId === document.id
                        ? 'Deleting...'
                        : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
