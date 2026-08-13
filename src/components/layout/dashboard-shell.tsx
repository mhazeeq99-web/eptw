import { ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

export function DashboardShell({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}