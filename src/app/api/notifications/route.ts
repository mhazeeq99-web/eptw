import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select(`
      id,
      user_id,
      permit_id,
      type,
      title,
      message,
      is_read,
      created_at
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    console.error('Failed to load notifications:', error)
    return NextResponse.json(
      { error: 'Failed to load notifications' },
      { status: 500 }
    )
  }

  const unread = (notifications ?? []).filter(
    (notification) => !notification.is_read
  ).length

  return NextResponse.json({
    notifications: notifications ?? [],
    unread_count: unread,
  })
}
