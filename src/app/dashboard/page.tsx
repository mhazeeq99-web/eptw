import { DashboardShell } from '@/components/layout/dashboard-shell'

export default function DashboardPage() {
  return (
    <DashboardShell>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Dashboard
        </h1>

        <p className="mt-2 text-muted-foreground">
          Overview of your permit-to-work activity.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Active Permits"
            value="0"
          />

          <DashboardCard
            title="Pending Approval"
            value="0"
          />

          <DashboardCard
            title="Completed Today"
            value="0"
          />

          <DashboardCard
            title="Expired"
            value="0"
          />
        </div>
      </div>
    </DashboardShell>
  )
}

function DashboardCard({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <div className="rounded-xl border bg-background p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">
        {title}
      </p>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>
    </div>
  )
}