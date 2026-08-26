'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

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

export function ThemeToggle() {
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

  return (
    <button
      type="button"
      onClick={toggle}
      className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      }
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </button>
  )
}
