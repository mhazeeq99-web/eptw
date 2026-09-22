'use client'

import { FormEvent, useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, Loader2, Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const [isFocused, setIsFocused] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showRecent, setShowRecent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('company-searches')
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        setRecentSearches(parsed.slice(0, 5))
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  // Handle click outside to close recent searches dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowRecent(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function saveToRecentSearches(query: string) {
    try {
      const stored = localStorage.getItem('company-searches')
      const current = stored ? (JSON.parse(stored) as string[]) : []
      const updated = [
        query,
        ...current.filter((item) => item !== query),
      ].slice(0, 5)
      localStorage.setItem('company-searches', JSON.stringify(updated))
      setRecentSearches(updated)
    } catch {
      // Ignore localStorage errors
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const params = new URLSearchParams(searchParams.toString())
    const q = value.trim()

    setIsLoading(true)

    if (q) {
      params.set('q', q)
      saveToRecentSearches(q)
    } else {
      params.delete('q')
    }

    const queryString = params.toString()
    router.push(queryString ? `/companies?${queryString}` : '/companies')
    
    // Simulate loading (will be cleared by router.refresh)
    setTimeout(() => {
      setIsLoading(false)
      setShowRecent(false)
      router.refresh()
    }, 300)
  }

  function handleClear() {
    setValue('')
    setIsLoading(true)
    router.push('/companies')
    
    setTimeout(() => {
      setIsLoading(false)
      router.refresh()
    }, 300)
    
    // Focus back on input
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  function handleRecentSearchClick(query: string) {
    setValue(query)
    setShowRecent(false)
    
    const params = new URLSearchParams(searchParams.toString())
    params.set('q', query)
    const queryString = params.toString()
    router.push(`/companies?${queryString}`)
    router.refresh()
  }

  // Keyboard shortcut: "/" to focus search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === '/' &&
        !event.ctrlKey &&
        !event.metaKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault()
        inputRef.current?.focus()
      }

      if (event.key === 'Escape' && showRecent) {
        setShowRecent(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showRecent])

  return (
    <div ref={containerRef} className="relative w-full sm:w-96">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          {isLoading ? (
            <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
          ) : (
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          )}

          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setShowRecent(event.target.value === '' && recentSearches.length > 0)
            }}
            onFocus={() => {
              setIsFocused(true)
              if (value === '' && recentSearches.length > 0) {
                setShowRecent(true)
              }
            }}
            onBlur={() => setIsFocused(false)}
            placeholder="Search name, code or SSM..."
            aria-label="Search companies"
            className={cn(
              "w-full rounded-lg border bg-white py-2.5 pl-10 pr-20 text-sm text-gray-900 outline-none transition-all",
              "placeholder:text-gray-400",
              "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
              isFocused
                ? "border-blue-500 ring-2 ring-blue-500/20 dark:border-blue-500"
                : "border-gray-300 dark:border-gray-600",
              "dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            )}
          />

          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {value && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            <kbd className="hidden items-center gap-0.5 rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 sm:flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
              <Keyboard className="h-2.5 w-2.5" />
              /
            </kbd>
          </div>
        </div>
      </form>

      {/* Recent Searches Dropdown */}
      {showRecent && recentSearches.length > 0 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="px-4 py-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Recent Searches
            </p>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700">
            {recentSearches.map((search, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleRecentSearchClick(search)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50"
              >
                <Search className="h-3.5 w-3.5 text-gray-400" />
                <span className="flex-1 truncate">{search}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}