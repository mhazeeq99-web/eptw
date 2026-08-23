import Link from 'next/link'
import { LockKeyhole, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { VerifySafetyDocButton } from '@/components/permits/safety-documents/verify-button'
import { StatusBadge, formatDate } from '@/components/permits/status-badge'

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

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            LOTO — Isolation Points
          </h1>

          <p className="mt-2 text-muted-foreground">
            Lock-out / tag-out isolation points across your permits.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-background">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <LockKeyhole className="h-10 w-10 text-muted-foreground" />

              <h2 className="mt-4 font-semibold">No LOTO records</h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Isolation points are added from the permit detail page.
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
                    <th className="px-4 py-3 text-left font-medium">Point</th>
                    <th className="px-4 py-3 text-left font-medium">Tag</th>
                    <th className="px-4 py-3 text-left font-medium">Lock</th>
                    <th className="px-4 py-3 text-left font-medium">Permit</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {rows.map((point) => (
                    <tr key={point.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">
                        {point.description}
                      </td>

                      <td className="px-4 py-3">
                        {point.tag_number ?? '—'}
                      </td>

                      <td className="px-4 py-3">
                        {point.lock_number ?? '—'}
                      </td>

                      <td className="px-4 py-3">
                        {point.permit ? (
                          <Link
                            href={`/permits/${point.permit.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {point.permit.permit_no}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {formatDate(point.created_at)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={point.status} />
                      </td>

                      <td className="px-4 py-3 text-right">
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
