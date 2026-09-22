'use client'

import { Menu } from 'lucide-react'
import { NotificationsBell } from './notifications-bell'
import { ThemeToggle } from './theme-toggle'
import { AccountMenu } from './account-menu'
import { CompanyBadge } from './company-badge'

export function Header({
  onMenuClick,
  menuOpen = false,
}: {
  onMenuClick: () => void
  menuOpen?: boolean
}) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 hover:bg-muted lg:hidden"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* The app title lives beside the sidebar logo now, so the header only
            carries the company code badge. */}
        <CompanyBadge />
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />

        <NotificationsBell />

        <AccountMenu />
      </div>
    </header>
  )
}
