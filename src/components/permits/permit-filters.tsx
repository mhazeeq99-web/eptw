'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

export type FilterOptions = {
  permitTypes: Array<{ id: number; name: string }>
  areas: Array<{ id: number; name: string }>
  contractors: Array<{ id: number; company_name: string }>
}

export function PermitFilters({
  options,
}: {
  options: FilterOptions
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [status, setStatus] = useState(
    searchParams.get('status') ?? ''
  )
  const [permitTypeId, setPermitTypeId] = useState(
    searchParams.get('permit_type_id') ?? ''
  )
  const [areaId, setAreaId] = useState(
    searchParams.get('area_id') ?? ''
  )
  const [contractorId, setContractorId] = useState(
    searchParams.get('contractor_id') ?? ''
  )
  const [requester, setRequester] = useState(
    searchParams.get('requester') ?? ''
  )
  const [dateFrom, setDateFrom] = useState(
    searchParams.get('date_from') ?? ''
  )
  const [dateTo, setDateTo] = useState(
    searchParams.get('date_to') ?? ''
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const params = new URLSearchParams()

    if (q.trim()) params.set('q', q.trim())
    if (status) params.set('status', status)
    if (permitTypeId)
      params.set('permit_type_id', permitTypeId)
    if (areaId) params.set('area_id', areaId)
    if (contractorId)
      params.set('contractor_id', contractorId)
    if (requester.trim())
      params.set('requester', requester.trim())
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    const queryString = params.toString()

    router.push(queryString ? `/permits?${queryString}` : '/permits')
    router.refresh()
  }

  function handleClear() {
    setQ('')
    setStatus('')
    setPermitTypeId('')
    setAreaId('')
    setContractorId('')
    setRequester('')
    setDateFrom('')
    setDateTo('')
    router.push('/permits')
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border bg-background p-4"
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Permit no. or work title..."
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {[
            'draft',
            'pending_approval',
            'active',
            'suspended',
            'completed',
            'closed',
            'rejected',
            'cancelled',
          ].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>

        <select
          value={permitTypeId}
          onChange={(event) =>
            setPermitTypeId(event.target.value)
          }
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All permit types</option>
          {options.permitTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        <select
          value={areaId}
          onChange={(event) => setAreaId(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All areas</option>
          {options.areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>

        <select
          value={contractorId}
          onChange={(event) =>
            setContractorId(event.target.value)
          }
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All contractors</option>
          {options.contractors.map((contractor) => (
            <option key={contractor.id} value={contractor.id}>
              {contractor.company_name}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={requester}
          onChange={(event) =>
            setRequester(event.target.value)
          }
          placeholder="Requester name..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />

        <input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="Planned from"
        />

        <input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="Planned to"
        />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Clear
        </button>

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Apply Filters
        </button>
      </div>
    </form>
  )
}
