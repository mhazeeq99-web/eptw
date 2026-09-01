'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Flame, 
  AlertTriangle, 
  ArrowUp, 
  Zap, 
  CheckCircle2,
  Edit,
  X,
  Users,
  UserCheck,
  HardHat,
  Eye,
  Save,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  SpecialisedDetailsFields,
  type SpecialDetailsState,
} from './specialised-details-fields'
import {
  CsePersonnelEditor,
  type CsePersonnelDraft,
} from './cse-personnel-editor'

export type DetailWorker = {
  id: number
  full_name: string
}

export type CsePersonnelRow = {
  id: number
  worker_id: number
  responsibility: string
}

const PERMIT_TYPE_CONFIG = {
  HOT: {
    icon: Flame,
    title: 'Hot Work Requirements',
    description: 'Controls and requirements for hot work activities.',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    iconBg: 'bg-orange-100 dark:bg-orange-900/50',
  },
  CSE: {
    icon: AlertTriangle,
    title: 'Confined Space Requirements',
    description: 'Entry, atmospheric and standby requirements for confined-space work.',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    iconBg: 'bg-red-100 dark:bg-red-900/50',
  },
  WAH: {
    icon: ArrowUp,
    title: 'Work at Height Requirements',
    description: 'Fall-protection and work-at-height requirements.',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
  },
  ELEC: {
    icon: Zap,
    title: 'Electrical Work Requirements',
    description: 'Electrical isolation and work-control requirements.',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/50',
  },
} as const

