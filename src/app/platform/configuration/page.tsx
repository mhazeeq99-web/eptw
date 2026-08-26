import Link from 'next/link'
import {
  SlidersHorizontal,
  ShieldCheck,
  ClipboardList,
  ScrollText,
  Building2,
  Info,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Tabs — driven by the ?tab= query param (server searchParams).
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'permit_types', label: 'Permit Types', icon: SlidersHorizontal },
  { id: 'safety_controls', label: 'Safety Controls', icon: ShieldCheck },
  { id: 'ppe', label: 'PPE Catalogue', icon: ClipboardList },
  { id: 'checklists', label: 'Checklist Templates', icon: ScrollText },
] as const

type TabId = (typeof TABS)[number]['id']

// ---------------------------------------------------------------------------
// Row types (the project does not use generated Supabase types).
// ---------------------------------------------------------------------------

type PermitTypeRow = {
  id: number
  name: string
  code: string | null
  is_active: boolean
  requires_jha: boolean
  requires_loto: boolean
  requires_gas_test: boolean
  requires_site_verification: boolean
  requires_worker_briefing: boolean
  requires_emergency_arrangements: boolean
  max_validity_hours: number | null
  expiry_warning_minutes: number | null
  company: { name: string } | null
}

type SafetyControlRow = {
  id: number
  name: string
  code: string | null
  is_active: boolean
}

type PpeRow = {
  id: number
  name: string
  category: string
  is_active: boolean
}

type SiteChecklistTemplateRow = {
  permit_type_id: number
  is_required: boolean
}

type PermitTypeRefRow = {
  id: number
  name: string
  company: { name: string } | null
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function PlatformConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  const rawTab = params.tab
  const tabValue = Array.isArray(rawTab) ? rawTab[0] : rawTab
  const isKnownTab = TABS.some((tab) => tab.id === tabValue)
  const activeTab: TabId = isKnownTab ? (tabValue as TabId) : 'permit_types'

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

  if (profile?.role !== 'platform_admin') {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <div className="mb-6">
            <BackButton href="/dashboard" label="Back to Platform" />
          </div>

          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Platform Configuration
            </h1>
          </div>

          <AccessDenied />
        </div>
      </DashboardShell>
    )
  }

  let content: ReactNode

  if (activeTab === 'permit_types') {
    content = await renderPermitTypes(supabase)
  } else if (activeTab === 'safety_controls') {
    content = await renderSafetyControls(supabase)
  } else if (activeTab === 'ppe') {
    content = await renderPpe(supabase)
  } else {
    content = await renderChecklists(supabase)
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="mb-6">
          <BackButton href="/dashboard" label="Back to Platform" />
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Platform Configuration
          </h1>

          <p className="mt-2 text-muted-foreground">
            Read-only platform management view of permit types, safety
            controls, PPE catalogue and checklist templates.
          </p>
        </div>

        <ConfigurationTabs active={activeTab} />

        {content}
      </div>
    </DashboardShell>
  )
}

// ---------------------------------------------------------------------------
// Tab bar. Server-safe by design (no hooks): the task restricts this page to
// a single file, and a `'use client'` file-level directive would turn the
// whole server page client-side, so tabs navigate with `next/link` — the
// sanctioned alternative to `router.push` for a tab bar.
// ---------------------------------------------------------------------------

