'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'

type Notification = {
  id: number
  permit_id: number | null
  type: string
  title: string
  message: string | null
  is_read: boolean
  created_at: string
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  async function loadNotifications() {
    try {
      const response = await fetch('/api/notifications')

      const body = await response.json()

      if (response.ok) {
        setNotifications(body.notifications ?? [])
        setUnreadCount(body.unread_count ?? 0)
      }
    } catch {
      // Non-critical; keep the bell quiet on failure.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()

    // Refresh every 45 seconds while the page is open.
    const interval = setInterval(loadNotifications, 45000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () =>
      document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleOpen() {
    const nextOpen = !open
    setOpen(nextOpen)

    if (nextOpen && unreadCount > 0) {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
      })

      setUnreadCount(0)
      loadNotifications()
    }
  }

  // Explicit "Mark all read" action: previously this was wired to handleOpen,
  // so the labelled action only closed the panel (DESIGN.md §86 — the control
  // must do what it says).
  async function handleMarkAllRead() {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
      })
      setUnreadCount(0)
      await loadNotifications()
    } catch (error) {
      console.error('Failed to mark notifications read:', error)
    }
  }

  // Escape closes the panel (matches the account menu / sidebar drawer).
  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  async function handleNotificationClick(
    notification: Notification
  ) {
    if (!notification.is_read) {
      await fetch(
        `/api/notifications/${notification.id}/read`,
        {
          method: 'POST',
        }
      )
    }

    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="relative rounded-md p-2 hover:bg-muted"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />

        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white dark:bg-destructive/20 dark:text-destructive">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>

            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">
                Loading...
              </p>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No notifications.
              </p>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={notification.is_read ? '' : 'bg-muted/30'}
                >
                  {notification.permit_id ? (
                    <Link
                      href={`/permits/${notification.permit_id}`}
                      onClick={() =>
                        handleNotificationClick(notification)
                      }
                      className="block px-4 py-3 hover:bg-muted/50"
                    >
                      <p className="text-sm font-medium">
                        {notification.title}
                      </p>

                      {notification.message && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {notification.message}
                        </p>
                      )}

                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatRelative(notification.created_at)}
                      </p>
                    </Link>
                  ) : (
                    <div className="px-4 py-3">
                      <p className="text-sm font-medium">
                        {notification.title}
                      </p>

                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatRelative(notification.created_at)}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatRelative(value: string) {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)

  if (hours < 24) return `${hours}h ago`

  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
  }).format(date)
}
