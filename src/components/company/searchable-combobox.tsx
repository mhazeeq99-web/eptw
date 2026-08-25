'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'

export type ComboboxOption = {
  /** Stable identifier (company id / contractor id). */
  id: number
  /** Primary display label (company legal name). */
  label: string
  /** Optional secondary identifier, e.g. 4-char company code. */
  code?: string | null
  /** Optional muted subtitle. */
  subtitle?: string | null
  /** Whether this option is already selected/authorized (shown but disabled). */
  disabled?: boolean
}

/**
 * Reusable searchable combobox. Searches server-side via `searchFn`.
 * Accessible, keyboard-navigable, responsive, with clear/loading/empty states.
 * This is a UI convenience only — server-side authorization / RLS remain
 * authoritative.
 */
export function SearchableCombobox({
  searchFn,
  value,
  onChange,
  placeholder = 'Search...',
  label,
  clearable = true,
  minQuery = 0,
}: {
  searchFn: (query: string) => Promise<ComboboxOption[]>
  value: ComboboxOption | null
  onChange: (option: ComboboxOption | null) => void
  placeholder?: string
  label?: string
  clearable?: boolean
  /** Minimum characters before searching (0 = fetch all on focus). */
  minQuery?: number
}) {
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ComboboxOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [highlighted, setHighlighted] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)

  async function runSearch(q: string) {
    setLoading(true)
    setError('')
    try {
      const results = await searchFn(q)
      setOptions(results ?? [])
    } catch {
      setError('Unable to search.')
      setOptions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length >= minQuery) {
      const t = setTimeout(() => runSearch(trimmed), 250)
      return () => clearTimeout(t)
    }
    setOptions([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, minQuery])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  function handleSelect(option: ComboboxOption) {
    if (option.disabled) return
    onChange(option)
    setOpen(false)
    setQuery('')
  }

  function handleClear() {
    onChange(null)
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        setOpen(true)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((i) => Math.min(i + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (highlighted >= 0 && options[highlighted]) {
        handleSelect(options[highlighted])
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        {value ? (
          <div className="flex h-10 w-full items-center gap-2 rounded-md border bg-background pl-9 pr-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">
              {value.label}
              {value.code ? (
                <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                  · {value.code}
                </span>
              ) : null}
            </span>
            {clearable && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${inputId}-listbox`}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlighted(-1)
            }}
            onClick={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-10 w-full rounded-md border bg-background pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        )}
      </div>

      {open && !value && (
        <div
          id={`${inputId}-listbox`}
          ref={listboxRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-background shadow-lg"
        >
          {loading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : error ? (
            <p className="p-3 text-sm text-destructive">{error}</p>
          ) : options.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No matches found.
            </p>
          ) : (
            options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={index === highlighted}
                disabled={option.disabled}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  index === highlighted ? 'bg-muted' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {option.label}
                  </span>
                  {option.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.subtitle}
                    </span>
                  )}
                </span>
                {option.code && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {option.code}
                  </span>
                )}
                {option.disabled ? (
                  <Check className="h-4 w-4 text-muted-foreground" />
                ) : (
                  index === highlighted && (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
