import { DashboardShell } from '@/components/layout/dashboard-shell'

/**
 * Loading fallback for the Platform Admin Companies page (shown while the
 * server component streams its data).
 */
export default function CompaniesLoading() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />

        <div>
          <div className="h-8 w-44 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded bg-muted" />
        </div>

        <div className="overflow-hidden rounded-xl border bg-background">
          <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="h-9 w-full animate-pulse rounded-md bg-muted sm:w-72" />
          </div>

          <div className="h-11 border-b bg-muted/40" />
          {[0, 1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className="h-14 animate-pulse border-b bg-muted/20 last:border-0"
            />
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
