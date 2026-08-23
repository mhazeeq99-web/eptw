import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EVENT_TYPES, EVENT_LABELS } from '@/lib/notification-events'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { data: preferences, error } = await supabase
    .from('notification_preferences')
    .select('event_type, email_enabled')
    .eq('user_id', user.id)

  if (error) {
    console.error('Failed to load notification preferences:', error)
    return NextResponse.json(
      { error: 'Failed to load notification preferences' },
      { status: 500 }
    )
  }

  const stored = new Map(
    (preferences ?? []).map((preference) => [
      preference.event_type,
      preference.email_enabled,
    ])
  )

  const result = EVENT_TYPES.map((eventType) => ({
    event_type: eventType,
    label: EVENT_LABELS[eventType] ?? eventType,
    email_enabled: stored.get(eventType) ?? true,
  }))

  return NextResponse.json({ preferences: result })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  let body: {
    event_type?: string
    email_enabled?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const eventType = body.event_type

  if (!eventType || !EVENT_TYPES.includes(eventType)) {
    return NextResponse.json(
      { error: 'Invalid event type' },
      { status: 400 }
    )
  }

  if (typeof body.email_enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'email_enabled must be a boolean' },
      { status: 400 }
    )
  }

  const { error: upsertError } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: user.id,
        event_type: eventType,
        email_enabled: body.email_enabled,
      },
      {
        onConflict: 'user_id,event_type',
        ignoreDuplicates: false,
      }
    )

  if (upsertError) {
    console.error('Failed to save notification preference:', upsertError)
    return NextResponse.json(
      { error: 'Failed to save notification preference' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
