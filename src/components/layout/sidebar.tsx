'use client'

import Link from 'next/link'
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
  X,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { SignOutButton } from './sign-out-button'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
}

const ALL_PERMITS: NavItem[] = [
  { label: 'All Permits', href: '/permits', icon: FileText },
  { label: 'My Permits', href: '/permits/mine', icon: ClipboardCheck },
  { label: 'Approval Queue', href: '/permits/approvals', icon: ShieldCheck },
  { label: 'Active Permits', href: '/permits/active', icon: PlayCircle },
  { label: 'Suspended', href: '/permits/suspended', icon: PauseCircle },
  { label: 'History', href: '/permits/history', icon: History },
]

const SAFETY_ITEMS: NavItem[] = [
  { label: 'JSA / JHA', href: '/safety/jha', icon: ClipboardList },
  { label: 'LOTO', href: '/safety/loto', icon: LockKeyhole },
  { label: 'Gas Testing', href: '/safety/gas-testing', icon: Gauge },
]

const MANAGEMENT_ITEMS: NavItem[] = [
  { label: 'Contractors', href: '/contractors', icon: Users },
  { label: 'Users', href: '/company/users', icon: UserCog },
  { label: 'Equipment', href: '/equipment', icon: Wrench },
  { label: 'Areas', href: '/areas', icon: MapPin },
]

function buildSections(
  role: string | null
): Array<{ title: string; items: NavItem[] }> {
  const dashboard: NavItem = {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  }

  const createPermit: NavItem = {
    label:
      role === 'contractor_admin'
        ? 'Create Contractor PTW'
        : 'Create Permit',
    href: '/permits/new',
    icon: FileText,
  }

  const reports: NavItem = {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
  }

  switch (role) {
    case 'platform_admin':
      return [
        { title: 'Main', items: [dashboard] },
        {
          title: 'Permits',
          items: [
            { label: 'All Permits', href: '/permits', icon: FileText },
            {
              label: 'Active Permits',
              href: '/permits/active',
              icon: PlayCircle,
            },
            {
              label: 'Suspended',
              href: '/permits/suspended',
              icon: PauseCircle,
            },
          ],
        },
        { title: 'Reports', items: [reports] },
        {
          title: 'Settings',
          items: [
            { label: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ]

    case 'safety_manager':
      return [
        { title: 'Main', items: [dashboard] },
        { title: 'Permits', items: [createPermit, ...ALL_PERMITS] },
        { title: 'Management', items: MANAGEMENT_ITEMS },
        { title: 'Safety', items: SAFETY_ITEMS },
        { title: 'Reports', items: [reports] },
        {
          title: 'Settings',
          items: [
            { label: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ]

    case 'safety_coordinator':
      return [
        { title: 'Main', items: [dashboard] },
        { title: 'Permits', items: [createPermit, ...ALL_PERMITS] },
        { title: 'Safety', items: SAFETY_ITEMS },
        { title: 'Reports', items: [reports] },
      ]

    case 'internal_staff':
      return [
        { title: 'Main', items: [dashboard] },
        {
          title: 'Permits',
          items: [
            {
              label: 'My Permits',
              href: '/permits/mine',
              icon: ClipboardCheck,
            },
            createPermit,
            {
              label: 'Permit History',
              href: '/permits/history',
              icon: History,
            },
          ],
        },
      ]

    case 'contractor_admin':
      return [
        { title: 'Main', items: [dashboard] },
        {
          title: 'Permits',
          items: [
            {
              label: 'My Permits',
              href: '/permits/mine',
              icon: ClipboardCheck,
            },
            createPermit,
            { label: 'Permits', href: '/permits', icon: FileText },
            {
              label: 'Permit History',
              href: '/permits/history',
              icon: History,
            },
          ],
        },
      ]

    default:
      return [
        { title: 'Main', items: [dashboard] },
        {
          title: 'Permits',
          items: [
            {
              label: 'My Permits',
              href: '/permits/mine',
              icon: ClipboardCheck,
            },
            createPermit,
          ],
        },
      ]
  }
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [role, setRole] = useState<string | null>(null)

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

  // Close the drawer with the Escape key.
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () =>
      document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Prevent background scrolling while the drawer is open.
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const sections = buildSections(role)

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          open
            ? 'opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-background shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex h-16 items-center justify-between border-b px-6">
          <div>
            <div className="text-xl font-bold tracking-tight">
              ePTW
            </div>

            <div className="text-xs text-muted-foreground">
              Permit to Work
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-muted"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>

              <NavigationSection
                items={section.items}
                onNavigate={onClose}
              />
            </div>
          ))}
        </nav>

        <div className="border-t p-4">
          {(role === 'safety_manager' ||
            role === 'platform_admin') && (
            <Link
              href="/settings"
              onClick={onClose}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}

          <SignOutButton />
        </div>
      </aside>
    </>
  )
}

function NavigationSection({
  items,
  onNavigate,
}: {
  items: NavItem[]
  onNavigate: () => void
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
