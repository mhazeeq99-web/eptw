import Link from 'next/link'
import {
  SlidersHorizontal,
  ShieldCheck,
  ClipboardList,
  ScrollText,
  Building2,
  Info,
} from 'lucide-react'
import { Suspense, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { CompanySelector } from '@/components/platform/company-selector'
import { createClient } from '@/lib/supabase/server'

const TABS = [
  { id: 'permit_types', label: 'Permit Types', icon: SlidersHorizontal },
  { id: 'safety_controls', label: 'Safety Controls', icon: ShieldCheck },
  { id: 'ppe', label: 'PPE Catalogue', icon: ClipboardList },
  { id: 'checklists', label: 'Checklist Templates', icon: ScrollText },
] as const

type TabId = (typeof TABS)[number]['id']
const DEFAULT_PER = 25
const PER_OPTIONS = [25, 50, 100] as const

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
}

type SafetyControlRow = { id: number; name: string; code: string | null; category: string | null; is_active: boolean }
type PpeRow = { id: number; name: string; category: string; is_active: boolean }

export default async function PlatformConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

  const tabValue = first(params.tab)
  const activeTab: TabId = TABS.some((t) => t.id === tabValue)
    ? (tabValue as TabId)
    : 'permit_types'

  const rawCompany = first(params.company)
  const companyId = rawCompany && Number.isInteger(Number(rawCompany)) && Number(rawCompany) > 0
    ? Number(rawCompany)
    : null

  const pageRaw = Number(first(params.page))
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const perRaw = Number(first(params.per))
  const per = (PER_OPTIONS as readonly number[]).includes(perRaw) ? perRaw : DEFAULT_PER
  const q = first(params.q)

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

  const isPlatformAdmin = profile?.role === 'platform_admin'

  if (!isPlatformAdmin) {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <div className="mb-6">
            <BackButton href="/dashboard" label="Back to Platform" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Configuration</h1>
          <AccessDenied />
        </div>
      </DashboardShell>
    )
  }

  // Resolve the selected company (server-side validation — PA may inspect any
  // company, but it must exist).
  let selectedCompany: { id: number; name: string; code: string | null } | null = null
  if (companyId !== null) {
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, code')
      .eq('id', companyId)
      .maybeSingle()
    if (company) selectedCompany = company as { id: number; name: string; code: string | null }
  }

  let content: ReactNode = null
  if (selectedCompany) {
    if (activeTab === 'permit_types') content = await renderPermitTypes(supabase, selectedCompany.id, page, per, q)
    else if (activeTab === 'safety_controls') content = await renderSafetyControls(supabase, page, per, q)
    else if (activeTab === 'ppe') content = await renderPpe(supabase, page, per, q)
    else content = await renderChecklists(supabase, selectedCompany.id)
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="mb-6">
          <BackButton href="/dashboard" label="Back to Platform" />
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Configuration</h1>
          <p className="mt-2 text-muted-foreground">
            Select a company to view its configuration.
          </p>
        </div>

        <div className="max-w-md">
          <Suspense fallback={<div className="h-10 rounded-md border bg-background" />}>
            <CompanySelector currentCompanyId={companyId ? String(companyId) : null} currentTab={activeTab} />
          </Suspense>
        </div>

        {!selectedCompany ? (
          <div className="rounded-xl border bg-background p-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">Select a company to view its configuration</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Choose a company above to view its Permit Types, Safety Controls, PPE
              Catalogue and Checklist Templates.
            </p>
          </div>
        ) : (
          <>
            {/* Selected company context */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border bg-background p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company</p>
                <p className="mt-0.5 font-semibold">{selectedCompany.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Code</p>
                <p className="mt-0.5 font-mono text-sm">{selectedCompany.code ?? '—'}</p>
              </div>
              <span className="ml-auto rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                Viewing configuration for: {selectedCompany.name}
              </span>
            </div>

            <ConfigurationTabs active={activeTab} companyId={selectedCompany.id} />

            {content}
          </>
        )}
      </div>
    </DashboardShell>
  )
}

function ConfigurationTabs({ active, companyId }: { active: TabId; companyId: number }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border bg-background p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === active
        return (
          <Link
            key={tab.id}
            href={`/platform/configuration?company=${companyId}&tab=${tab.id}`}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
// Permit types — scoped to the selected company, server-side paginated.
// ---------------------------------------------------------------------------

async function renderPermitTypes(supabase: SupabaseClient, companyId: number, page: number, per: number, q: string) {
  let query = supabase
    .from('permit_types')
    .select(
      `id,name,code,is_active,requires_jha,requires_loto,requires_gas_test,requires_site_verification,requires_worker_briefing,requires_emergency_arrangements,max_validity_hours,expiry_warning_minutes`,
      { count: 'exact' }
    )
    .eq('company_id', companyId)

  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`)

  const offset = (page - 1) * per
  const { data, count, error } = await query.order('name').range(offset, offset + per - 1)

  if (error) console.error('Failed to load permit types:', error)
  const rows = (data ?? []) as unknown as PermitTypeRow[]

  return (
    <Card title="Permit Types" description={`${count ?? rows.length} type${(count ?? rows.length) === 1 ? '' : 's'}`}>
      <TableControls tab="permit_types" companyId={companyId} q={q} per={per} count={count ?? rows.length} page={page}>
        {rows.length === 0 ? (
          <Empty text="No Permit Types" detail="This company currently has no configured permit types." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                {['Name', 'Code', 'Status', 'JHA', 'LOTO', 'Gas', 'Site', 'Briefing', 'Emergency'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-4 font-medium">{row.name}</td>
                  <td className="px-4 py-4">{row.code ? <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.code}</code> : '—'}</td>
                  <td className="px-4 py-4"><ActiveBadge isActive={row.is_active} /></td>
                  <td className="px-4 py-4"><Flag on={row.requires_jha} /></td>
                  <td className="px-4 py-4"><Flag on={row.requires_loto} /></td>
                  <td className="px-4 py-4"><Flag on={row.requires_gas_test} /></td>
                  <td className="px-4 py-4"><Flag on={row.requires_site_verification} /></td>
                  <td className="px-4 py-4"><Flag on={row.requires_worker_briefing} /></td>
                  <td className="px-4 py-4"><Flag on={row.requires_emergency_arrangements} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableControls>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Safety controls — global catalogue (no company_id), clearly labelled.
// ---------------------------------------------------------------------------

async function renderSafetyControls(supabase: SupabaseClient, page: number, per: number, q: string) {
  let query = supabase.from('safety_controls').select('id,name,code,category,is_active', { count: 'exact' })
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,category.ilike.%${q}%`)
  const offset = (page - 1) * per
  const { data, count, error } = await query.order('name').range(offset, offset + per - 1)
  if (error) console.error('Failed to load safety controls:', error)
  const rows = (data ?? []) as unknown as SafetyControlRow[]

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold text-foreground">GLOBAL SAFETY CONTROL CATALOGUE.</span>{' '}
          Safety controls are a shared catalogue. Company / permit-type requirements are
          managed via permit_type_safety_controls and are not duplicated per company here.
        </span>
      </p>
      <Card title="Safety Controls" description={`${count ?? rows.length} control${(count ?? rows.length) === 1 ? '' : 's'}`}>
        <TableControls tab="safety_controls" companyId={null} q={q} per={per} count={count ?? rows.length} page={page}>
          {rows.length === 0 ? (
            <Empty text="No Safety Controls" detail="No safety controls configured." />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>{['Name', 'Code', 'Category', 'Status'].map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="px-4 py-4 font-medium">{row.name}</td>
                    <td className="px-4 py-4">{row.code ? <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.code}</code> : '—'}</td>
                    <td className="px-4 py-4 text-muted-foreground">{row.category ?? '—'}</td>
                    <td className="px-4 py-4"><ActiveBadge isActive={row.is_active} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableControls>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PPE — global catalogue (ppe_items has no company_id), clearly labelled.
// ---------------------------------------------------------------------------

async function renderPpe(supabase: SupabaseClient, page: number, per: number, q: string) {
  let query = supabase.from('ppe_items').select('id,name,category,is_active', { count: 'exact' })
  if (q) query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%`)
  const offset = (page - 1) * per
  const { data, count, error } = await query.order('category').order('name').range(offset, offset + per - 1)
  if (error) console.error('Failed to load PPE items:', error)
  const rows = (data ?? []) as unknown as PpeRow[]

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold text-foreground">Platform / Global PPE catalogue.</span>{' '}
          PPE items are shared across companies. Company permit-type PPE mappings are
          managed via permit_type_ppe and are not duplicated per company here.
        </span>
      </p>
      <Card title="PPE Catalogue" description={`${count ?? rows.length} item${(count ?? rows.length) === 1 ? '' : 's'}`}>
        <TableControls tab="ppe" companyId={null} q={q} per={per} count={count ?? rows.length} page={page}>
          {rows.length === 0 ? (
            <Empty text="No PPE Items" detail="No PPE catalogue items configured." />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>{['Name', 'Category', 'Status'].map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="px-4 py-4 font-medium">{row.name}</td>
                    <td className="px-4 py-4 text-muted-foreground">{row.category}</td>
                    <td className="px-4 py-4"><ActiveBadge isActive={row.is_active} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableControls>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checklists — site-verification templates for the selected company's types.
// ---------------------------------------------------------------------------

async function renderChecklists(supabase: SupabaseClient, companyId: number) {
  const { data: types, error: typeError } = await supabase
    .from('permit_types')
    .select('id, name')
    .eq('company_id', companyId)
    .order('name')
  if (typeError) console.error('Failed to load permit types:', typeError)
  const typeList = (types ?? []) as { id: number; name: string }[]

  const typeIds = typeList.map((t) => t.id)
  let siteRows: { permit_type_id: number; is_required: boolean }[] = []
  if (typeIds.length > 0) {
    const { data } = await supabase
      .from('permit_type_site_checklist')
      .select('permit_type_id, is_required')
      .in('permit_type_id', typeIds)
    siteRows = (data ?? []) as { permit_type_id: number; is_required: boolean }[]
  }

  const perType = new Map<number, { items: number; required: number }>()
  for (const row of siteRows) {
    const agg = perType.get(row.permit_type_id) ?? { items: 0, required: 0 }
    agg.items += 1
    if (row.is_required) agg.required += 1
    perType.set(row.permit_type_id, agg)
  }

  const breakdown = typeList.map((t) => ({ ...t, ...(perType.get(t.id) ?? { items: 0, required: 0 }) }))

  return (
    <div className="space-y-4">
      <Card title="Checklist Templates" description="For the selected company's permit types">
        {breakdown.length === 0 ? (
          <Empty text="No Permit Types" detail="This company currently has no configured permit types." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Permit Type</th>
                  <th className="px-4 py-3 text-right font-medium">Template Items</th>
                  <th className="px-4 py-3 text-right font-medium">Required</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {breakdown.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="px-4 py-4 font-medium">{row.name}</td>
                    <td className="px-4 py-4 text-right">{row.items > 0 ? <span className="font-medium">{row.items}</span> : <span className="text-muted-foreground">None</span>}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{row.required}</td>
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
// Pagination + search controls (server-side via query params).
// ---------------------------------------------------------------------------

function TableControls({
  tab, companyId, q, per, count, page, children,
}: {
  tab: TabId
  companyId: number | null
  q: string
  per: number
  count: number
  page: number
  children: ReactNode
}) {
  const totalPages = Math.max(1, Math.ceil(count / per))
  const base = companyId ? `?company=${companyId}&tab=${tab}` : `?tab=${tab}`

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <form method="get" action="/platform/configuration" className="flex items-center gap-2">
          {companyId && <input type="hidden" name="company" value={companyId} />}
          <input type="hidden" name="tab" value={tab} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search..."
            className="h-9 w-56 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">Search</button>
          {q && <a href={base} className="text-sm text-muted-foreground hover:text-foreground">Clear</a>}
        </form>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Rows/page</span>
          <a href={`${base}&per=25`} className={`rounded-md border px-2 py-1 ${per === 25 ? 'bg-muted font-medium' : 'hover:bg-muted'}`}>25</a>
          <a href={`${base}&per=50`} className={`rounded-md border px-2 py-1 ${per === 50 ? 'bg-muted font-medium' : 'hover:bg-muted'}`}>50</a>
          <a href={`${base}&per=100`} className={`rounded-md border px-2 py-1 ${per === 100 ? 'bg-muted font-medium' : 'hover:bg-muted'}`}>100</a>
        </div>
      </div>

      {children}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Showing {count === 0 ? 0 : (page - 1) * per + 1}–{Math.min(page * per, count)} of {count}
        </span>
        <div className="flex items-center gap-1">
          {page > 1 && (
            <a href={`${base}&per=${per}&page=${page - 1}`} className="rounded-md border px-3 py-1 hover:bg-muted">Previous</a>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a key={p} href={`${base}&per=${per}&page=${p}`} className={`rounded-md border px-3 py-1 ${p === page ? 'bg-primary font-medium text-primary-foreground' : 'hover:bg-muted'}`}>{p}</a>
          ))}
          {page < totalPages && (
            <a href={`${base}&per=${per}&page=${page + 1}`} className="rounded-md border px-3 py-1 hover:bg-muted">Next</a>
          )}
        </div>
      </div>
    </>
  )
}

function Card({ title, description, children }: { title: ReactNode; description?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-4">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">Active</span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-300">Inactive</span>
  )
}

function Flag({ on }: { on: boolean }) {
  return <span className={on ? 'font-medium text-green-600 dark:text-green-400' : 'text-muted-foreground'}>{on ? '✓' : '—'}</span>
}

function Empty({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="p-8 text-center">
      <p className="font-medium">{text}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="rounded-xl border bg-background p-8 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 font-semibold">Platform Admin access required</h2>
      <p className="mt-1 text-sm text-muted-foreground">You need the Platform Admin role to view platform configuration.</p>
    </div>
  )
}
