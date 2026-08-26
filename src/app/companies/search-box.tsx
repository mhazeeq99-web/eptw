'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

/**
 * Client search box for the Platform Admin Companies page.
 *
 * Submits the query as a `?q=` search param that the server component reads
 * and filters against server-side (name / code / SSM registration number).
 */
export function CompanySearchBox({
  defaultValue,
}: {
  defaultValue: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [value, setValue] = useState(defaultValue)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const params = new URLSearchParams(searchParams.toString())
    const q = value.trim()

    if (q) {
      params.set('q', q)
    } else {
      params.delete('q')
    }

    const queryString = params.toString()
    router.push(queryString ? `/companies?${queryString}` : '/companies')
    router.refresh()
  }

  function handleClear() {
    setValue('')
    router.push('/companies')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-full sm:w-80">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search name, code or SSM..."
        aria-label="Search companies"
        className="w-full rounded-md border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  )
}
