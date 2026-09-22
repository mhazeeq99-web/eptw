import { 
  Building2, 
  Users, 
  FileText, 
  Star,
  Loader2
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading fallback for the Platform Admin Companies page (shown while the
 * server component streams its data).
 */
export default function CompaniesLoading() {
  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Back button skeleton */}
        <div className="mb-6">
          <Skeleton className="h-4 w-28" />
        </div>

        {/* Header skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div>
                <Skeleton className="h-8 w-44" />
                <Skeleton className="mt-2 h-4 w-72" />
              </div>
            </div>
          </div>

          <Skeleton className="h-8 w-24 rounded-full" />
        </div>

        {/* Statistics cards skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="mt-2 h-7 w-12" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Additional stats skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-7 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Companies table skeleton */}
        <Card>
          {/* Card header skeleton */}
          <div className="border-b border-gray-200 p-6 dark:border-gray-700">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-10 w-full sm:w-80" />
            </div>
          </div>

          {/* Table header skeleton */}
          <div className="flex items-center gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
            {[0, 1, 2, 3, 4, 5, 6].map((index) => (
              <Skeleton
                key={index}
                className={`h-3 ${index === 0 ? 'w-32' : index === 6 ? 'ml-auto w-16' : 'w-16'}`}
              />
            ))}
          </div>

          {/* Table rows skeleton */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
              <div
                key={row}
                className="flex items-center gap-4 px-6 py-4"
              >
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="ml-auto h-8 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        </Card>

        {/* Loading indicator */}
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading companies...</span>
        </div>
      </div>
    </>
  )
}