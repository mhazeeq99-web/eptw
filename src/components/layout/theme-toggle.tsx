'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark'

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

/**
 * Shared day/dark mode control (single implementation for the whole app).
 *
 * - `variant="icon"` (default): compact icon-only button used in the app header.
 * - `variant="pill"`: labelled floating control used on the public pages
 *   (login / landing) so they reuse this component instead of duplicating the
 *   theme storage logic.
 *
 * Both variants use the same `eptw-theme` storage key and toggle the `.dark`
 * class on <html>, matching the pre-hydration script in src/app/layout.tsx.
 */
export function ThemeToggle({
  variant = 'icon',
  className,
}: {
  variant?: 'icon' | 'pill'
  className?: string
} = {}) {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    // Resolve initial theme: stored preference, else system preference.
    const stored = localStorage.getItem('eptw-theme')
    const initial: Theme =
      stored === 'dark' || stored === 'light'
        ? stored
        : systemPrefersDark()
          ? 'dark'
          : 'light'
    setTheme(initial)
    applyTheme(initial)
  }, [])

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('eptw-theme', next)
      applyTheme(next)
      return next
    })
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  const title = theme === 'dark' ? 'Light mode' : 'Dark mode'

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={title}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-gray-200/70 bg-white/80 px-3.5 py-2 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-800',
          className
        )}
      >
        {theme === 'dark' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
      aria-label={label}
      title={title}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </button>
  )
}
