import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export async function Header() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let fullName = 'User'
  let role = 'User'

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single()

    if (profile) {
      fullName = profile.full_name
      role = formatRole(profile.role)
    }
  }

  const initials = getInitials(fullName)

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">

      {/* Left */}
      <div>
        <p className="text-sm text-muted-foreground">
          Electronic Permit to Work
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">

        {/* Notifications */}
        <button
          type="button"
          className="relative rounded-md p-2 hover:bg-muted"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        {/* User */}
        <div className="flex items-center gap-3">

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {initials}
          </div>

          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">
              {fullName}
            </p>

            <p className="text-xs text-muted-foreground">
              {role}
            </p>
          </div>

        </div>
      </div>
    </header>
  )
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase()
}

function formatRole(role: string) {
  return role
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}