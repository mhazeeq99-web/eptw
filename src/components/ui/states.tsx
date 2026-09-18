import Link from 'next/link'
import { AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Shared empty / error surfaces (DESIGN.md §11, §12, §89).
 *
 * Both follow the specified structure:
 *   Empty: icon → "No records found" → explanation → recovery action
 *   Error: title → explanation (never raw Supabase/Postgres text) → recovery
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon: Icon = Inbox,
  className,
}: {
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <div className={cn('p-12 text-center', className)}>
      <Icon className="mx-auto h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

export function ErrorState({
  title,
  description,
  retryLabel = 'Try Again',
  retryHref,
  onRetry,
  className,
}: {
  title: string
  description?: string
  retryLabel?: string
  retryHref?: string
  onRetry?: () => void
  className?: string
}) {
  const body = (
    <div className={cn('p-12 text-center', className)}>
      <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description ?? 'Something went wrong. Please try again.'}
      </p>
      {retryHref ? (
        <Link
          href={retryHref}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          {retryLabel}
        </Link>
      ) : onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  )

  return (
    <Card>
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  )
}
