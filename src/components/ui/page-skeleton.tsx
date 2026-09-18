import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Shared route-level loading skeletons (DESIGN.md §13).
 *
 * Used by route `loading.tsx` files so a navigation never shows a blank page
 * or a large spinner. Table-shaped pages get skeleton rows; detail/form pages
 * get skeleton cards.
 */
export function ListPageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Skeleton className="h-9 w-40" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-11 w-40 sm:h-10" />
      </div>

      <Skeleton className="h-10 w-full" />

      <Card>
        <CardHeader className="border-b">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {Array.from({ length: rows }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-40 sm:h-10" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-16" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-7 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      <ListPageSkeleton rows={5} />
    </div>
  )
}

export function DetailPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Skeleton className="h-9 w-40" />

      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-80" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-2 p-6">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-5 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="border-b">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    </div>
  )
}

export function FormPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-8 w-64" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="border-b">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-11 w-full sm:h-10" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-11 w-full sm:h-10" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
