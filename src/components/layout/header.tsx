'use client'

import { Menu } from 'lucide-react'
import { NotificationsBell } from './notifications-bell'
import { ThemeToggle } from './theme-toggle'
import { AccountMenu } from './account-menu'
import { CompanyBadge } from './company-badge'

export function Header({
  onMenuClick,
}: {
  onMenuClick: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 hover:bg-muted lg:hidden"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={false}
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            Electronic Permit to Work
          </p>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            Safety operations workspace
          </p>
        </div>

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
