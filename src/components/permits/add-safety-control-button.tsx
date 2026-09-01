'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { notifyPermitChanged } from '@/lib/permit-changed'

type CatalogueControl = {
  id: number
  code: string | null
  name: string
  description: string | null
  category: string | null
}

/**
 * "Add safety control" picker shown to safety verifiers (SM/SC) while a
 * permit is a draft / pending approval. Lets the verifier pull in any active
 * catalogue control that is not already on the permit, so they are never stuck
 * when the contractor left controls unticked or the permit has none configured.
 * The added control becomes a required, pending control that the verifier then
 * verifies via the normal Verify button.
 */
export function AddSafetyControlButton({
  permitId,
  canAdd,
}: {
  permitId: number
  canAdd: boolean
}) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [controls, setControls] = useState<CatalogueControl[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function loadCatalogue() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/permits/${permitId}/safety-controls`
      )
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Unable to load safety controls.')
        setControls([])
        return
      }
      setControls(result.safety_controls ?? [])
    } catch {
      setError('Unable to load safety controls.')
      setControls([])
    } finally {
      setLoading(false)
    }
  }

  async function addControl(controlId: number) {
    setAdding(true)
    setError('')
    try {
      const response = await fetch(
        `/api/permits/${permitId}/safety-controls`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ safety_control_id: controlId }),
        }
      )
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Unable to add the safety control.')
        setAdding(false)
        return
      }
      setOpen(false)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to add the safety control.')
    } finally {
      setAdding(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadCatalogue()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, permitId])

  if (!canAdd) {
    return null
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Safety Control
        </button>
      ) : (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">
            Add a safety control to this permit
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            It will be added as a required control that you then verify.
          </p>

          {loading ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Loading safety controls...
            </p>
          ) : controls.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No additional safety controls available.
            </p>
          ) : (
            <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto">
              {controls.map((control) => (
                <button
                  key={control.id}
                  type="button"
                  disabled={adding}
                  onClick={() => addControl(control.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span>
                    <span className="font-medium">
                      {control.name}
                    </span>
                    {control.category && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {control.category}
                      </span>
                    )}
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
