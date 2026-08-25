'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton({
  collapsed = false,
}: {
  collapsed?: boolean
}) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()

    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={`mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${
        collapsed ? 'justify-center px-2' : ''
      }`}
      title={collapsed ? 'Sign out' : undefined}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {!collapsed && 'Sign out'}
    </button>
  )
}