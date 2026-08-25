'use client'

import {
  CSE_RESPONSIBILITIES,
  type CseResponsibility,
} from '@/lib/specialised-permit'

export type CsePersonnelDraft = {
  worker_index: number
  responsibility: CseResponsibility
}

type WorkerOption = {
  index: number
  full_name: string
}

/**
 * CSE personnel assignment editor. Responsibilities reference workers by
 * their index in the permit's worker list (the workers already exist in
 * permit_workers — no separate CSE worker database). Separation-of-duty is
 * validated server-side against the company policy.
 */
export function CsePersonnelEditor({
  workers,
  value,
  onChange,
  disabled,
}: {
  workers: WorkerOption[]
  value: CsePersonnelDraft[]
  onChange: (value: CsePersonnelDraft[]) => void
  disabled?: boolean
}) {
  const byResponsibility = (responsibility: CseResponsibility) =>
    value.find((item) => item.responsibility === responsibility)

  const setResponsibility = (
    responsibility: CseResponsibility,
    workerIndex: number | null
  ) => {
    const next = value.filter(
      (item) => item.responsibility !== responsibility
    )
    if (workerIndex !== null) {
      next.push({ worker_index: workerIndex, responsibility })
    }
    onChange(next)
  }

  const entrantIndexes = value
    .filter((item) => item.responsibility === 'authorised_entrant')
    .map((item) => item.worker_index)

  const toggleEntrant = (workerIndex: number) => {
    const next = new Set(entrantIndexes)
    if (next.has(workerIndex)) {
      next.delete(workerIndex)
    } else {
      next.add(workerIndex)
    }
    onChange([
      ...value.filter(
        (item) => item.responsibility !== 'authorised_entrant'
      ),
      ...[...next].map((index) => ({
        worker_index: index,
        responsibility: 'authorised_entrant' as CseResponsibility,
      })),
    ])
  }

  if (workers.length === 0) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        CSE personnel must be assigned from the permit&apos;s worker list. Add at
        least one worker to this permit before assigning responsibilities.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {(['entry_supervisor', 'standby_attendant'] as const).map(
          (responsibility) => {
            const current = byResponsibility(responsibility)
            const label =
              responsibility === 'entry_supervisor'
                ? 'Entry Supervisor'
                : 'Standby / Attendant'
            return (
              <div key={responsibility} className="space-y-2">
                <label className="text-sm font-medium">{label}</label>
                <select
                  value={current ? String(current.worker_index) : ''}
                  disabled={disabled}
                  onChange={(event) =>
                    setResponsibility(
                      responsibility,
                      event.target.value === ''
                        ? null
                        : Number(event.target.value)
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">Select worker</option>
                  {workers.map((worker) => (
                    <option
                      key={worker.index}
                      value={String(worker.index)}
                    >
                      {worker.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )
          }
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Authorised Entrants</p>
        <div className="flex flex-wrap gap-2">
          {workers.map((worker) => {
            const checked = entrantIndexes.includes(worker.index)
            return (
              <button
                key={worker.index}
                type="button"
                disabled={disabled}
                onClick={() => toggleEntrant(worker.index)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  checked
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {checked ? '✓ ' : ''}
                {worker.full_name}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Responsibilities are for this permit only. Separation of duties
        (a worker holding multiple responsibilities) is enforced according
        to the company&apos;s configuration.
      </p>
    </div>
  )
}

export { CSE_RESPONSIBILITIES }
