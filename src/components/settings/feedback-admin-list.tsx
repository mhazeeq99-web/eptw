'use client'

import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatDateTimeMY } from '@/lib/dates'

const PAGE_SIZE = 20

type FeedbackRow = {
  id: number
  title: string
  message: string
  created_at: string
  user_id: string
  company_id: number | null
  profiles: { full_name: string | null; email: string | null } | null
}

type Pagination = {
  page: number
  page_size: number
  total: number
  total_pages: number
}

/**
 * Platform-admin-only paginated list of all user feedback.
 */
export function FeedbackAdminList() {
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(
          `/api/feedback?page=${page}&page_size=${PAGE_SIZE}`
        )
        const body = await response.json()

        if (!cancelled) {
          if (!response.ok) {
            setError(body.error || 'Unable to load feedback.')
            return
          }
          setFeedback(body.feedback ?? [])
          setPagination(body.pagination ?? null)
        }
      } catch {
        if (!cancelled) setError('Unable to load feedback.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [page])

  const totalPages = pagination?.total_pages ?? 1
  const total = pagination?.total ?? 0

  return (
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          All Feedback
        </CardTitle>
        <CardDescription>
          {loading
            ? 'Loading feedback...'
            : `${total} submission${total === 1 ? '' : 's'}`}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">{error}</div>
        ) : feedback.length === 0 ? (
          <div className="p-10 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No feedback has been submitted yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {feedback.map((item) => (
              <li key={item.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-gray-900 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600 dark:text-gray-400">
                      {item.message}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {item.profiles?.full_name || item.profiles?.email || 'Unknown user'}
                  </span>
                  {item.profiles?.email && item.profiles?.full_name && (
                    <span className="text-muted-foreground/70">
                      {item.profiles.email}
                    </span>
                  )}
                  <span>·</span>
                  <span>{formatDateTimeMY(item.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 dark:border-gray-700">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
