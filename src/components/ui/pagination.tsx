import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Reusable pagination control for list pages.
 *
 * Server-component friendly: renders plain <Link> elements from a `buildHref`
 * callback, so no client state or router is needed. `buildHref(page)` must
 * return a URL that includes the `page` query param (use the `pageHref`
 * helper from '@/lib/pagination').
 */
export function Pagination({
  currentPage,
  totalPages,
  buildHref,
  totalItems,
  pageSize,
}: {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
  totalItems?: number
  pageSize?: number
}) {
  if (totalPages <= 1) return null

  const from = totalItems && pageSize
    ? (currentPage - 1) * pageSize + 1
    : null
  const to = totalItems && pageSize
    ? Math.min(currentPage * pageSize, totalItems)
    : null

  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      {totalItems !== undefined ? (
        <p className="text-sm text-muted-foreground">
          {from !== null && to !== null
            ? `${from}–${to} of ${totalItems}`
            : `${totalItems} items`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {currentPage > 1 ? (
          <Link
            href={buildHref(currentPage - 1)}
            className="inline-flex h-11 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted sm:h-9"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-11 cursor-not-allowed items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground/60 sm:h-9"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </span>
        )}

        {pageNumbers.map((page, index) =>
          page === '…' ? (
            <span
              key={`gap-${index}`}
              className="inline-flex h-11 w-9 items-center justify-center text-sm text-muted-foreground sm:h-9 sm:w-8"
            >
              …
            </span>
          ) : (
            <Link
              key={page}
              href={buildHref(page)}
              aria-current={page === currentPage ? 'page' : undefined}
              className={cn(
                'inline-flex h-11 w-9 items-center justify-center rounded-md text-sm transition-colors sm:h-9 sm:w-8',
                page === currentPage
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              {page}
            </Link>
          )
        )}

        {currentPage < totalPages ? (
          <Link
            href={buildHref(currentPage + 1)}
            className="inline-flex h-11 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted sm:h-9"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-11 cursor-not-allowed items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground/60 sm:h-9"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </nav>
  )
}

function getPageNumbers(
  currentPage: number,
  totalPages: number
): Array<number | '…'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages = new Set<number>([1, totalPages])
  for (
    let page = Math.max(2, currentPage - 1);
    page <= Math.min(totalPages - 1, currentPage + 1);
    page++
  ) {
    pages.add(page)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const result: Array<number | '…'> = []
  let prev = 0
  for (const page of sorted) {
    if (page - prev > 1) result.push('…')
    result.push(page)
    prev = page
  }
  return result
}
