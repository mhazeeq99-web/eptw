import Link from 'next/link'
import { 
  FileText, 
  Plus, 
  Clock, 
  MapPin, 
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Activity,
  Calendar,
  Wrench,
  ArrowRight
} from 'lucide-react'
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

type StatusGroupKey =
  | 'active'
  | 'pending'
  | 'draft'
  | 'suspended'
  | 'completed'

type StatusGroup = {
  key: StatusGroupKey
  label: string
  description: string
  statuses: string[]
  icon: typeof Activity
  iconColor: string
}

/**
 * Status groups for the filter tabs and the grouped list. They partition every
 * permit status — note `suspended` is its own group: it used to match no group
 * at all, so a suspended permit was invisible on this page.
 */
const STATUS_GROUPS: StatusGroup[] = [
  {
    key: 'active',
    label: 'Active',
    description: 'Permits currently in progress',
    statuses: ['active', 'approved', 'issued'],
    icon: Activity,
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    key: 'pending',
    label: 'Pending',
    description: 'Permits awaiting review',
    statuses: ['pending_approval', 'submitted'],
    icon: Clock,
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  {
    key: 'draft',
    label: 'Drafts',
    description: 'Permits not yet submitted',
    statuses: ['draft'],
    icon: FileText,
    iconColor: 'text-gray-600 dark:text-gray-400',
  },
  {
    key: 'suspended',
    label: 'Suspended',
    description: 'Permits currently stopped',
    statuses: ['suspended'],
    icon: AlertCircle,
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
  {
    key: 'completed',
    label: 'Completed',
    description: 'Historical permits',
    statuses: ['completed', 'closed', 'cancelled', 'rejected', 'expired'],
    icon: CheckCircle2,
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
]

function parseStatusGroup(raw: string | undefined): StatusGroup | null {
  if (!raw) return null
  return STATUS_GROUPS.find((group) => group.key === raw) ?? null
}

export default async function MyPermitsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { page: rawPage, status: rawStatus } = await searchParams
  const page = parsePage(rawPage)
  const pageSize = DEFAULT_PAGE_SIZE
  const statusGroup = parseStatusGroup(rawStatus)

  // One cheap head count per status group powers both the tab badges and the
  // total for the selected filter (all counts: no rows transferred).
  const groupCounts = await Promise.all(
    STATUS_GROUPS.map(async (group) => {
      const { count, error } = await supabase
        .from('permits')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', user.id)
        .in('status', group.statuses)

      if (error) {
        console.error(
          `Failed to count ${group.key} permits:`,
          error
        )
      }

      return [group.key, count ?? 0] as const
    })
  )

  const countsByGroup = Object.fromEntries(groupCounts) as Record<
    StatusGroupKey,
    number
  >
  const totalAll = STATUS_GROUPS.reduce(
    (sum, group) => sum + (countsByGroup[group.key] ?? 0),
    0
  )

  // Total for the current view: the selected status group, or everything.
  const total = statusGroup ? countsByGroup[statusGroup.key] ?? 0 : totalAll
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const from = (currentPage - 1) * pageSize
  const to = currentPage * pageSize - 1

  let permitsQuery = supabase
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

  // Server-side status filtering (DESIGN.md §24): the tab selection narrows the
  // query rather than filtering a page slice after the fact.
  if (statusGroup) {
    permitsQuery = permitsQuery.in('status', statusGroup.statuses)
  }

  const { data, error } = await permitsQuery
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

  // Group the current page for the unfiltered view.
  const groupedPermits = STATUS_GROUPS.map((group) => ({
    group,
    permits: permits.filter((permit) => group.statuses.includes(permit.status)),
  }))

  return (
    <>
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

        {/* Status filter tabs — one list, one pagination, each status
            independently browsable (?status=…). Counts are DB-wide head counts
            per group, so they never contradict the list. */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/permits/mine"
            aria-current={!statusGroup ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              !statusGroup
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            All
            <span className="text-xs opacity-70">{totalAll}</span>
          </Link>

          {STATUS_GROUPS.map((group) => {
            const isActive = statusGroup?.key === group.key
            const count = countsByGroup[group.key] ?? 0

            return (
              <Link
                key={group.key}
                href={pageHref('/permits/mine', { status: group.key }, 1)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {group.label}
                <span className="text-xs opacity-70">{count}</span>
              </Link>
            )
          })}
        </div>

        {/* Help Note — kept above the list so the list + its pagination end the
            page. */}
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

        {/* Permits List */}
        {permits.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                {statusGroup
                  ? `No ${statusGroup.label.toLowerCase()} permits`
                  : 'No Permits Found'}
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {statusGroup
                  ? `You have no permits with the “${statusGroup.label}” status right now.`
                  : "You haven't created any permits yet. Get started by creating your first permit."}
              </p>
              {statusGroup ? (
                <Link
                  href="/permits/mine"
                  className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Clear filter
                </Link>
              ) : (
                <Link
                  href="/permits/new"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Your First Permit
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Your Permits</CardTitle>
                  <CardDescription>
                    {statusGroup
                      ? 'Newest first'
                      : 'Grouped by status, newest first'}
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {statusGroup
                    ? `${total} ${total === 1 ? 'permit' : 'permits'}`
                    : `${permits.length} on this page`}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {statusGroup ? (
                /* Filtered view: the tab already names the status, so rows are
                   listed directly. */
                <PermitRows permits={permits} userId={user.id} />
              ) : (
                /* Unfiltered view: the page slice, grouped by status. */
                groupedPermits.map(({ group, permits: groupPermits }) =>
                  groupPermits.length > 0 ? (
                    <PermitSection
                      key={group.key}
                      title={group.label}
                      description={group.description}
                      icon={group.icon}
                      iconColor={group.iconColor}
                      permits={groupPermits}
                      userId={user.id}
                    />
                  ) : null
                )
              )}
            </CardContent>

            {/* Pagination is the list card's footer: the component's top border
                is its divider, so it no longer floats between cards. */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              buildHref={(p) => pageHref('/permits/mine', { status: statusGroup?.key }, p)}
              totalItems={total}
              pageSize={pageSize}
            />
          </Card>
        )}
      </div>
    </>
  )
}


/** Section of the single permits list card (header bar + divided rows). */
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
    <section className="border-b border-gray-200 last:border-b-0 dark:border-gray-700">
      <div className="flex items-center justify-between bg-muted/30 px-6 py-3">
        <div className="flex items-center gap-3">
          <Icon className={cn("h-5 w-5", iconColor)} />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge variant="secondary">{permits.length}</Badge>
      </div>

      <PermitRows permits={permits} userId={userId} />
    </section>
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

/** The divided permit rows, shared by the grouped and the filtered views. */
function PermitRows({
  permits,
  userId,
}: {
  permits: Permit[]
  userId: string
}) {
  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {permits.map((permit) => (
        <div key={permit.id} className="flex items-center">
          <Link
            href={`/permits/${permit.id}`}
            className="group flex flex-1 items-center justify-between p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-blue-600 group-hover:underline dark:text-blue-400">
                    {permit.permit_no}
                  </p>
                  <StatusBadge status={permit.status} />
                </div>
                <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                  {permit.work_title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {permit.planned_start
                      ? formatDate(permit.planned_start)
                      : 'No date'}
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
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
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
  )
}
