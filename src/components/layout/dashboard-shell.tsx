'use client'

import { ReactNode, useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

export function DashboardShell({
  children,
  role = null,
}: {
  children: ReactNode
  /**
   * Role resolved on the server by the (app) layout. Passing it in lets the
   * sidebar render the correct navigation on first paint and never re-query
   * `profiles` when navigating (the shell now mounts once per session).
   */
  role?: string | null
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-muted/30">

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        role={role}
      />

      <div className="flex min-w-0 flex-1 flex-col">

        <Header
          onMenuClick={() => setSidebarOpen(true)}
          menuOpen={sidebarOpen}
        />

        <main className="flex-1 p-4 sm:p-6 lg:px-8">
          {children}
        </main>

      </div>

    </div>
  )
}
