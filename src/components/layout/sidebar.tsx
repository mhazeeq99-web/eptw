'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  ShieldCheck,
  PlayCircle,
  PauseCircle,
  History,
  Users,
  UserCog,
  Wrench,
  MapPin,
  ClipboardList,
  LockKeyhole,
  Gauge,
  BarChart3,
  Settings,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  ChevronRight,
  Plus,
  Building2,
  SlidersHorizontal,
  Receipt,
  ScrollText,
  ShieldAlert,
  Search,
  HeartPulse,
  MessageSquare,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { findActiveHref } from '@/lib/nav-active'
import { SignOutButton } from './sign-out-button'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  /** Rendered as a prominent primary action (e.g. Create Permit). */
  primary?: boolean
}

type Section = { title: string; items: NavItem[] }

/** Sections per role — navigation visibility only. API/RLS remains authoritative. */
function buildSections(role: string | null): Section[] {
  const dashboard: NavItem = {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  }
  const reports: NavItem = {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
  }

  const operations = [
    dashboard,
    { label: 'All Permits', href: '/permits', icon: FileText },
    { label: 'My Permits', href: '/permits/mine', icon: ClipboardCheck },
    { label: 'Approval Queue', href: '/permits/approvals', icon: ShieldCheck },
    { label: 'Active Permits', href: '/permits/active', icon: PlayCircle },
    { label: 'Suspended', href: '/permits/suspended', icon: PauseCircle },
    { label: 'History', href: '/permits/history', icon: History },
  ]
  const safety = [
    { label: 'JSA / JHA', href: '/safety/jha', icon: ClipboardList },
    { label: 'LOTO', href: '/safety/loto', icon: LockKeyhole },
    { label: 'Gas Testing', href: '/safety/gas-testing', icon: Gauge },
  ]
  const settingsSection: Section = {
    title: 'Settings',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings },
      { label: 'Feedback', href: '/settings/feedback', icon: MessageSquare },
      { label: 'Subscription', href: '/settings/subscription', icon: CreditCard },
    ],
  }

  switch (role) {
    case 'platform_admin':
      return [
        {
          title: 'Platform',
          items: [
            dashboard,
            { label: 'Companies', href: '/companies', icon: Building2 },
            { label: 'Users', href: '/platform/users', icon: Users },
          ],
        },
        {
          title: 'Configuration',
          items: [
            {
              label: 'Permit Types',
              href: '/platform/configuration?tab=permit_types',
              icon: SlidersHorizontal,
            },
            {
              label: 'Safety Controls',
              href: '/platform/configuration?tab=safety_controls',
              icon: ShieldCheck,
            },
            {
              label: 'PPE Catalogue',
              href: '/platform/configuration?tab=ppe',
              icon: ClipboardList,
            },
            {
              label: 'Checklist Templates',
              href: '/platform/configuration?tab=checklists',
              icon: ScrollText,
            },
          ],
        },
        {
          title: 'Billing',
          items: [
            { label: 'Plans', href: '/platform/billing?tab=plans', icon: CreditCard },
            {
              label: 'Subscriptions',
              href: '/platform/billing?tab=subscriptions',
              icon: Receipt,
            },
            {
              label: 'Payments',
              href: '/platform/billing?tab=payments',
              icon: BarChart3,
            },
          ],
        },
        {
          title: 'Security',
          items: [
            { label: 'Audit Log', href: '/platform/audit', icon: ScrollText },
            { label: 'Security Events', href: '/platform/security', icon: ShieldAlert },
          ],
        },
        {
          title: 'Support',
          items: [
            { label: 'Company Lookup', href: '/platform/support?tab=company', icon: Search },
            { label: 'User Lookup', href: '/platform/support?tab=user', icon: Users },
            { label: 'Permit Lookup', href: '/platform/support?tab=permit', icon: FileText },
            { label: 'System Health', href: '/platform/system-health', icon: HeartPulse },
          ],
        },
        { title: 'Account', items: [{ label: 'Settings', href: '/settings', icon: Settings }, { label: 'Feedback', href: '/settings/feedback', icon: MessageSquare }] },
      ]

    case 'safety_manager':
      return [
        {
          title: 'Operations',
          items: [
            { label: 'Create Permit', href: '/permits/new', icon: Plus, primary: true },
            ...operations,
            reports,
          ],
        },
        {
          title: 'Management',
          items: [
            { label: 'Contractors', href: '/contractors', icon: Users },
            { label: 'Users', href: '/company/users', icon: UserCog },
            { label: 'Equipment', href: '/equipment', icon: Wrench },
            { label: 'Areas', href: '/areas', icon: MapPin },
          ],
        },
        { title: 'Safety', items: safety },
        settingsSection,
      ]

    case 'safety_coordinator':
      return [
        {
          title: 'Operations',
          items: [
            { label: 'Create Permit', href: '/permits/new', icon: Plus, primary: true },
            ...operations,
            reports,
          ],
        },
        { title: 'Safety', items: safety },
      ]

    case 'internal_staff':
      return [
        {
          title: 'Operations',
          items: [
            { label: 'New Permit', href: '/permits/new', icon: Plus, primary: true },
            { label: 'My Permits', href: '/permits/mine', icon: ClipboardCheck },
            { label: 'Permit History', href: '/permits/history', icon: History },
          ],
        },
        {
          title: 'Account',
          items: [
            { label: 'Feedback', href: '/settings/feedback', icon: MessageSquare },
          ],
        },
      ]

    case 'contractor_admin':
      return [
        {
          title: 'Operations',
          items: [
            {
              label: 'Create Contractor PTW',
              href: '/permits/new',
              icon: Plus,
              primary: true,
            },
            { label: 'My Permits', href: '/permits/mine', icon: ClipboardCheck },
            { label: 'All Permits', href: '/permits', icon: FileText },
            { label: 'Permit History', href: '/permits/history', icon: History },
          ],
        },
        {
          title: 'Account',
          items: [
            { label: 'Feedback', href: '/settings/feedback', icon: MessageSquare },
          ],
        },
      ]

    default:
      return [{ title: 'Operations', items: [dashboard] }]
  }
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const [role, setRole] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  // Query string is resolved on the client only: useSearchParams() would force
  // a Suspense boundary and drop the server-rendered nav on prerendered pages
  // (e.g. /companies), while reading window during render would break
  // hydration. Empty during SSR/hydration, filled by the effect below.
  const [search, setSearch] = useState('')

  useEffect(() => {
    setSearch(window.location.search)
  }, [pathname])

  /** Close the mobile drawer and pick up query-only navigations (tab links). */
  function handleNavigate() {
    onClose()
    window.requestAnimationFrame(() => setSearch(window.location.search))
  }

  useEffect(() => {
    const supabase = createClient()

    async function loadRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile) {
        setRole(profile.role)
      }
    }

    loadRole()
  }, [])

  // Close the drawer with Escape.
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const sections = buildSections(role)
  const activeHref = findActiveHref(sections, pathname, search)

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar shadow-xl transition-[width,transform] duration-200 lg:static lg:z-auto lg:shadow-none lg:transition-[width] ${
          collapsed ? 'lg:w-20' : 'lg:w-72'
        } w-72 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Sidebar navigation"
      >
        {/* Brand + controls */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
              P
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-base font-bold leading-tight tracking-tight">
                  ePTW
                </div>
                <div className="truncate text-xs leading-tight text-muted-foreground">
                  Permit to Work
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="hidden rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:inline-flex"
              aria-label={
                collapsed ? 'Expand sidebar' : 'Collapse sidebar'
              }
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-3"
          aria-label="Primary"
        >
          {sections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.href + item.label}
                    item={item}
                    isActive={item.href === activeHref}
                    collapsed={collapsed}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t p-3">
          {!collapsed && (
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </p>
          )}
          <SignOutButton collapsed={collapsed} />
        </div>
      </aside>
    </>
  )
}

function NavLink({
  item,
  isActive,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  onNavigate: () => void
}) {
  const Icon = item.icon
  const primary = item.primary

  const classes = [
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    collapsed ? 'justify-center px-2' : 'justify-start',
    primary
      ? 'bg-primary font-medium text-primary-foreground hover:bg-primary/90'
      : isActive
        ? // Active is a tinted primary surface (distinct from the neutral
          // hover below, and visible against bg-sidebar in both themes).
          'bg-primary/10 font-semibold text-primary hover:bg-primary/15'
        : // Hover uses the sidebar accent token: `bg-muted` was within ~1%
          // lightness of `bg-sidebar`, so the mouse highlight was invisible.
          'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  ].join(' ')

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={classes}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {primary && <ChevronRight className="h-4 w-4 shrink-0" />}
        </>
      )}
    </Link>
  )
}
