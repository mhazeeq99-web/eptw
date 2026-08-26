'use client'

import { Menu } from 'lucide-react'
import { NotificationsBell } from './notifications-bell'
import { ThemeToggle } from './theme-toggle'
import { AccountMenu } from './account-menu'

export function Header({
  onMenuClick,
}: {
  onMenuClick: () => void
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
          aria-expanded={false}
        >
          <Menu className="h-5 w-5" />
        </button>

        <p className="truncate text-sm text-muted-foreground">
          Electronic Permit to Work
        </p>
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />

        <NotificationsBell />

        <AccountMenu />
      </div>
    </header>
  )
}