export function SpecialisedPermitSection({
  permitId,
  code,
  initialDetails,
  initialWorkers,
  initialPersonnel,
  canEdit,
}: {
  permitId: number
  code: string | null
  initialDetails: Record<string, unknown> | null
  initialWorkers: DetailWorker[]
  initialPersonnel: CsePersonnelRow[]
  canEdit: boolean
}) {
  const router = useRouter()

  const [details, setDetails] = useState<SpecialDetailsState>(
    initialDetails ?? {}
  )
  const [personnel, setPersonnel] = useState<CsePersonnelDraft[]>(
    () => {
      const workerIds = initialWorkers.map((worker) => worker.id)
      return initialPersonnel
        .map((assignment) => ({
          worker_index: workerIds.indexOf(assignment.worker_id),
          responsibility: assignment.responsibility as
            | 'entry_supervisor'
            | 'standby_attendant'
            | 'authorised_entrant',
        }))
        .filter((item) => item.worker_index >= 0)
    }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [showDetails, setShowDetails] = useState(true)
  const [showPersonnel, setShowPersonnel] = useState(true)
  const [savedFlash, setSavedFlash] = useState(false)

  const hasSpecialisedCode =
    code === 'HOT' || code === 'CSE' || code === 'WAH' || code === 'ELEC'

  if (!hasSpecialisedCode || !code) {
    return null
  }

  const config = PERMIT_TYPE_CONFIG[code as keyof typeof PERMIT_TYPE_CONFIG]
  const Icon = config.icon

  // Calculate completion status
  const hasDetails = Object.keys(details).length > 0
  const hasPersonnel = code === 'CSE' ? personnel.length > 0 : true
  const isComplete = hasDetails && hasPersonnel

  async function handleSave() {
    setError('')
    setSaving(true)
    
    try {
      // Save details
      const detailsResponse = await fetch(
        `/api/permits/${permitId}/special-details`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ special_details: details }),
        }
      )
      
      const detailsResult = await detailsResponse.json()
      if (!detailsResponse.ok) {
        setError(detailsResult.error || 'Unable to save specialised details.')
        return
      }

      // Save personnel if CSE
      if (code === 'CSE') {
        const assignments = personnel
          .map((item) => ({
            worker_id: initialWorkers[item.worker_index]?.id,
            responsibility: item.responsibility,
          }))
          .filter(
            (item): item is {
              worker_id: number
              responsibility:
                | 'entry_supervisor'
                | 'standby_attendant'
                | 'authorised_entrant'
            } =>
              item.worker_id !== undefined
          )

        const personnelResponse = await fetch(
          `/api/permits/${permitId}/cse-personnel`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignments }),
          }
        )
        
        const personnelResult = await personnelResponse.json()
        if (!personnelResponse.ok) {
          setError(personnelResult.error || 'Unable to save CSE personnel.')
          return
        }
      }

      setEditMode(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 4000)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to save changes.')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    // Check for unsaved changes
    const hasChanges = Object.keys(details).length > 0 || personnel.length > 0
    if (hasChanges) {
      const confirmed = window.confirm(
        'Discard changes? Your edits will be lost.'
      )
      if (!confirmed) return
    }
    setEditMode(false)
    setError('')
  }

  return (
    <section className={cn(
      "mt-6 rounded-xl border-2 bg-background",
      config.borderColor
    )}>
      {savedFlash && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          Changes saved successfully
        </div>
      )}

      {/* Header */}
      <div className={cn(
        "flex items-center justify-between border-b px-6 py-4",
        config.bgColor
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "rounded-lg p-2",
            config.iconBg
          )}>
            <Icon className={cn("h-6 w-6", config.color)} />
          </div>
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-lg">
              {config.title}
              {editMode && (
                <Badge variant="warning">Editing</Badge>
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {config.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CompletionBadge 
            isComplete={isComplete}
            hasDetails={hasDetails}
            hasPersonnel={hasPersonnel}
          />
          {canEdit && !editMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(true)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Requirements
            </Button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Read-only summary view */}
        {!editMode ? (
          <ReadOnlySummary
            code={code}
            details={details}
            personnel={personnel}
            workers={initialWorkers}
          />
        ) : (
          /* Edit mode */
          <>
            {/* Details Section */}
            <div>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center justify-between w-full mb-3"
              >
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Requirements Details
                </h3>
                {showDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              
              {showDetails && (
                <SpecialisedDetailsFields
                  code={code}
                  value={details}
                  onChange={setDetails}
                  disabled={false}
                />
              )}
            </div>

            {/* CSE Personnel Section */}
            {code === 'CSE' && (
              <div className="border-t pt-6">
                <button
                  type="button"
                  onClick={() => setShowPersonnel(!showPersonnel)}
                  className="flex items-center justify-between w-full mb-3"
                >
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <Users className="h-4 w-4 text-red-600" />
                    Personnel & Responsibilities
                  </h3>
                  {showPersonnel ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                
                {showPersonnel && (
                  <CsePersonnelEditor
                    workers={initialWorkers.map((worker, index) => ({
                      index,
                      full_name: worker.full_name,
                    }))}
                    value={personnel}
                    onChange={setPersonnel}
                    disabled={false}
                  />
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>

              <Button
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/* =========================================================
   READ-ONLY SUMMARY
   ========================================================= */

function ReadOnlySummary({
  code,
  details,
  personnel,
  workers,
}: {
  code: string
  details: SpecialDetailsState
  personnel: CsePersonnelDraft[]
  workers: DetailWorker[]
}) {
  const detailEntries = Object.entries(details)
  
  return (
    <div className="space-y-6">
      {/* Details summary */}
      {detailEntries.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Requirements Summary
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {detailEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">
                  {formatFieldLabel(key)}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {formatFieldValue(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <AlertTriangle className="mx-auto h-12 w-12 text-yellow-600 mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            No requirements recorded
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Edit to add {code} specific requirements
          </p>
        </div>
      )}

      {/* CSE Personnel summary */}
      {code === 'CSE' && (
        <div className="border-t pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Personnel & Responsibilities
          </h3>
          
          <div className="space-y-3">
            {personnel.length > 0 ? (
              personnel.map((assignment, index) => {
                const worker = workers[assignment.worker_index]
                return (
                  <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className={cn(
                      "rounded-full p-2",
                      assignment.responsibility === 'entry_supervisor'
                        ? "bg-red-100 dark:bg-red-900/50"
                        : assignment.responsibility === 'standby_attendant'
                          ? "bg-orange-100 dark:bg-orange-900/50"
                          : "bg-blue-100 dark:bg-blue-900/50"
                    )}>
                      {assignment.responsibility === 'entry_supervisor' ? (
                        <UserCheck className="h-5 w-5 text-red-600" />
                      ) : assignment.responsibility === 'standby_attendant' ? (
                        <Eye className="h-5 w-5 text-orange-600" />
                      ) : (
                        <HardHat className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        {formatResponsibility(assignment.responsibility)}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {worker?.full_name || 'Unassigned'}
                      </p>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-6">
                <Users className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No personnel assigned
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================
   COMPLETION BADGE
   ========================================================= */

function CompletionBadge({
  isComplete,
  hasDetails,
  hasPersonnel,
}: {
  isComplete: boolean
  hasDetails: boolean
  hasPersonnel: boolean
}) {
  if (isComplete) {
    return (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Complete
      </Badge>
    )
  }
  
  return (
    <Badge variant="warning">
      <AlertTriangle className="mr-1 h-3 w-3" />
      Incomplete
    </Badge>
  )
}

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  return String(value)
}

function formatResponsibility(responsibility: string): string {
  switch (responsibility) {
    case 'entry_supervisor':
      return 'Entry Supervisor'
    case 'standby_attendant':
      return 'Standby Attendant'
    case 'authorised_entrant':
      return 'Authorised Entrant'
    default:
      return responsibility.replace(/_/g, ' ')
  }
}