function ConfigurationTabs({ active }: { active: TabId }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border bg-background p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === active

        return (
          <Link
            key={tab.id}
            href={`/platform/configuration?tab=${tab.id}`}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Permit types — grouped by company (permit types are company-scoped).
// ---------------------------------------------------------------------------

async function renderPermitTypes(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('permit_types')
    .select(`
      id,
      name,
      code,
      is_active,
      requires_jha,
      requires_loto,
      requires_gas_test,
      requires_site_verification,
      requires_worker_briefing,
      requires_emergency_arrangements,
      max_validity_hours,
      expiry_warning_minutes,
      company:companies(name)
    `)
    .order('name')

  if (error) {
    console.error('Failed to load permit types:', error)
  }

  const rows = (data ?? []) as unknown as PermitTypeRow[]

  const grouped = new Map<string, PermitTypeRow[]>()
  for (const row of rows) {
    const companyName = row.company?.name ?? 'Unassigned'
    const list = grouped.get(companyName) ?? []
    list.push(row)
    grouped.set(companyName, list)
  }

  const groups = [...grouped.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )

  return (
    <div className="space-y-6">
      <AdminEndpointsNote />

      {groups.length === 0 ? (
        <Card title="Permit Types">
          <div className="p-6 text-sm text-muted-foreground">
            No permit types configured.
          </div>
        </Card>
      ) : (
        groups.map(([companyName, companyTypes]) => (
          <Card
            key={companyName}
            title={
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {companyName}
              </span>
            }
            description={`${companyTypes.length} permit type${
              companyTypes.length === 1 ? '' : 's'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">ID</th>
                    <th className="px-6 py-3 text-left font-medium">Name</th>
                    <th className="px-6 py-3 text-left font-medium">Code</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-center font-medium">JHA</th>
                    <th className="px-6 py-3 text-center font-medium">LOTO</th>
                    <th className="px-6 py-3 text-center font-medium">
                      Gas Test
                    </th>
                    <th className="px-6 py-3 text-center font-medium">
                      Site Verify
                    </th>
                    <th className="px-6 py-3 text-center font-medium">
                      Briefing
                    </th>
                    <th className="px-6 py-3 text-center font-medium">
                      Emergency
                    </th>
                    <th className="px-6 py-3 text-right font-medium">
                      Max Validity
                    </th>
                    <th className="px-6 py-3 text-right font-medium">
                      Expiry Warning
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {companyTypes.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <td className="px-6 py-4 text-muted-foreground">
                        {row.id}
                      </td>

                      <td className="px-6 py-4 font-medium">{row.name}</td>

                      <td className="px-6 py-4">
                        {row.code ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {row.code}
                          </code>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <ActiveBadge isActive={row.is_active} />
                      </td>

                      <td className="px-6 py-4 text-center">
                        <Flag on={row.requires_jha} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Flag on={row.requires_loto} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Flag on={row.requires_gas_test} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Flag on={row.requires_site_verification} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Flag on={row.requires_worker_briefing} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Flag on={row.requires_emergency_arrangements} />
                      </td>

                      <td className="px-6 py-4 text-right">
                        {row.max_validity_hours != null
                          ? `${row.max_validity_hours} h`
                          : 'No cap'}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {row.expiry_warning_minutes != null
                          ? `${row.expiry_warning_minutes} min`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Safety controls catalogue.
// ---------------------------------------------------------------------------

async function renderSafetyControls(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('safety_controls')
    .select('id, name, code, is_active')
    .order('name')

  if (error) {
    console.error('Failed to load safety controls:', error)
  }

  const rows = (data ?? []) as unknown as SafetyControlRow[]

  return (
    <div className="space-y-6">
      <AdminEndpointsNote />

      <Card
        title="Safety Controls"
        description={`${rows.length} control${rows.length === 1 ? '' : 's'}`}
      >
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No safety controls configured.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">ID</th>
                  <th className="px-6 py-3 text-left font-medium">Code</th>
                  <th className="px-6 py-3 text-left font-medium">Name</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="px-6 py-4 text-muted-foreground">
                      {row.id}
                    </td>

                    <td className="px-6 py-4">
                      {row.code ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.code}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-6 py-4 font-medium">{row.name}</td>

                    <td className="px-6 py-4">
                      <ActiveBadge isActive={row.is_active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PPE catalogue.
// ---------------------------------------------------------------------------

async function renderPpe(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('ppe_items')
    .select('id, name, category, is_active')
    .order('category')
    .order('name')

  if (error) {
    console.error('Failed to load PPE items:', error)
  }

  const rows = (data ?? []) as unknown as PpeRow[]

  return (
    <Card
      title="PPE Catalogue"
      description={`${rows.length} item${rows.length === 1 ? '' : 's'}`}
    >
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No PPE items configured.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-6 py-3 text-left font-medium">ID</th>
                <th className="px-6 py-3 text-left font-medium">Category</th>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-6 py-4 text-muted-foreground">
                    {row.id}
                  </td>

                  <td className="px-6 py-4 text-muted-foreground">
                    {row.category}
                  </td>

                  <td className="px-6 py-4 font-medium">{row.name}</td>

                  <td className="px-6 py-4">
                    <ActiveBadge isActive={row.is_active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Checklist templates — counts / existence summary for the four checklist
// sources: permit_type_site_checklist (template), permit_resume_checklists,
// permit_completion_checklists, permit_closure_checklists (permit-scoped).
// ---------------------------------------------------------------------------

async function renderChecklists(supabase: SupabaseClient) {
  const [resumeResult, completionResult, closureResult] = await Promise.all([
    supabase
      .from('permit_resume_checklists')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('permit_completion_checklists')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('permit_closure_checklists')
      .select('id', { count: 'exact', head: true }),
  ])

  const [
    { data: siteRows, error: siteError },
    { data: typeRows, error: typeError },
  ] = await Promise.all([
    supabase
      .from('permit_type_site_checklist')
      .select('permit_type_id, is_required'),
    supabase.from('permit_types').select('id, name, company:companies(name)'),
  ])

  if (siteError) {
    console.error('Failed to load site checklist templates:', siteError)
  }

  if (typeError) {
    console.error('Failed to load permit types:', typeError)
  }

  const siteTyped = (siteRows ?? []) as unknown as SiteChecklistTemplateRow[]
  const typesTyped = (typeRows ?? []) as unknown as PermitTypeRefRow[]

  const perType = new Map<number, { items: number; required: number }>()
  for (const row of siteTyped) {
    const agg = perType.get(row.permit_type_id) ?? { items: 0, required: 0 }
    agg.items += 1
    if (row.is_required) agg.required += 1
    perType.set(row.permit_type_id, agg)
  }

  const breakdown = typesTyped
    .map((type) => {
      const agg = perType.get(type.id) ?? { items: 0, required: 0 }
      return {
        id: type.id,
        name: type.name,
        company: type.company?.name ?? 'Unassigned',
        items: agg.items,
        required: agg.required,
      }
    })
    .sort(
      (a, b) =>
        a.company.localeCompare(b.company) || a.name.localeCompare(b.name)
    )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Site-Verification Templates"
          value={siteTyped.length}
          subtitle={`${perType.size} permit type${
            perType.size === 1 ? '' : 's'
          } with template items`}
          table="permit_type_site_checklist"
        />

        <SummaryCard
          title="Resume Checklists"
          value={resumeResult.count ?? 0}
          subtitle="Permit-scoped resume / revalidation checklist rows"
          table="permit_resume_checklists"
        />

        <SummaryCard
          title="Completion Checklists"
          value={completionResult.count ?? 0}
          subtitle="Permit-scoped completion checklist rows"
          table="permit_completion_checklists"
        />

        <SummaryCard
          title="Closure Checklists"
          value={closureResult.count ?? 0}
          subtitle="Permit-scoped closure checklist rows"
          table="permit_closure_checklists"
        />
      </div>

      <Card title="Site-Verification Checklist Templates by Permit Type">
        {breakdown.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No permit types configured.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left font-medium">
                    Permit Type
                  </th>
                  <th className="px-6 py-3 text-right font-medium">
                    Template Items
                  </th>
                  <th className="px-6 py-3 text-right font-medium">
                    Required
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {breakdown.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="px-6 py-4 text-muted-foreground">
                      {row.company}
                    </td>

                    <td className="px-6 py-4 font-medium">{row.name}</td>

                    <td className="px-6 py-4 text-right">
                      {row.items > 0 ? (
                        <span className="font-medium">{row.items}</span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {row.required}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function Card({
  title,
  description,
  children,
}: {
  title: ReactNode
  description?: string
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-4">
        <h2 className="font-semibold">{title}</h2>

        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {children}
    </div>
  )
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-300">
      Inactive
    </span>
  )
}

function Flag({ on }: { on: boolean }) {
  return (
    <span
      className={
        on
          ? 'font-medium text-green-600 dark:text-green-400'
          : 'text-muted-foreground'
      }
    >
      {on ? '✓' : '—'}
    </span>
  )
}

function SummaryCard({
  title,
  value,
  subtitle,
  table,
}: {
  title: string
  value: number
  subtitle: string
  table: string
}) {
  return (
    <div className="rounded-xl border bg-background p-5">
      <p className="text-sm text-muted-foreground">{title}</p>

      <p className="mt-2 text-3xl font-bold">{value}</p>

      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>

      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {table}
      </p>
    </div>
  )
}

function AdminEndpointsNote() {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

      <p className="text-sm text-muted-foreground">
        This page is a read-only management view. Permit-type and
        safety-control configuration is managed through the existing admin
        endpoints (e.g. the Settings management tools and their underlying
        API routes); changes made there appear here automatically.
      </p>
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="rounded-xl border bg-background p-8 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />

      <h2 className="mt-4 font-semibold">
        Platform Admin access required
      </h2>

      <p className="mt-1 text-sm text-muted-foreground">
        You need the Platform Admin role to view platform configuration.
      </p>
    </div>
  )
}
