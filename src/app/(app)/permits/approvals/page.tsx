import Link from 'next/link'
import { 
  CheckCircle, 
  FileText,
  Clock,
  User,
  MapPin,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Building2,
  HardHat,
  Shield,
  Calendar,
  Users,
  TrendingUp,
  Activity,
  Info,
  Search,
  Filter
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { resolvePermitScope } from '@/lib/permit-scope'
import { formatDateTimeMY } from '@/lib/dates'
import { ReadinessBadge } from './readiness-badge'
import { BackButton } from '@/components/ui/back-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Pagination } from '@/components/ui/pagination'
import { parsePage, pageHref, DEFAULT_PAGE_SIZE } from '@/lib/pagination'

type Permit = {
  id: number
  permit_no: string
  work_title: string
  status: string
  planned_start: string | null
  permit_type: {
    name: string
    code: string
  } | null
  area: {
    name: string
    code: string
  } | null
  contractor: {
    company_name: string
  } | null
  worker_name: string | null
  worker_id: string | null
  staff_reference_name: string | null
  requester: {
    full_name: string
    department: string | null
  } | null
}

export default async function ApprovalQueuePage({
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

  const scope = await resolvePermitScope(supabase, user)

  if (!scope) return null

  let query = supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      work_title,
      status,
      planned_start,

      permit_type:permit_types!permits_permit_type_id_fkey (
        name,
        code
      ),

      area:areas!permits_area_id_fkey (
        name,
        code
      ),

      contractor:contractors!permits_contractor_id_fkey (
        company_name
      ),

      worker_name,
      worker_id,
      staff_reference_name,

      requester:profiles!permits_requester_id_fkey (
        full_name,
        department
      )
    `)
    .eq('status', 'pending_approval')
    .eq('workflow_stage', 'safety_approval')

  let countQuery = supabase
    .from('permits')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval')
    .eq('workflow_stage', 'safety_approval')

  if (!scope.isPlatformAdmin) {
    if (scope.companyId !== null) {
      query = query.eq('company_id', scope.companyId)
      countQuery = countQuery.eq('company_id', scope.companyId)
    } else if (scope.contractorId !== null) {
      query = query.eq('contractor_id', scope.contractorId)
      countQuery = countQuery.eq('contractor_id', scope.contractorId)
    }
  }

  const { count, error: countError } = await countQuery

  if (countError) {
    console.error(
      'Failed to count approval queue:',
      countError
    )
  }

  const total = count ?? 0
  const pageSize = DEFAULT_PAGE_SIZE
  const page = parsePage((await searchParams).page)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data: permits, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error(
      'Failed to load approval queue:',
      error
    )
  }

  const approvalPermits =
    (permits ?? []) as unknown as Permit[]

  // Calculate statistics (total from the head-count query; the
  // remaining breakdowns reflect the current page slice)
  const stats = {
    total,
    contractorPermits: approvalPermits.filter(p => p.contractor).length,
    internalPermits: approvalPermits.filter(p => !p.contractor).length,
    urgentPermits: approvalPermits.filter(p => {
      if (!p.planned_start) return false
      const plannedDate = new Date(p.planned_start)
      const now = new Date()
      const diffHours = Math.floor((plannedDate.getTime() - now.getTime()) / (1000 * 60 * 60))
      return diffHours <= 24
    }).length,
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/dashboard" label="Back to Operations" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-yellow-100 p-3 dark:bg-yellow-900/50">
                <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Approval Queue
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Permits awaiting safety approval
                </p>
              </div>
            </div>
          </div>

          <Badge variant="warning" className="self-start">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {stats.total} Pending
          </Badge>
        </div>

        {/* Role Notice */}
        {scope.profile.role === 'safety_coordinator' ||
         scope.profile.role === 'safety_manager' ? (
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                You have approval authority
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                You can approve or reject these permits from their detail page.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Read-only access
              </p>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                You can view these permits but only safety personnel can approve or reject them.
              </p>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-yellow-100 p-2 dark:bg-yellow-900/50">
                  <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Pending</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/50">
                  <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contractor Permits</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.contractorPermits}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/50">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Urgent (24h)</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.urgentPermits}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Approval List */}
        {total === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/50">
                <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Pending Approvals
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                There are currently no permits waiting for safety approval.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <CardTitle>Permits Awaiting Approval</CardTitle>
              <CardDescription>
                Review and take action on these permits
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Work</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Requester</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Area</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Readiness</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Details</th>
                        <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {approvalPermits.map((permit) => (
                        <tr 
                          key={permit.id} 
                          className="group transition-colors hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10"
                        >
                          <td className="px-6 py-4">
                            <Link
                              href={`/permits/${permit.id}`}
                              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {permit.permit_no}
                            </Link>
                            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Calendar className="h-3 w-3" />
                              {formatDateTimeMY(permit.planned_start)}
                            </p>
                          </td>

                          <td className="px-6 py-4">
                            <div className="max-w-[200px]">
                              <p className="font-medium text-gray-900 dark:text-white truncate">
                                {permit.work_title}
                              </p>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <User className="h-3.5 w-3.5" />
                              <div>
                                <p className="font-medium">{permit.requester?.full_name ?? '—'}</p>
                                {permit.requester?.department && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {permit.requester.department}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <Badge variant="secondary">
                              <Wrench className="mr-1 h-3 w-3" />
                              {permit.permit_type?.name ?? '—'}
                            </Badge>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <MapPin className="h-3.5 w-3.5" />
                              {permit.area?.name ?? '—'}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <ReadinessBadge permitId={permit.id} />
                          </td>

                          <td className="px-6 py-4">
                            {permit.contractor ? (
                              <div className="space-y-2">
                                <Badge variant="secondary">
                                  <Building2 className="mr-1 h-3 w-3" />
                                  Contractor PTW
                                </Badge>
                                <p className="text-xs font-medium text-gray-900 dark:text-white">
                                  {permit.contractor.company_name}
                                </p>
                                {permit.worker_name && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Worker: {permit.worker_name}
                                    {permit.worker_id ? ` (${permit.worker_id})` : ''}
                                  </p>
                                )}
                                {permit.staff_reference_name && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Staff Ref: {permit.staff_reference_name}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <Badge variant="secondary">
                                <HardHat className="mr-1 h-3 w-3" />
                                Internal PTW
                              </Badge>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/permits/${permit.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Review
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
              <Pagination
                currentPage={page}
                totalPages={Math.max(1, Math.ceil(total / pageSize))}
                buildHref={(p) => pageHref('/permits/approvals', {}, p)}
                totalItems={total}
                pageSize={pageSize}
              />
            </CardContent>
          </Card>
        )}

        {/* Help Note */}
        {total > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Important
              </p>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                Please review each permit carefully. Check the readiness badge to ensure all safety verifications are complete before approval.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}