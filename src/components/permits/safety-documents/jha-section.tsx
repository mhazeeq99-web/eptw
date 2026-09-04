'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Download, 
  Trash2, 
  CheckCircle2, 
  Plus, 
  X, 
  FileText, 
  FileSpreadsheet, 
  FileImage, 
  File as FileIcon,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Shield,
  ArrowRight,
  MoreVertical,
  Edit,
  Eye,
  Lock
} from 'lucide-react'
import { VerifySafetyDocButton } from './verify-button'
import { SectionVerifyButton } from '../section-verify-button'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { SafetyStatusPill } from '../safety-status-pill'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * 5x5 likelihood x severity risk matrix adopted by the company
 * (rating = likelihood x severity). This is a company-adopted matrix,
 * not a statutory requirement; band labels are shown for readability.
 */
const RISK_BANDS = [
  { min: 16, max: 25, label: 'VERY HIGH', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', borderColor: 'border-red-200 dark:border-red-800' },
  { min: 10, max: 15, label: 'HIGH', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', borderColor: 'border-orange-200 dark:border-orange-800' },
  { min: 5, max: 9, label: 'MEDIUM', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300', borderColor: 'border-yellow-200 dark:border-yellow-800' },
  { min: 1, max: 4, label: 'LOW', className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300', borderColor: 'border-green-200 dark:border-green-800' },
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

const RISK_MATRIX = [
  [1, 2, 3, 4, 5],
  [2, 4, 6, 8, 10],
  [3, 6, 9, 12, 15],
  [4, 8, 12, 16, 20],
  [5, 10, 15, 20, 25],
]

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
  embedded,
  saveRef,
  onJhasChange,
  attachmentsEnabled = false,
  isCompanyAdmin = false,
  isContractor = false,
}: {
  permitId: number
  canAdd: boolean
  canVerify: boolean
  initialJhas: Jha[]
  initialHirarc: HirarcDocument[]
  /** Render without the outer card so the parent can wrap it in a section. */
  embedded?: boolean
  /** The parent can set this to auto-save the in-progress JHA on form submit. */
  saveRef?: React.MutableRefObject<
    (() => Promise<boolean>) | null
  >
  /** Notify the parent whenever the number of saved JHA records changes. */
  onJhasChange?: (count: number) => void
  /** Whether the PTW-owning company's plan allows attachments (Free = false). */
  attachmentsEnabled?: boolean
  isCompanyAdmin?: boolean
  isContractor?: boolean
}) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [showChoiceCards, setShowChoiceCards] = useState(false)
  const [showRiskMatrix, setShowRiskMatrix] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hazards, setHazards] = useState<HazardDraft[]>([
    emptyHazard(),
  ])
  const [saving, setSaving] = useState(false)
  const [expandedJha, setExpandedJha] = useState<number | null>(null)

  const [error, setError] = useState('')

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

  const satisfied = jhas.length > 0 || hirarc.length > 0
  const hasVerifiedJha = jhas.some((jha) => jha.status === 'verified')
  const hasUploadedHirarc = hirarc.length > 0
  const isVerified = hasVerifiedJha || hasUploadedHirarc

  const methodLabels: string[] = []
  if (jhas.some((jha) => jha.status === 'verified')) {
    methodLabels.push('Manual JHA')
  }
  if (hirarc.length > 0) {
    methodLabels.push('Uploaded HIRARC')
  }

  async function handleVerifyAll(): Promise<boolean> {
    const pendingJhas = jhas.filter((jha) => jha.status === 'pending')
    for (const jha of pendingJhas) {
      const response = await fetch(
        `/api/permits/${permitId}/jha/${jha.id}/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'verified' }),
        }
      )
      if (!response.ok) {
        throw new Error('Unable to verify JHA')
      }
      setJhas((current) =>
        current.map((item) =>
          item.id === jha.id
            ? { ...item, status: 'verified' as const }
            : item
        )
      )
    }
    notifyPermitChanged()
    router.refresh()
    return true
  }

  // Track unsaved changes
  useEffect(() => {
    if (showForm && (title || description || hazards.some(h => h.hazard))) {
      setUnsavedChanges(true)
    } else {
      setUnsavedChanges(false)
    }
  }, [showForm, title, description, hazards])

  async function handleHirarcSelected(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError('')
    setUploading(true)

    try {
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
      setShowChoiceCards(false)
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

  async function handleCreate(): Promise<boolean> {
    setError('')

    if (!title.trim()) {
      if (!embedded) {
        setError('JHA title is required.')
      }
      return false
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
      if (!embedded) {
        setError(
          'Add at least one hazard with a description.'
        )
      }
      return false
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
        if (!embedded) {
          setError(
            result.error || 'Unable to add JHA.'
          )
        }
        return false
      }

      const created = result.jha
      setTitle('')
      setDescription('')
      setHazards([emptyHazard()])
      setShowForm(false)
      setUnsavedChanges(false)
      if (created) {
        setJhas((current) => [...current, created])
      }
      notifyPermitChanged()
      router.refresh()
      setSavedFlash('JHA saved successfully')
      return true
    } catch {
      if (!embedded) {
        setError('Unable to add JHA.')
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(jha: Jha) {
    const rows = (jha.hazards ?? []).map((hazard) => ({
      hazard: hazard.hazard,
      hazard_category: hazard.hazard_category ?? '',
      consequence: hazard.consequence ?? '',
      existing_controls: hazard.existing_controls ?? '',
      control_types: hazard.control_types ?? [],
      likelihood:
        hazard.likelihood != null
          ? String(hazard.likelihood)
          : '',
      severity:
        hazard.severity != null ? String(hazard.severity) : '',
      additional_controls: hazard.additional_controls ?? '',
      residual_likelihood:
        hazard.residual_likelihood != null
          ? String(hazard.residual_likelihood)
          : '',
      residual_severity:
        hazard.residual_severity != null
          ? String(hazard.residual_severity)
          : '',
    }))

    setTitle(jha.title)
    setDescription(jha.description ?? '')
    setHazards(rows.length > 0 ? rows : [emptyHazard()])
    setEditingId(jha.id)
    setShowForm(true)
    setError('')
  }

  async function handleSave(): Promise<boolean> {
    if (editingId === null) {
      return handleCreate()
    }

    setError('')

    if (!title.trim()) {
      if (!embedded) setError('JHA title is required.')
      return false
    }

    const structuredHazards = hazards
      .filter((hazard) => hazard.hazard.trim().length > 0)
      .map((hazard) => ({
        hazard: hazard.hazard.trim(),
        hazard_category: hazard.hazard_category.trim() || null,
        consequence: hazard.consequence.trim() || null,
        existing_controls: hazard.existing_controls.trim() || null,
        control_types: hazard.control_types,
        likelihood: toNumber(hazard.likelihood),
        severity: toNumber(hazard.severity),
        additional_controls: hazard.additional_controls.trim() || null,
        residual_likelihood: toNumber(hazard.residual_likelihood),
        residual_severity: toNumber(hazard.residual_severity),
      }))

    if (structuredHazards.length === 0) {
      if (!embedded) {
        setError('Add at least one hazard with a description.')
      }
      return false
    }

    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/jha/${editingId}`,
        {
          method: 'PATCH',
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
        if (!embedded) {
          setError(result.error || 'Unable to update JHA.')
        }
        return false
      }

      setJhas((current) =>
        current.map((item) =>
          item.id === editingId
            ? {
                ...item,
                title: title.trim(),
                description: description.trim() || null,
              }
            : item
        )
      )

      setEditingId(null)
      setTitle('')
      setDescription('')
      setHazards([emptyHazard()])
      setShowForm(false)
      setUnsavedChanges(false)
      notifyPermitChanged()
      router.refresh()
      setSavedFlash('JHA updated successfully')
      return true
    } catch {
      if (!embedded) setError('Unable to update JHA.')
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (saveRef) {
      saveRef.current = handleSave
    }
  })

  useEffect(() => {
    onJhasChange?.(jhas.length)
  }, [jhas, onJhasChange])

  useEffect(() => {
    if (!savedFlash) return
    const timer = setTimeout(() => setSavedFlash(null), 4000)
    return () => clearTimeout(timer)
  }, [savedFlash])

  return (
    <section className={embedded ? '' : 'mt-6 rounded-xl border bg-background'}>
      {savedFlash && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          {savedFlash}
        </div>
      )}

      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <FileText className="h-5 w-5 text-blue-600" />
            JHA / HIRARC
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose one method: fill a JHA/HIRARC in the system{' '}
            <span className="font-medium">or</span> upload an
            existing HIRARC document.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <SectionVerifyButton
            verified={isVerified}
            canVerify={canVerify}
            onVerify={handleVerifyAll}
          />

          {satisfied && (
            <span className="text-xs text-muted-foreground">
              Method: {methodLabels.join(' + ')}
            </span>
          )}

          {canAdd && !showForm && !satisfied && (
            <Button
              onClick={() => setShowChoiceCards(true)}
              variant="outline"
              size="sm"
            >
              + Add JHA / HIRARC
            </Button>
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

      {/* Choice cards for method selection */}
      {showChoiceCards && !satisfied && (
        <div className="border-b p-6">
          <p className="text-sm font-medium mb-4">
            How would you like to provide the risk assessment?
          </p>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setShowChoiceCards(false)
                setShowForm(true)
              }}
              className="rounded-lg border-2 border-gray-200 p-6 text-left transition-all hover:border-blue-500 hover:shadow-md dark:border-gray-700 dark:hover:border-blue-400"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-lg">
                  Create JHA
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Complete the risk assessment directly in the system
                with structured hazard cards and risk ratings.
              </p>
              <span className="mt-4 inline-block text-sm font-medium text-blue-600 dark:text-blue-400">
                Create JHA →
              </span>
            </button>
            
            <button
              type="button"
              onClick={() => {
                if (!attachmentsEnabled) {
                  setUploadError(
                    isContractor
                      ? 'Attachments are available on Pro. This company is currently using the Free plan. Contact the company\u2019s Safety Manager to upgrade.'
                      : 'Attachments are available on Pro. This company is currently using the Free plan.'
                  )
                  return
                }
                fileInputRef.current?.click()
              }}
              disabled={uploading}
              className="rounded-lg border-2 border-gray-200 p-6 text-left transition-all hover:border-blue-500 hover:shadow-md disabled:opacity-50 dark:border-gray-700 dark:hover:border-blue-400"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/50">
                  {attachmentsEnabled ? (
                    <FileSpreadsheet className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <Lock className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                  )}
                </div>
                <h3 className="font-semibold text-lg">
                  Upload HIRARC
                </h3>
                {!attachmentsEnabled && (
                  <span className="rounded-md border border-gray-200 bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground dark:border-gray-700">
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {attachmentsEnabled
                  ? "Upload an existing HIRARC document from your company's safety management system."
                  : 'Uploading HIRARC documents is available on Pro.'}
              </p>
              <span className="mt-4 inline-block text-sm font-medium text-green-600 dark:text-green-400">
                {attachmentsEnabled
                  ? uploading
                    ? 'Uploading...'
                    : 'Upload HIRARC →'
                  : 'Available on Pro'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* JHA Editor Form */}
      {showForm && (
        <div className="space-y-6 border-b p-6">
          {/* Unsaved changes indicator */}
          {unsavedChanges && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300">
              <AlertTriangle className="h-4 w-4" />
              Unsaved changes
            </div>
          )}

          {/* JHA Details */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                JHA Title *
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
                Work Scope / Description
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

          {/* Risk Matrix Reference */}
          <div className="rounded-lg border bg-muted/20">
            <button
              type="button"
              onClick={() => setShowRiskMatrix(!showRiskMatrix)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Risk Matrix Reference
              </span>
              {showRiskMatrix ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            
            {showRiskMatrix && (
              <div className="border-t p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 text-left text-xs font-medium text-muted-foreground">
                          Likelihood ↓ / Severity →
                        </th>
                        <th className="p-2 text-xs font-medium">1</th>
                        <th className="p-2 text-xs font-medium">2</th>
                        <th className="p-2 text-xs font-medium">3</th>
                        <th className="p-2 text-xs font-medium">4</th>
                        <th className="p-2 text-xs font-medium">5</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RISK_MATRIX.map((row, i) => (
                        <tr key={i}>
                          <td className="p-2 text-xs font-medium">{i + 1}</td>
                          {row.map((value, j) => {
                            const band = riskBand(value)
                            return (
                              <td key={j} className="p-1">
                                <div
                                  className={cn(
                                    "rounded-md px-2 py-1 text-xs font-medium",
                                    band?.className
                                  )}
                                >
                                  {value}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RISK_BANDS.map((band) => (
                    <span
                      key={band.label}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        band.className
                      )}
                    >
                      {band.min}-{band.max} {band.label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Risk = Likelihood × Severity
                </p>
              </div>
            )}
          </div>

          {/* Hazard Cards */}
          <div className="space-y-4">
            {hazards.map((hazard, index) => (
              <HazardEditorCard
                key={index}
                hazard={hazard}
                index={index}
                onChange={(patch) => updateHazard(index, patch)}
                onRemove={() =>
                  setHazards((current) =>
                    current.filter((_, i) => i !== index)
                  )
                }
                canRemove={hazards.length > 1}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setHazards((current) => [
                ...current,
                emptyHazard(),
              ])
            }
            className="inline-flex items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Add Hazard
          </button>

          {error && (
            <p className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {editingId !== null && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingId(null)
                  setTitle('')
                  setDescription('')
                  setHazards([emptyHazard()])
                  setShowForm(false)
                  setUnsavedChanges(false)
                  setError('')
                }}
              >
                Cancel Edit
              </Button>
            )}

            <Button
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : editingId !== null
                ? 'Save Changes'
                : 'Save JHA'}
            </Button>
          </div>
        </div>
      )}

      {/* Saved JHA List */}
      <div className="divide-y">
        {jhas.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No JHA has been added to this permit.
          </p>
        ) : (
          jhas.map((jha) => (
            <JhaDisplayCard
              key={jha.id}
              jha={jha}
              canAdd={canAdd}
              canVerify={canVerify}
              permitId={permitId}
              expanded={expandedJha === jha.id}
              onToggleExpand={() =>
                setExpandedJha(
                  expandedJha === jha.id ? null : jha.id
                )
              }
              onEdit={() => handleEdit(jha)}
              onVerified={() =>
                setJhas((current) =>
                  current.map((item) =>
                    item.id === jha.id
                      ? { ...item, status: 'verified' as const }
                      : item
                  )
                )
              }
            />
          ))
        )}
      </div>

      {/* Uploaded HIRARC documents */}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!attachmentsEnabled) {
                  setUploadError(
                    isContractor
                      ? 'Attachments are available on Pro. This company is currently using the Free plan. Contact the company\u2019s Safety Manager to upgrade.'
                      : 'Attachments are available on Pro. This company is currently using the Free plan.'
                  )
                  return
                }
                fileInputRef.current?.click()
              }}
              disabled={uploading}
            >
              {attachmentsEnabled
                ? uploading
                  ? 'Uploading...'
                  : '+ Upload'
                : 'Pro'}
            </Button>
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
              <HirarcDocumentCard
                key={document.id}
                document={document}
                canDelete={canAdd}
                deleting={deletingId === document.id}
                onDownload={() => handleHirarcDownload(document)}
                onDelete={() => handleHirarcDelete(document)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* =========================================================
   HAZARD EDITOR CARD
   ========================================================= */

function HazardEditorCard({
  hazard,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  hazard: HazardDraft
  index: number
  onChange: (patch: Partial<HazardDraft>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const likelihood = toNumber(hazard.likelihood)
  const severity = toNumber(hazard.severity)
  const rating =
    likelihood !== null && severity !== null
      ? likelihood * severity
      : null
  const band = riskBand(rating)
  
  const residualLikelihood = toNumber(hazard.residual_likelihood)
  const residualSeverity = toNumber(hazard.residual_severity)
  const residualRating =
    residualLikelihood !== null && residualSeverity !== null
      ? residualLikelihood * residualSeverity
      : null
  const residualBand = riskBand(residualRating)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          Hazard {String(index + 1).padStart(2, '0')}
        </CardTitle>
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
            Remove
          </Button>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Hazard Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Hazard *
          </label>
          <input
            type="text"
            value={hazard.hazard}
            onChange={(e) => onChange({ hazard: e.target.value })}
            placeholder="Describe the hazard..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* Category and Control Hierarchy */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Category
            </label>
            <select
              value={hazard.hazard_category}
              onChange={(e) =>
                onChange({ hazard_category: e.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select category</option>
              {HAZARD_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Control Hierarchy
            </label>
            <select
              value={hazard.control_types[0] ?? ''}
              onChange={(e) =>
                onChange({
                  control_types: e.target.value
                    ? [e.target.value]
                    : [],
                })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select hierarchy</option>
              {CONTROL_TYPES.map((controlType) => (
                <option key={controlType} value={controlType}>
                  {controlType}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Consequence */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Consequence
          </label>
          <textarea
            value={hazard.consequence}
            onChange={(e) =>
              onChange({ consequence: e.target.value })
            }
            rows={2}
            placeholder="What could go wrong?"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* Existing Controls */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Existing Controls
          </label>
          <textarea
            value={hazard.existing_controls}
            onChange={(e) =>
              onChange({ existing_controls: e.target.value })
            }
            rows={2}
            placeholder="Controls currently in place..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* Initial Risk Assessment */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <h4 className="text-sm font-semibold mb-3">
            Initial Risk Assessment
          </h4>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                Likelihood (L)
              </label>
              <select
                value={hazard.likelihood}
                onChange={(e) =>
                  onChange({ likelihood: e.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                Severity (S)
              </label>
              <select
                value={hazard.severity}
                onChange={(e) =>
                  onChange({ severity: e.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {rating !== null && band && (
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2",
                band.className,
                band.borderColor
              )}
            >
              <span className="text-sm font-medium">
                Initial Risk
              </span>
              <span className="text-lg font-bold">
                {rating} · {band.label}
              </span>
            </div>
          )}
        </div>

        {/* Additional Controls */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Additional Controls
          </label>
          <textarea
            value={hazard.additional_controls}
            onChange={(e) =>
              onChange({ additional_controls: e.target.value })
            }
            rows={2}
            placeholder="Further controls to implement..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* Residual Risk Assessment */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <h4 className="text-sm font-semibold mb-3">
            Residual Risk Assessment
          </h4>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                Residual Likelihood (L)
              </label>
              <select
                value={hazard.residual_likelihood}
                onChange={(e) =>
                  onChange({
                    residual_likelihood: e.target.value,
                  })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                Residual Severity (S)
              </label>
              <select
                value={hazard.residual_severity}
                onChange={(e) =>
                  onChange({
                    residual_severity: e.target.value,
                  })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {residualRating !== null && residualBand && (
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2",
                residualBand.className,
                residualBand.borderColor
              )}
            >
              <span className="text-sm font-medium">
                Residual Risk
              </span>
              <span className="text-lg font-bold">
                {residualRating} · {residualBand.label}
              </span>
            </div>
          )}
        </div>

        {/* Risk Reduction Visual */}
        {rating !== null && residualRating !== null && (
          <div className="flex items-center justify-center gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">
                Initial
              </p>
              <p className={cn(
                "text-sm font-bold",
                band?.className
              )}>
                {rating} {band?.label}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-blue-500" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">
                Residual
              </p>
              <p className={cn(
                "text-sm font-bold",
                residualBand?.className
              )}>
                {residualRating} {residualBand?.label}
              </p>
            </div>
            <div className="ml-2 text-xs text-muted-foreground">
              Risk reduced by{' '}
              <span className="font-semibold text-green-600">
                {rating - residualRating} points
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* =========================================================
   JHA DISPLAY CARD
   ========================================================= */

function JhaDisplayCard({
  jha,
  canAdd,
  canVerify,
  permitId,
  expanded,
  onToggleExpand,
  onEdit,
  onVerified,
}: {
  jha: Jha
  canAdd: boolean
  canVerify: boolean
  permitId: number
  expanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onVerified?: () => void
}) {
  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-2 text-left hover:underline"
          >
            <h3 className="font-medium">
              {jha.title}
            </h3>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          
          <p className="mt-1 text-xs text-muted-foreground">
            Added by {jha.creator?.full_name ?? 'Unknown'}
            {' · '}
            {formatDate(jha.created_at)}
          </p>
          
          {/* Summary stats */}
          {jha.hazards && jha.hazards.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              <Badge variant="secondary">
                {jha.hazards.length} hazards
              </Badge>
              {getHighestRisk(jha.hazards, 'initial') && (
                <Badge variant="warning">
                  Highest initial: {getHighestRisk(jha.hazards, 'initial')}
                </Badge>
              )}
              {getHighestRisk(jha.hazards, 'residual') && (
                <Badge variant="success">
                  Highest residual: {getHighestRisk(jha.hazards, 'residual')}
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canAdd && jha.status === 'pending' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}

          <SafetyStatusPill status={jha.status} />
        </div>
      </div>

      {/* Expanded hazard list */}
      {expanded && jha.hazards && jha.hazards.length > 0 && (
        <div className="mt-4 space-y-3">
          {jha.hazards.map((hazard, index) => (
            <HazardDisplayCard
              key={hazard.id}
              hazard={hazard}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Verification */}
      {jha.status === 'verified' && (
        <div className="mt-4">
          <SafetyStatusPill status="verified" />
        </div>
      )}

      {canVerify && jha.status === 'pending' && (
        <div className="mt-4">
          <VerifySafetyDocButton
            permitId={permitId}
            kind="jha"
            docId={jha.id}
            onVerified={onVerified}
          />
        </div>
      )}
    </div>
  )
}

/* =========================================================
   HAZARD DISPLAY CARD
   ========================================================= */

function HazardDisplayCard({
  hazard,
  index,
}: {
  hazard: JhaHazard
  index: number
}) {
  const band = riskBand(hazard.risk_rating)
  const residualBand = riskBand(hazard.residual_risk)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Hazard {String(index + 1).padStart(2, '0')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {hazard.hazard}
          </p>
          {hazard.hazard_category && (
            <Badge variant="secondary" className="mt-1">
              {hazard.hazard_category}
            </Badge>
          )}
        </div>

        {hazard.consequence && (
          <div className="text-sm">
            <p className="text-xs text-muted-foreground mb-1">
              Consequence
            </p>
            <p>{hazard.consequence}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {hazard.existing_controls && (
            <div className="text-sm">
              <p className="text-xs text-muted-foreground mb-1">
                Existing Controls
              </p>
              <p>{hazard.existing_controls}</p>
            </div>
          )}
          
          {hazard.additional_controls && (
            <div className="text-sm">
              <p className="text-xs text-muted-foreground mb-1">
                Additional Controls
              </p>
              <p>{hazard.additional_controls}</p>
            </div>
          )}
        </div>

        {/* Risk comparison */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className={cn(
              "rounded-lg border p-3",
              band?.className,
              band?.borderColor
            )}
          >
            <p className="text-xs font-medium mb-1">
              Initial Risk
            </p>
            <p className="text-lg font-bold">
              {hazard.risk_rating ?? '—'}
              {band && (
                <span className="ml-1 text-xs font-medium">
                  {band.label}
                </span>
              )}
            </p>
          </div>
          
          <div
            className={cn(
              "rounded-lg border p-3",
              residualBand?.className,
              residualBand?.borderColor
            )}
          >
            <p className="text-xs font-medium mb-1">
              Residual Risk
            </p>
            <p className="text-lg font-bold">
              {hazard.residual_risk ?? '—'}
              {residualBand && (
                <span className="ml-1 text-xs font-medium">
                  {residualBand.label}
                </span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* =========================================================
   HIRARC DOCUMENT CARD
   ========================================================= */

function HirarcDocumentCard({
  document,
  canDelete,
  deleting,
  onDownload,
  onDelete,
}: {
  document: HirarcDocument
  canDelete: boolean
  deleting: boolean
  onDownload: () => void
  onDelete: () => void
}) {
  const fileIcon = getFileIcon(document.filename)
  
  return (
    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md border text-lg">
          {fileIcon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {document.filename}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Uploaded by {document.uploader?.full_name ?? 'Unknown'}
            {' · '}
            {formatDate(document.created_at)}
            {document.size_bytes
              ? ` · ${formatBytes(document.size_bytes)}`
              : ''}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>

        {canDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={onDelete}
                disabled={deleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleting ? 'Deleting...' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */


function getHighestRisk(
  hazards: JhaHazard[],
  type: 'initial' | 'residual'
): string | null {
  const risks = hazards
    .map((h) =>
      type === 'initial' ? h.risk_rating : h.residual_risk
    )
    .filter((r): r is number => r !== null)
  
  if (risks.length === 0) return null
  
  const highest = Math.max(...risks)
  const band = riskBand(highest)
  return `${highest} ${band?.label ?? ''}`
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  
  switch (ext) {
    case 'pdf':
      return '📕'
    case 'doc':
    case 'docx':
      return '📘'
    case 'xls':
    case 'xlsx':
      return '📗'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return '🖼️'
    default:
      return '📄'
  }
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
