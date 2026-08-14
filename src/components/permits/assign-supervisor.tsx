'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Supervisor = {
  id: string
  full_name: string
  employee_no: string | null
  department: string | null
}

export function AssignSupervisor({
  permitId,
  currentSupervisorId,
}: {
  permitId: number
  currentSupervisorId: string | null
}) {
  const router = useRouter()
  const supabase = createClient()

  const [supervisors, setSupervisors] = useState<
    Supervisor[]
  >([])
  const [supervisorId, setSupervisorId] = useState(
    currentSupervisorId ?? ''
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadSupervisors() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, full_name, employee_no, department'
        )
        .eq('role', 'supervisor')
        .eq('is_active', true)
        .order('full_name')

      if (error) {
        setError(error.message)
      } else {
        setSupervisors(data ?? [])
      }

      setLoading(false)
    }

    loadSupervisors()
  }, [supabase])

  async function handleAssign() {
    if (!supervisorId) {
      setError('Please select a supervisor')
      return
    }

    setError('')
    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/assign-approval`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            supervisor_id: supervisorId,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error ||
            'Failed to assign supervisor'
        )
        return
      }

      router.refresh()
    } catch {
      setError(
        'Unable to assign supervisor'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading supervisors...
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="supervisor"
          className="text-sm font-medium"
        >
          Supervisor
        </label>

        <select
          id="supervisor"
          value={supervisorId}
          onChange={(event) =>
            setSupervisorId(event.target.value)
          }
          disabled={saving}
          className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">
            Select supervisor
          </option>

          {supervisors.map((supervisor) => (
            <option
              key={supervisor.id}
              value={supervisor.id}
            >
              {supervisor.full_name}
              {supervisor.employee_no
                ? ` (${supervisor.employee_no})`
                : ''}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleAssign}
        disabled={saving || !supervisorId}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving
          ? 'Assigning...'
          : currentSupervisorId
            ? 'Reassign Supervisor'
            : 'Assign Supervisor'}
      </button>

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
