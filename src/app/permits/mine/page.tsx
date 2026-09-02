import Link from 'next/link'
import { 
  FileText, 
  Plus, 
  Clock, 
  MapPin, 
  ChevronRight,
  Search,
  Filter,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Activity,
  Calendar,
  Wrench,
  User,
  ArrowRight
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Pagination } from '@/components/ui/pagination'
import { DeleteDraftButton } from '@/components/permits/delete-draft-button'
import { DEFAULT_PAGE_SIZE, pageHref, parsePage } from '@/lib/pagination'

type Permit = {
  id: number
  requester_id: string | null
  permit_no: string
  work_title: string
  status: string
  planned_start: string | null
  planned_end: string | null
  permit_type: {
    name: string
    code: string
  } | null
  area: {
    name: string
    code: string
  } | null
}

type ColorKey = 'blue' | 'green' | 'yellow' | 'purple'

export default async function MyPermitsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { page: rawPage } = await searchParams
  const page = parsePage(rawPage)
  const pageSize = DEFAULT_PAGE_SIZE

  // Head count for pagination totals (same filters as the slice query)
  const { count, error: countError } = await supabase
    .from('permits')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', user.id)

  if (countError) {
    console.error(
      'Failed to count my permits:',
      countError
    )
  }

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const from = (currentPage - 1) * pageSize
  const to = currentPage * pageSize - 1

  const { data, error } = await supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      work_title,
      status,
      requester_id,
      planned_start,
      planned_end,

      permit_type:permit_types!permits_permit_type_id_fkey (
        name,
        code
      ),

      area:areas!permits_area_id_fkey (
        name,
        code
      )
    `)
    .eq('requester_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error(
      'Failed to load my permits:',
      error
    )
  }

  const permits =
    (data ?? []) as unknown as Permit[]

  // Calculate statistics
  const stats = {
    total,
    active: permits.filter(p => p.status === 'active').length,
    pending: permits.filter(p => p.status === 'pending_approval' || p.status === 'submitted').length,
    completed: permits.filter(p => p.status === 'completed' || p.status === 'closed').length,
    draft: permits.filter(p => p.status === 'draft').length,
  }

  // Group permits by status
  const activePermits = permits.filter(p => ['active', 'approved', 'issued'].includes(p.status))
  const pendingPermits = permits.filter(p => ['pending_approval', 'submitted'].includes(p.status))
  const draftPermits = permits.filter(p => p.status === 'draft')
  const completedPermits = permits.filter(p => ['completed', 'closed', 'cancelled', 'rejected', 'expired'].includes(p.status))

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  My Permits
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Permits submitted by you
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/permits/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-blue-700/30"
          >
            <Plus className="h-4 w-4" />
            Create Permit
          </Link>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={FileText}
            label="Total Permits"
            value={stats.total}
            color="blue"
          />
          <StatCard
            icon={Activity}
            label="Active"
            value={stats.active}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="Pending"
            value={stats.pending}
            color="yellow"
          />
          <StatCard
            icon={CheckCircle2}
            label="Completed"
            value={stats.completed}
            color="purple"
          />
        </div>

        {/* Permits List */}
        {permits.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Permits Found
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                You haven't created any permits yet. Get started by creating your first permit.
              </p>
              <Link
                href="/permits/new"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Create Your First Permit
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Active Permits */}
            {activePermits.length > 0 && (
              <PermitSection
                title="Active Permits"
                description="Permits currently in progress"
                icon={Activity}
                iconColor="text-green-600 dark:text-green-400"
                permits={activePermits}
                userId={user.id}
              />
            )}

            {/* Pending Permits */}
            {pendingPermits.length > 0 && (
              <PermitSection
                title="Pending Approval"
                description="Permits awaiting review"
                icon={Clock}
                iconColor="text-yellow-600 dark:text-yellow-400"
                permits={pendingPermits}
                userId={user.id}
              />
            )}

            {/* Draft Permits */}
            {draftPermits.length > 0 && (
              <PermitSection
                title="Drafts"
                description="Permits not yet submitted"
                icon={FileText}
                iconColor="text-gray-600 dark:text-gray-400"
                permits={draftPermits}
                userId={user.id}
              />
            )}

            {/* Completed/Cancelled Permits */}
            {completedPermits.length > 0 && (
              <PermitSection
                title="Completed & Closed"
                description="Historical permits"
                icon={CheckCircle2}
                iconColor="text-purple-600 dark:text-purple-400"
                permits={completedPermits}
                userId={user.id}
              />
            )}
          </div>
        )}

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          buildHref={(p) => pageHref('/permits/mine', {}, p)}
          totalItems={total}
          pageSize={pageSize}
        />

        {/* Help Note */}
        {permits.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Need Help?
              </p>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                View detailed information by clicking on any permit. You can also create a new permit using the button above.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: ColorKey }) {
  const colorClasses: Record<ColorKey, string> = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400",
    yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400",
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className={cn("rounded-lg p-2", colorClasses[color])}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PermitSection({ 
  title, 
  description, 
  icon: Icon, 
  iconColor,
  permits,
  userId
}: { 
  title: string
  description: string
  icon: any
  iconColor: string
  permits: Permit[]
  userId: string
}) {
  return (
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className={cn("h-5 w-5", iconColor)} />
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Badge variant="secondary">{permits.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {permits.map((permit) => (
            <div key={permit.id} className="flex items-center">
              <Link
                href={`/permits/${permit.id}`}
                className="group flex flex-1 items-center justify-between p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <div className="flex flex-1 items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-blue-600 group-hover:underline dark:text-blue-400">
                        {permit.permit_no}
                      </p>
                      <StatusBadge status={permit.status} />
                    </div>
                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                      {permit.work_title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {permit.planned_start ? formatDate(permit.planned_start) : 'No date'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {permit.area?.name ?? 'No area'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        {permit.permit_type?.name ?? 'No type'}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
              </Link>
              {permit.status === 'draft' && permit.requester_id === userId && (
                <div className="shrink-0 pr-4">
                  <DeleteDraftButton
                    permitId={permit.id}
                    permitNo={permit.permit_no}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({
  status,
}: {
  status: string
}) {
  const styles: Record<string, string> = {
    draft:
      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',

    submitted:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',

    pending_approval:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',

    approved:
      'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',

    issued:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',

    active:
      'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',

    suspended:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',

    completed:
      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',

    closed:
      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',

    rejected:
      'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',

    cancelled:
      'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',

    expired:
      'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  }

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium uppercase",
        styles[status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
      )}
    >
      {status.replaceAll('_', ' ')}
    </span>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}