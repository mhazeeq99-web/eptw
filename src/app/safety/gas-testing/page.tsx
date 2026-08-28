import Link from 'next/link'
import { 
  Gauge, 
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  Info,
  Activity,
  ChevronRight,
  TrendingUp,
  Layers
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { VerifySafetyDocButton } from '@/components/permits/safety-documents/verify-button'
import { StatusBadge, formatDate } from '@/components/permits/status-badge'
import { BackButton } from '@/components/ui/back-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

type GasTest = {
  id: number
  tested_at: string
  o2: number | null
  lel: number | null
  h2s: number | null
  co: number | null
  status: string
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

export default async function GasTestingPage() {
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

  const { data: tests, error } = await supabase
    .from('gas_tests')
    .select(`
      id,
      tested_at,
      o2,
      lel,
      h2s,
      co,
      status,
      permit:permits!gas_tests_permit_id_fkey (
        id,
        permit_no,
        work_title,
        status
      )
    `)
    .order('tested_at', { ascending: false })

  if (error) {
    console.error('Failed to load gas tests:', error)
  }

  const rows = (tests ?? []) as unknown as GasTest[]

  // Calculate statistics
  const stats = {
    total: rows.length,
    pending: rows.filter(t => t.status === 'pending').length,
    verified: rows.filter(t => t.status === 'verified').length,
    rejected: rows.filter(t => t.status === 'rejected').length,
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <BackButton href="/settings" label="Back to Safety" />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Gauge className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Gas Testing
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Atmospheric gas test results across your permits
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Activity className="mr-1 h-3 w-3" />
            {stats.total} Tests
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
                You can verify pending gas test results directly from this page.
              </p>
            </div>
          </div>
        )}

        {/* Gas Tests Table */}
        {rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <Gauge className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No Gas Tests
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Gas tests are recorded from the permit detail page.
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
                Gas Test Results
              </CardTitle>
              <CardDescription>
                Review and verify atmospheric gas test measurements
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Tested At</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">O₂ %</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">LEL %</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">H₂S ppm</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">CO ppm</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit</th>
                        <th className="px-6 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-6 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {rows.map((test) => (
                        <tr 
                          key={test.id} 
                          className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDate(test.tested_at)}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <GasValue value={test.o2} />
                          </td>
                          <td className="px-6 py-4">
                            <GasValue value={test.lel} />
                          </td>
                          <td className="px-6 py-4">
                            <GasValue value={test.h2s} />
                          </td>
                          <td className="px-6 py-4">
                            <GasValue value={test.co} />
                          </td>

                          <td className="px-6 py-4">
                            {test.permit ? (
                              <div>
                                <Link
                                  href={`/permits/${test.permit.id}`}
                                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {test.permit.permit_no}
                                </Link>
                                <p className="mt-1 max-w-[200px] truncate text-xs text-gray-500 dark:text-gray-400">
                                  {test.permit.work_title}
                                </p>
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-600">—</span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <StatusBadge status={test.status} />
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                              {canVerify && test.status === 'pending' && test.permit && (
                                <VerifySafetyDocButton
                                  permitId={test.permit.id}
                                  kind="gas-test"
                                  docId={test.id}
                                />
                              )}

                              {test.permit && (
                                <Link
                                  href={`/permits/${test.permit.id}`}
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
                About Gas Testing
              </p>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                Gas test results must be verified by safety personnel before permit approval. Click on any permit to view full details.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function GasValue({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 dark:text-gray-600">—</span>
  }
  
  return (
    <span className="font-medium text-gray-900 dark:text-white">
      {value}
    </span>
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