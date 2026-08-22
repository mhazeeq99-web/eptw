'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NotificationsBell } from './notifications-bell'

export function Header() {
  const [fullName, setFullName] = useState('User')
  const [role, setRole] = useState('User')

  useEffect(() => {
    const supabase = createClient()

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()

      if (profile) {
        setFullName(profile.full_name)
        setRole(formatRole(profile.role))
      }
    }

    loadProfile()
  }, [])

  const initials = getInitials(fullName)

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Electronic Permit to Work
        </p>
      </div>

      <div className="flex items-center gap-4">
        <NotificationsBell />

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
