'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifyPermitChanged } from '@/lib/permit-changed'
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

/**
 * Read-only display + inline editing of the specialised permit-type details
 * on the permit detail page. Editing uses the dedicated PATCH endpoints
 * (special-details / cse-personnel) and is only available while the permit
 * is draft or pending approval.
 */
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
  const [savingDetails, setSavingDetails] = useState(false)
  const [savingPersonnel, setSavingPersonnel] = useState(false)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)

  const hasSpecialisedCode =
    code === 'HOT' || code === 'CSE' || code === 'WAH' || code === 'ELEC'

  async function handleSaveDetails() {
    setError('')
    setSavingDetails(true)
    try {
      const response = await fetch(
        `/api/permits/${permitId}/special-details`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ special_details: details }),
        }
      )
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Unable to save specialised details.')
        return
      }
      setEditMode(false)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to save specialised details.')
    } finally {
      setSavingDetails(false)
    }
  }

  async function handleSavePersonnel() {
    setError('')
    setSavingPersonnel(true)
    try {
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

      const response = await fetch(
        `/api/permits/${permitId}/cse-personnel`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignments }),
        }
      )
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Unable to save CSE personnel.')
        return
      }
      setEditMode(false)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to save CSE personnel.')
    } finally {
      setSavingPersonnel(false)
    }
  }

  if (!hasSpecialisedCode) {
    return null
  }

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">
            {code === 'HOT'
              ? 'Hot Work Details'
              : code === 'CSE'
                ? 'Confined Space Details'
                : code === 'WAH'
                  ? 'Work at Height Details'
                  : 'Electrical Work Details'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Permit-specific information for this permit type.
          </p>
        </div>

        {canEdit && !editMode && (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Edit
          </button>
        )}
      </div>

      <div className="p-6">
        <SpecialisedDetailsFields
          code={code}
          value={details}
          onChange={setDetails}
          disabled={!editMode || !canEdit}
        />

        {code === 'CSE' && (
          <div className="mt-6 border-t pt-6">
            <h3 className="text-sm font-semibold">
              Confined Space Personnel
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Permit-level responsibilities assigned from the workers listed
              on this permit.
            </p>

            <div className="mt-4">
              <CsePersonnelEditor
                workers={initialWorkers.map((worker, index) => ({
                  index,
                  full_name: worker.full_name,
                }))}
                value={personnel}
                onChange={setPersonnel}
                disabled={!editMode || !canEdit}
              />
            </div>
          </div>
        )}

        {canEdit && editMode && (
          <>
            {error && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditMode(false)
                  setError('')
                }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveDetails}
                disabled={savingDetails || savingPersonnel}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingDetails ? 'Saving...' : 'Save Details'}
              </button>

              {code === 'CSE' && (
                <button
                  type="button"
                  onClick={handleSavePersonnel}
                  disabled={savingDetails || savingPersonnel}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingPersonnel
                    ? 'Saving...'
                    : 'Save Personnel'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
