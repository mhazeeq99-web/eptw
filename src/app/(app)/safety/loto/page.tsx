import Link from 'next/link'
import { 
  LockKeyhole, 
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  Info,
  Activity,
  ChevronRight,
  Layers,
  Tag,
  Hash
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { VerifySafetyDocButton } from '@/components/permits/safety-documents/verify-button'
import { StatusBadge, formatDate } from '@/components/permits/status-badge'
import { BackButton } from '@/components/ui/back-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/states'
import { ScrollArea } from '@/components/ui/scroll-area'

type LotoPoint = {
  id: number
  description: string
  tag_number: string | null
  lock_number: string | null
  status: string
  created_at: string
  permit: {
    id: number
    permit_no: string
    work_title: string
    status: string
  } | null
}

const VERIFY_ROLES = [
  'safety_manager',
  'safety_coordinator',
]

export default async function LotoPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const canVerify = VERIFY_ROLES.includes(profile?.role ?? '')

  const { data: points, error } = await supabase
    .from('loto_isolation_points')
    .select(`
      id,
      description,
      tag_number,
      lock_number,
      status,
      created_at,
      permit:permits!loto_isolation_points_permit_id_fkey (
        id,
        permit_no,
        work_title,
        status
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load LOTO records:', error)
  }

  const rows = (points ?? []) as unknown as LotoPoint[]

  // Calculate statistics
  const stats = {
    total: rows.length,
    pending: rows.filter(p => p.status === 'pending').length,
    verified: rows.filter(p => p.status === 'verified').length,
    rejected: rows.filter(p => p.status === 'rejected').length,
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/settings" label="Back to Safety" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <LockKeyhole className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  LOTO — Isolation Points
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Lock-out / tag-out isolation points across your permits
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Activity className="mr-1 h-3 w-3" />
            {stats.total} Points
          </Badge>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={Clock}
            label="Pending Verification"
            value={stats.pending}
            color="yellow"
          />
          <StatCard
            icon={CheckCircle2}
            label="Verified"
            value={stats.verified}
            color="green"
          />
          <StatCard
            icon={XCircle}
            label="Rejected"
            value={stats.rejected}
            color="red"
          />
        </div>

        {/* Role Notice */}
        {canVerify && (
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Verification Authority
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                You can verify pending LOTO isolation points directly from this page.
              </p>
            </div>
          </div>
        )}

        {/* LOTO Records Table */}
        {error ? (
          <ErrorState
            title="Unable to load LOTO records"
            description="We couldn't retrieve this list. Please try again."
            retryHref="/safety/loto"
          />
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <LockKeyhole className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No LOTO Records
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Isolation points are added from the permit detail page.
              </p>
              <Link
                href="/permits"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                <FileText className="h-4 w-4" />
                Go to Permits
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                LOTO Isolation Points
              </CardTitle>
              <CardDescription>
                Review and verify lock-out / tag-out isolation points
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Point</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Tag</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Lock</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Created</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {rows.map((point) => (
                        <tr 
                          key={point.id} 
                          className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="px-6 py-4">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {point.description}
                            </p>
                          </td>

                          <td className="px-6 py-4">
                            {point.tag_number ? (
                              <Badge variant="secondary">
                                <Tag className="mr-1 h-3 w-3" />
                                {point.tag_number}
                              </Badge>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-600">—</span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            {point.lock_number ? (
                              <Badge variant="secondary">
                                <Hash className="mr-1 h-3 w-3" />
                                {point.lock_number}
                              </Badge>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-600">—</span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            {point.permit ? (
                              <div>
                                <Link
                                  href={`/permits/${point.permit.id}`}
                                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {point.permit.permit_no}
                                </Link>
                                <p className="mt-1 max-w-[200px] truncate text-xs text-gray-500 dark:text-gray-400">
                                  {point.permit.work_title}
                                </p>
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-600">—</span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDate(point.created_at)}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <StatusBadge status={point.status} />
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {canVerify && point.status === 'pending' && point.permit && (
                                <VerifySafetyDocButton
                                  permitId={point.permit.id}
                                  kind="loto"
                                  docId={point.id}
                                />
                              )}

                              {point.permit && (
                                <Link
                                  href={`/permits/${point.permit.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  View
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Info Note */}
        {rows.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                About LOTO
              </p>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                LOTO isolation points must be verified by safety personnel before permit approval. Click on any permit to view full details.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: 'yellow' | 'green' | 'red' }) {
  const colorClasses = {
    yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${colorClasses[color]}`}>
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