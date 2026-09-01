'use client'

import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WorkerDraft = {
  full_name: string
  id_number: string
  nationality?: string | null
  induction_completed?: boolean
}

const NATIONALITIES = [
  'Malaysian',
  'Indonesian',
  'Bangladeshi',
  'Nepali',
  'Indian',
  'Pakistani',
  'Filipino',
  'Myanmar',
  'Vietnamese',
  'Other',
]

/**
 * Structured multi-worker editor.
 * - internal   : name + employee ID
 * - contractor : name + NRIC/passport + nationality + safety induction
 * Free text is limited to the genuinely-necessary fields (name/ID/nationality).
 */
export function WorkerListEditor({
  mode,
  initial,
  onChange,
}: {
  mode: 'internal' | 'contractor'
  initial: WorkerDraft[]
  onChange: (workers: WorkerDraft[]) => void
}) {
  function update(index: number, patch: Partial<WorkerDraft>) {
    const next = initial.map((worker, i) =>
      i === index ? { ...worker, ...patch } : worker
    )
    onChange(next)
  }

  function remove(index: number) {
    onChange(initial.filter((_, i) => i !== index))
  }

  function add() {
    onChange([
      ...initial,
      {
        full_name: '',
        id_number: '',
        nationality: mode === 'contractor' ? 'Malaysian' : null,
        induction_completed: false,
      },
    ])
  }

  const idLabel =
    mode === 'contractor' ? 'NRIC / Passport' : 'Employee ID'

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">No.</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">{idLabel}</th>
              {mode === 'contractor' && (
                <th className="px-3 py-2 font-medium">Nationality</th>
              )}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td
                  colSpan={mode === 'contractor' ? 5 : 4}
                  className="px-3 py-4 text-center text-sm text-muted-foreground"
                >
                  No workers added yet.
                </td>
              </tr>
            )}
            {initial.map((worker, index) => (
              <tr key={index} className="border-b last:border-0">
                <td className="px-3 py-2 text-muted-foreground">
                  {index + 1}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={worker.full_name}
                    onChange={(event) =>
                      update(index, {
                        full_name: event.target.value,
                      })
                    }
                    placeholder="Worker name"
                    aria-label="Worker name"
                    className={cn(
                      "w-full rounded-md border bg-background px-2 py-1.5 text-sm",
                      worker.id_number.trim() && !worker.full_name.trim()
                        ? "border-destructive"
                        : "border-gray-300 dark:border-gray-600"
                    )}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={worker.id_number}
                    onChange={(event) =>
                      update(index, {
                        id_number: event.target.value,
                      })
                    }
                    placeholder={
                      mode === 'contractor'
                        ? 'e.g. 800101-14-5678 / A1234567'
                        : 'e.g. EMP-1024'
                    }
                    aria-label={idLabel}
                    className={cn(
                      "w-full rounded-md border bg-background px-2 py-1.5 text-sm",
                      worker.full_name.trim() && !worker.id_number.trim()
                        ? "border-destructive"
                        : "border-gray-300 dark:border-gray-600"
                    )}
                  />
                </td>
                {mode === 'contractor' && (
                  <td className="px-3 py-2">
                    <select
                      value={worker.nationality ?? 'Malaysian'}
                      onChange={(event) =>
                        update(index, {
                          nationality: event.target.value,
                        })
                      }
                      aria-label="Nationality"
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    >
                      {NATIONALITIES.map((nation) => (
                        <option key={nation} value={nation}>
                          {nation}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label="Remove worker"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <Plus className="h-4 w-4" />
        Add Worker
      </button>

      <p className="text-xs text-muted-foreground">
        Only workers listed and authorised under this permit may
        perform the work / enter the designated work area.
        {mode === 'contractor' && (
          <>
            {' '}
            NRIC / passport numbers are treated as sensitive personal
            information.
          </>
        )}
      </p>
    </div>
  )
}
