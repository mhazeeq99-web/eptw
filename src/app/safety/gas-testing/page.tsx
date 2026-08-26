import Link from 'next/link'
import { Gauge, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { VerifySafetyDocButton } from '@/components/permits/safety-documents/verify-button'
import { StatusBadge, formatDate } from '@/components/permits/status-badge'
import { BackButton } from '@/components/ui/back-button'

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

  return (
    <DashboardShell>
      <div className="space-y-6">
        <BackButton href="/settings" label="Back to Safety" />

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Gas Testing
          </h1>

          <p className="mt-2 text-muted-foreground">
            Atmospheric gas test results across your permits.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-background">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Gauge className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">No gas tests</h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Gas tests are recorded from the permit detail page.
              </p>

              <Link
                href="/permits"
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to Permits
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Tested At</th>
                    <th className="px-4 py-3 text-left font-medium">O₂ %</th>
                    <th className="px-4 py-3 text-left font-medium">LEL %</th>
                    <th className="px-4 py-3 text-left font-medium">H₂S ppm</th>
                    <th className="px-4 py-3 text-left font-medium">CO ppm</th>
                    <th className="px-4 py-3 text-left font-medium">Permit</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {rows.map((test) => (
                    <tr key={test.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        {formatDate(test.tested_at)}
                      </td>

                      <td className="px-4 py-3">{test.o2 ?? '—'}</td>
                      <td className="px-4 py-3">{test.lel ?? '—'}</td>
                      <td className="px-4 py-3">{test.h2s ?? '—'}</td>
                      <td className="px-4 py-3">{test.co ?? '—'}</td>

                      <td className="px-4 py-3">
                        {test.permit ? (
                          <Link
                            href={`/permits/${test.permit.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {test.permit.permit_no}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={test.status} />
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
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
                              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Open Permit
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
