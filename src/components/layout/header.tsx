import { Bell } from 'lucide-react'

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Electronic Permit to Work
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative rounded-md p-2 hover:bg-muted"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            MH
          </div>

          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">
              Muhammad Hazeeq
            </p>
            <p className="text-xs text-muted-foreground">
              Administrator
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}