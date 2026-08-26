import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Marks the authenticated user's account as ACTIVE after they have set their
 * password via the invitation link: clears invitation_sent_at so the account
 * no longer shows as INVITED. No-op for already-active accounts.
 */
export async function POST() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ invitation_sent_at: null })
    .eq('id', user.id)

  if (error) {
    console.error('Failed to activate invitation:', error)
    return NextResponse.json(
      { error: 'Unable to activate account' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
