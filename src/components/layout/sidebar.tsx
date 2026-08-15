'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  Users,
  UserCog,
  Wrench,
  MapPin,
  ShieldCheck,
  LockKeyhole,
  Gauge,
  Settings,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { SignOutButton } from './sign-out-button'

const navigation = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Permits',
    href: '/permits',
    icon: FileText,
  },
  {
    label: 'My Permits',
    href: '/permits/mine',
    icon: ClipboardCheck,
  },
  {
    label: 'Approval Queue',
    href: '/permits/approvals',
    icon: ShieldCheck,
  },
]

const management = [
  {
    label: 'Contractors',
    href: '/contractors',
    icon: Users,
  },
  {
    label: 'Equipment',
    href: '/equipment',
    icon: Wrench,
  },
  {
    label: 'Areas',
    href: '/areas',
    icon: MapPin,
  },
]

const safety = [
  {
    label: 'JSA / JHA',
    href: '/safety/jha',
    icon: ClipboardCheck,
  },
  {
    label: 'LOTO',
    href: '/safety/loto',
    icon: LockKeyhole,
  },
  {
    label: 'Gas Testing',
    href: '/safety/gas-testing',
    icon: Gauge,
  },
]

export function Sidebar() {
  const [isSafetyManager, setIsSafetyManager] =
    useState(false)

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

      if (profile?.role === 'safety_manager') {
        setIsSafetyManager(true)
      }
    }

    loadRole()
  }, [])

  const managementItems = isSafetyManager
    ? [
        {
          label: 'Contractors',
          href: '/contractors',
          icon: Users,
        },
        {
          label: 'Users',
          href: '/company/users',
          icon: UserCog,
        },
        {
          label: 'Equipment',
          href: '/equipment',
          icon: Wrench,
        },
        {
          label: 'Areas',
          href: '/areas',
          icon: MapPin,
        },
      ]
    : management

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-background lg:flex lg:flex-col">

      <div className="flex h-16 items-center border-b px-6">
        <div>
          <div className="text-xl font-bold tracking-tight">
            ePTW
          </div>

          <div className="text-xs text-muted-foreground">
            Permit to Work
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-4">

        <NavigationSection items={navigation} />

        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Management
          </p>

          <NavigationSection items={managementItems} />
        </div>

        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Safety
          </p>

          <NavigationSection items={safety} />
        </div>

      </nav>

      <div className="border-t p-4">

        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>

        <SignOutButton />

      </div>
    </aside>
  )
}

function NavigationSection({
  items,
}: {
  items: {
    label: string
    href: string
    icon: React.ElementType
  }[]
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon

        return (
          <Link
            key={item.label}
            href={item.href}
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
