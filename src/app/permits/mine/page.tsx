import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
  totalItems?: number
  pageSize?: number
  siblingCount?: number
}

function getVisiblePages(
  currentPage: number,
  totalPages: number,
  siblingCount: number = 1
): (number | 'ellipsis')[] {
  const totalPageNumbers = siblingCount * 2 + 3 // siblings + current + first + last
  const firstPage = 1
  const lastPage = totalPages

  if (totalPages <= totalPageNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, firstPage)
  const rightSiblingIndex = Math.min(currentPage + siblingCount, lastPage)

  const shouldShowLeftEllipsis = leftSiblingIndex > firstPage + 1
  const shouldShowRightEllipsis = rightSiblingIndex < lastPage - 1

  if (!shouldShowLeftEllipsis && shouldShowRightEllipsis) {
    const leftRange = Array.from(
      { length: 3 + siblingCount },
      (_, i) => i + 1
    )
    return [...leftRange, 'ellipsis', lastPage]
  }

  if (shouldShowLeftEllipsis && !shouldShowRightEllipsis) {
    const rightRange = Array.from(
      { length: 3 + siblingCount },
      (_, i) => lastPage - (2 + siblingCount) + i
    )
    return [firstPage, 'ellipsis', ...rightRange]
  }

  const middleRange = Array.from(
    { length: rightSiblingIndex - leftSiblingIndex + 1 },
    (_, i) => leftSiblingIndex + i
  )
  return [firstPage, 'ellipsis', ...middleRange, 'ellipsis', lastPage]
}

export function Pagination({
  currentPage,
  totalPages,
  buildHref,
  totalItems = 0,
  pageSize = 20,
  siblingCount = 1,
}: PaginationProps) {
  // Don't show pagination if there's 1 or fewer pages or no items
  if (totalPages <= 1 || totalItems === 0) {
    return null
  }

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)
  const visiblePages = getVisiblePages(currentPage, totalPages, siblingCount)
  const isFirstPage = currentPage === 1
  const isLastPage = currentPage === totalPages

  // Disabled button component
  const DisabledButton = ({ children }: { children: React.ReactNode }) => (
    <span
      className="flex cursor-not-allowed items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 dark:text-gray-600"
      aria-disabled="true"
    >
      {children}
    </span>
  )

  // Active/current page button
  const CurrentPageButton = ({ page }: { page: number }) => (
    <span
      className="flex h-8 min-w-[2rem] items-center justify-center rounded-md bg-blue-600 px-2 text-sm font-medium text-white dark:bg-blue-700"
      aria-current="page"
    >
      {page}
    </span>
  )

  // Regular page link
  const PageLink = ({ page }: { page: number }) => (
    <Link
      href={buildHref(page)}
      className="flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
      aria-label={`Go to page ${page}`}
    >
      {page}
    </Link>
  )

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 px-1 py-4 dark:border-gray-700 sm:flex-row sm:py-5">
      {/* Item count - desktop */}
      <div className="hidden text-sm text-gray-600 dark:text-gray-400 sm:block">
        Showing{' '}
        <span className="font-medium text-gray-900 dark:text-white">
          {startItem}
        </span>
        {' – '}
        <span className="font-medium text-gray-900 dark:text-white">
          {endItem}
        </span>
        {' of '}
        <span className="font-medium text-gray-900 dark:text-white">
          {totalItems}
        </span>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center gap-0.5">
        {/* Previous button */}
        {isFirstPage ? (
          <DisabledButton>
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </DisabledButton>
        ) : (
          <Link
            href={buildHref(currentPage - 1)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Link>
        )}

        {/* Page numbers - desktop */}
        <div className="hidden items-center gap-0.5 sm:flex">
          {visiblePages.map((page, index) => {
            if (page === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="flex h-8 w-8 items-center justify-center text-sm text-gray-400 dark:text-gray-500"
                >
                  …
                </span>
              )
            }

            const isCurrent = page === currentPage
            return isCurrent ? (
              <CurrentPageButton key={page} page={page} />
            ) : (
              <PageLink key={page} page={page} />
            )
          })}
        </div>

        {/* Page indicator - mobile */}
        <div className="flex items-center gap-1.5 px-2 text-sm font-medium text-gray-700 dark:text-gray-300 sm:hidden">
          <span>Page</span>
          <span className="text-blue-600 dark:text-blue-400">{currentPage}</span>
          <span>of</span>
          <span>{totalPages}</span>
        </div>

        {/* Next button */}
        {isLastPage ? (
          <DisabledButton>
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </DisabledButton>
        ) : (
          <Link
            href={buildHref(currentPage + 1)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}
