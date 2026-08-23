'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'

type Preference = {
  event_type: string
  label: string
  email_enabled: boolean
}

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preference[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch('/api/notification-preferences')

        const body = await response.json()

        if (!cancelled) {
          if (!response.ok) {
            throw new Error(
              body.error ?? 'Failed to load notification preferences'
            )
          }

          setPreferences(body.preferences ?? [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load notification preferences'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  async function toggle(
    preference: Preference,
    emailEnabled: boolean
  ) {
    setSaving(preference.event_type)
    setError('')

    try {
      const response = await fetch(
        '/api/notification-preferences',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_type: preference.event_type,
            email_enabled: emailEnabled,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ?? 'Unable to update preference'
        )
      }

      setPreferences((current) =>
        current.map((item) =>
          item.event_type === preference.event_type
            ? { ...item, email_enabled: emailEnabled }
            : item
        )
      )
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Unable to update preference'
      )
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="rounded-xl border bg-background">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="font-semibold">
            Notification Preferences
          </h2>

          <p className="text-sm text-muted-foreground">
            Choose which events send you email notifications.
            In-app notifications are always delivered.
          </p>
        </div>
      </div>

      {error && (
        <div className="border-b px-6 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="p-6 text-sm text-muted-foreground">
          Loading preferences...
        </p>
      ) : (
        <div className="divide-y">
          {preferences.map((preference) => (
            <div
              key={preference.event_type}
              className="flex items-center justify-between p-4"
            >
              <p className="text-sm font-medium">
                {preference.label}
              </p>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preference.email_enabled}
                  disabled={saving === preference.event_type}
                  onChange={(event) =>
                    toggle(
                      preference,
                      event.target.checked
                    )
                  }
                />
                Email
              </label>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
