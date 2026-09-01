'use client'

import { useState } from 'react'
import { 
  UserCheck, 
  Eye, 
  HardHat, 
  AlertTriangle,
  CheckCircle2,
  Info,
  Users,
  Search
} from 'lucide-react'
import {
  CSE_RESPONSIBILITIES,
  type CseResponsibility,
} from '@/lib/specialised-permit'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type CsePersonnelDraft = {
  worker_index: number
  responsibility: CseResponsibility
}

type WorkerOption = {
  index: number
  full_name: string
}

const ROLE_CONFIG = {
  entry_supervisor: {
    icon: UserCheck,
    label: 'Entry Supervisor',
    description: 'Supervises the confined-space entry and permit conditions.',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    iconBg: 'bg-red-100 dark:bg-red-900/50',
  },
  standby_attendant: {
    icon: Eye,
    label: 'Standby Attendant',
    description: 'Remains outside the space and monitors entrants continuously.',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    iconBg: 'bg-orange-100 dark:bg-orange-900/50',
  },
  authorised_entrant: {
    icon: HardHat,
    label: 'Authorised Entrants',
    description: 'Workers permitted to enter the confined space.',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
  },
} as const

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
  const [workerSearch, setWorkerSearch] = useState('')
  const [showConflict, setShowConflict] = useState(false)

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
    
    // Check for conflicts
    const conflicts = findConflicts(next)
    setShowConflict(conflicts.length > 0)
    
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
    
    const newValue = [
      ...value.filter(
        (item) => item.responsibility !== 'authorised_entrant'
      ),
      ...[...next].map((index) => ({
        worker_index: index,
        responsibility: 'authorised_entrant' as CseResponsibility,
      })),
    ]
    
    // Check for conflicts
    const conflicts = findConflicts(newValue)
    setShowConflict(conflicts.length > 0)
    
    onChange(newValue)
  }

  function findConflicts(assignments: CsePersonnelDraft[]): Array<{
    workerName: string
    roles: CseResponsibility[]
  }> {
    const conflicts: Array<{
      workerName: string
      roles: CseResponsibility[]
    }> = []
    
    // Group assignments by worker
    const byWorker = new Map<number, CseResponsibility[]>()
    assignments.forEach((assignment) => {
      const roles = byWorker.get(assignment.worker_index) || []
      roles.push(assignment.responsibility)
      byWorker.set(assignment.worker_index, roles)
    })
    
    // Check if any worker has multiple single-person roles
    byWorker.forEach((roles, workerIndex) => {
      const singlePersonRoles = roles.filter(
        role => role === 'entry_supervisor' || role === 'standby_attendant'
      )
      if (singlePersonRoles.length > 1) {
        const worker = workers.find(w => w.index === workerIndex)
        conflicts.push({
          workerName: worker?.full_name || 'Unknown worker',
          roles: singlePersonRoles,
        })
      }
    })
    
    return conflicts
  }

  if (workers.length === 0) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center dark:border-yellow-800 dark:bg-yellow-950/30">
        <Users className="mx-auto h-12 w-12 text-yellow-600 mb-3" />
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          No permit workers available
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          Add workers to this permit before assigning CSE responsibilities.
        </p>
        <button
          type="button"
          onClick={() => {
            // Scroll to workers section
            document.getElementById('workers-section')?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
          }}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Add Workers
          <HardHat className="h-4 w-4" />
        </button>
      </div>
    )
  }

  const filteredWorkers = workers.filter(worker =>
    worker.full_name.toLowerCase().includes(workerSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Role assignment cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Entry Supervisor */}
        <RoleAssignmentCard
          config={ROLE_CONFIG.entry_supervisor}
          current={byResponsibility('entry_supervisor')}
          workers={workers}
          disabled={disabled}
          required={true}
          onSelect={(workerIndex) =>
            setResponsibility('entry_supervisor', workerIndex)
          }
        />

        {/* Standby Attendant */}
        <RoleAssignmentCard
          config={ROLE_CONFIG.standby_attendant}
          current={byResponsibility('standby_attendant')}
          workers={workers}
          disabled={disabled}
          required={true}
          onSelect={(workerIndex) =>
            setResponsibility('standby_attendant', workerIndex)
          }
        />
      </div>

      {/* Authorised Entrants */}
      <div className={cn(
        "rounded-lg border p-4",
        ROLE_CONFIG.authorised_entrant.borderColor,
        ROLE_CONFIG.authorised_entrant.bgColor
      )}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className={cn(
              "rounded-lg p-2",
              ROLE_CONFIG.authorised_entrant.iconBg
            )}>
              <HardHat className={cn(
                "h-5 w-5",
                ROLE_CONFIG.authorised_entrant.color
              )} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Authorised Entrants
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ROLE_CONFIG.authorised_entrant.description}
              </p>
            </div>
          </div>
          <Badge variant={entrantIndexes.length > 0 ? "success" : "secondary"}>
            {entrantIndexes.length} selected
          </Badge>
        </div>

        {/* Worker search */}
        {workers.length > 8 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={workerSearch}
              onChange={(e) => setWorkerSearch(e.target.value)}
              placeholder="Search workers..."
              className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm"
              disabled={disabled}
            />
          </div>
        )}

        {/* Worker pills */}
        <div className="flex flex-wrap gap-2">
          {filteredWorkers.map((worker) => {
            const checked = entrantIndexes.includes(worker.index)
            return (
              <button
                key={worker.index}
                type="button"
                disabled={disabled}
                onClick={() => toggleEntrant(worker.index)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",
                  checked
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:hover:border-blue-500 dark:hover:bg-blue-950/30",
                  disabled && "opacity-60 cursor-not-allowed"
                )}
              >
                {checked ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <HardHat className="h-4 w-4" />
                )}
                {worker.full_name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Conflict warning */}
      {showConflict && (
        <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                Role assignment conflict
              </p>
              {findConflicts(value).map((conflict, index) => (
                <div key={index} className="text-sm text-red-600 dark:text-red-400">
                  <p className="font-medium">{conflict.workerName}</p>
                  <p>Cannot be assigned to both:</p>
                  <ul className="mt-1 space-y-0.5">
                    {conflict.roles.map(role => (
                      <li key={role} className="flex items-center gap-2">
                        • {ROLE_CONFIG[role as keyof typeof ROLE_CONFIG]?.label || role}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                Select different workers for each role.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Role assignments follow your company&apos;s separation-of-duty rules.
          Only workers listed on this permit can be assigned.
        </p>
      </div>
    </div>
  )
}

/* =========================================================
   ROLE ASSIGNMENT CARD
   ========================================================= */

function RoleAssignmentCard({
  config,
  current,
  workers,
  disabled,
  required,
  onSelect,
}: {
  config: {
    icon: any
    label: string
    description: string
    color: string
    bgColor: string
    borderColor: string
    iconBg: string
  }
  current?: CsePersonnelDraft
  workers: WorkerOption[]
  disabled?: boolean
  required?: boolean
  onSelect: (workerIndex: number | null) => void
}) {
  const Icon = config.icon
  const selectedWorker = current !== undefined
    ? workers.find(w => w.index === current.worker_index)
    : null

  return (
    <div className={cn(
      "rounded-lg border p-4",
      config.borderColor,
      config.bgColor
    )}>
      <div className="flex items-start gap-3 mb-3">
        <div className={cn(
          "rounded-lg p-2",
          config.iconBg
        )}>
          <Icon className={cn("h-5 w-5", config.color)} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {config.label}
            </h4>
            {required && (
              <span className="text-red-500">*</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {config.description}
          </p>
        </div>
      </div>

      {selectedWorker ? (
        <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <div className={cn(
            "rounded-full p-2",
            config.iconBg
          )}>
            <Icon className={cn("h-4 w-4", config.color)} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {selectedWorker.full_name}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              ✓ Assigned
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Change
            </button>
          )}
        </div>
      ) : (
        <select
          value=""
          disabled={disabled}
          onChange={(event) =>
            onSelect(
              event.target.value === ''
                ? null
                : Number(event.target.value)
            )
          }
          className={cn(
            "w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-gray-800",
            disabled ? "opacity-60" : "",
            "border-gray-300 dark:border-gray-600"
          )}
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
      )}
    </div>
  )
}
