import Link from 'next/link'
import {
  SlidersHorizontal,
  ShieldCheck,
  ClipboardList,
  ScrollText,
  Building2,
  Info,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Filter,
  Layers,
  Settings
} from 'lucide-react'
import { Suspense, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { BackButton } from '@/components/ui/back-button'
import { CompanySelector } from '@/components/platform/company-selector'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

const TABS = [
  { id: 'permit_types', label: 'Permit Types', icon: SlidersHorizontal, description: 'Company-specific permit types' },
  { id: 'safety_controls', label: 'Safety Controls', icon: ShieldCheck, description: 'Global safety control catalogue' },
  { id: 'ppe', label: 'PPE Catalogue', icon: ClipboardList, description: 'Global PPE items' },
  { id: 'checklists', label: 'Checklist Templates', icon: ScrollText, description: 'Site verification templates' },
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
          <AccessDenied />
        </div>
      </DashboardShell>
    )
  }

  // Resolve the selected company
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
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-6">
          <BackButton href="/dashboard" label="Back to Platform" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Platform Configuration
                </h1>
                <p className="mt-1 text-muted-foreground">
                  View and manage platform-wide configuration
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Layers className="mr-1 h-3 w-3" />
            Platform Admin
          </Badge>
        </div>

        {/* Company Selector */}
        <Card>
          <CardContent className="p-6">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Company
            </label>
            <Suspense fallback={<div className="h-10 rounded-md border bg-gray-100 dark:bg-gray-800 animate-pulse" />}>
              <CompanySelector currentCompanyId={companyId ? String(companyId) : null} currentTab={activeTab} />
            </Suspense>
          </CardContent>
        </Card>

        {!selectedCompany ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <Building2 className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                Select a Company
              </h2>
              <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
                Choose a company above to view its Permit Types, Safety Controls, PPE Catalogue and Checklist Templates.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Selected Company Context */}
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Company</p>
                  <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">{selectedCompany.name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Code</p>
                  <p className="mt-0.5 font-mono text-sm text-gray-900 dark:text-white">{selectedCompany.code ?? '—'}</p>
                </div>
                <Badge variant="success" className="ml-auto">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Viewing: {selectedCompany.name}
                </Badge>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Card>
              <CardContent className="p-2">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {TABS.map((tab) => {
                    const Icon = tab.icon
                    const isActive = tab.id === activeTab
                    return (
                      <Link
                        key={tab.id}
                        href={`/platform/configuration?company=${selectedCompany.id}&tab=${tab.id}`}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                        <div>
                          <p className="font-medium">{tab.label}</p>
                          <p className={`text-xs ${isActive ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                            {tab.description}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {content}
          </>
        )}
      </div>
    </DashboardShell>
  )
}

// ---------------------------------------------------------------------------
// Permit types
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
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Permit Types
        </CardTitle>
        <CardDescription>
          {count ?? rows.length} type{(count ?? rows.length) === 1 ? '' : 's'} configured
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <TableControls tab="permit_types" companyId={companyId} q={q} per={per} count={count ?? rows.length} page={page}>
          {rows.length === 0 ? (
            <Empty text="No Permit Types" detail="This company currently has no configured permit types." />
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      {['Name', 'Code', 'Status', 'JHA', 'LOTO', 'Gas', 'Site', 'Briefing', 'Emergency'].map((h) => (
                        <th key={h} className="px-4 py-4 text-left font-medium text-gray-500 dark:text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {rows.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{row.name}</td>
                        <td className="px-4 py-4">
                          {row.code ? (
                            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-white">{row.code}</code>
                          ) : '—'}
                        </td>
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
              </div>
            </ScrollArea>
          )}
        </TableControls>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Safety controls
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
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Global Safety Control Catalogue
          </p>
          <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
            Safety controls are a shared catalogue. Company-specific requirements are managed via permit type mappings.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Safety Controls
          </CardTitle>
          <CardDescription>
            {count ?? rows.length} control{(count ?? rows.length) === 1 ? '' : 's'} in catalogue
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <TableControls tab="safety_controls" companyId={null} q={q} per={per} count={count ?? rows.length} page={page}>
            {rows.length === 0 ? (
              <Empty text="No Safety Controls" detail="No safety controls configured." />
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        {['Name', 'Code', 'Category', 'Status'].map((h) => (
                          <th key={h} className="px-4 py-4 text-left font-medium text-gray-500 dark:text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {rows.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{row.name}</td>
                          <td className="px-4 py-4">
                            {row.code ? (
                              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-900 dark:bg-gray-800 dark:text-white">{row.code}</code>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{row.category ?? '—'}</td>
                          <td className="px-4 py-4"><ActiveBadge isActive={row.is_active} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            )}
          </TableControls>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PPE
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
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Global PPE Catalogue
          </p>
          <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
            PPE items are shared across companies. Company-specific mappings are managed via permit type PPE requirements.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            PPE Catalogue
          </CardTitle>
          <CardDescription>
            {count ?? rows.length} item{(count ?? rows.length) === 1 ? '' : 's'} in catalogue
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <TableControls tab="ppe" companyId={null} q={q} per={per} count={count ?? rows.length} page={page}>
            {rows.length === 0 ? (
              <Empty text="No PPE Items" detail="No PPE catalogue items configured." />
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        {['Name', 'Category', 'Status'].map((h) => (
                          <th key={h} className="px-4 py-4 text-left font-medium text-gray-500 dark:text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {rows.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{row.name}</td>
                          <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{row.category}</td>
                          <td className="px-4 py-4"><ActiveBadge isActive={row.is_active} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            )}
          </TableControls>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checklists
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
    <Card>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Checklist Templates
        </CardTitle>
        <CardDescription>
          For the selected company's permit types
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {breakdown.length === 0 ? (
          <Empty text="No Permit Types" detail="This company currently has no configured permit types." />
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-4 text-left font-medium text-gray-500 dark:text-gray-400">Permit Type</th>
                    <th className="px-4 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Template Items</th>
                    <th className="px-4 py-4 text-right font-medium text-gray-500 dark:text-gray-400">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {breakdown.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{row.name}</td>
                      <td className="px-4 py-4 text-right">
                        {row.items > 0 ? (
                          <Badge variant="secondary">{row.items}</Badge>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-600 dark:text-gray-400">{row.required}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Pagination + search controls
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
        <form method="get" action="/platform/configuration" className="flex items-center gap-2">
          {companyId && <input type="hidden" name="company" value={companyId} />}
          <input type="hidden" name="tab" value={tab} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search..."
              className="h-10 w-64 rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Search
          </button>
          {q && (
            <a href={base} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
              Clear
            </a>
          )}
        </form>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">Rows/page:</span>
          {PER_OPTIONS.map((opt) => (
            <a
              key={opt}
              href={`${base}&per=${opt}`}
              className={`rounded-md border px-2.5 py-1 ${
                per === opt
                  ? 'bg-blue-600 font-medium text-white'
                  : 'border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'
              }`}
            >
              {opt}
            </a>
          ))}
        </div>
      </div>

      {children}

      {count > per && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4 text-sm dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">
            Showing {count === 0 ? 0 : (page - 1) * per + 1}–{Math.min(page * per, count)} of {count}
          </span>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <a
                href={`${base}&per=${per}&page=${page - 1}`}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </a>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`${base}&per=${per}&page=${p}`}
                className={`rounded-lg border px-3 py-2 ${
                  p === page
                    ? 'bg-blue-600 font-medium text-white'
                    : 'border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'
                }`}
              >
                {p}
              </a>
            ))}
            {page < totalPages && (
              <a
                href={`${base}&per=${per}&page=${page + 1}`}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="success">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      Active
    </Badge>
  ) : (
    <Badge variant="secondary">
      <XCircle className="mr-1 h-3 w-3" />
      Inactive
    </Badge>
  )
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={on ? 'font-medium text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'}>
      {on ? '✓' : '—'}
    </span>
  )
}

function Empty({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="p-8 text-center">
      <p className="font-medium text-gray-900 dark:text-white">{text}</p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{detail}</p>
    </div>
  )
}

function AccessDenied() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-12 text-center">
        <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
          <ShieldCheck className="h-12 w-12 text-gray-400 dark:text-gray-500" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
          Platform Admin Access Required
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          You need the Platform Admin role to view platform configuration.
        </p>
      </CardContent>
    </Card>
  )
}