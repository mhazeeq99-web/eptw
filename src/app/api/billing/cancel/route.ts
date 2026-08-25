import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BillingNotConfiguredError, cancelSubscription } from '@/lib/billing'

/**
 * Cancels the company's Pro subscription server-side: cancels the HitPay
 * recurring billing agreement and marks the local subscription cancelled.
 * The company falls back to FREE entitlements for NEW resources; no data is
 * deleted and existing permits/users stay accessible.
 *
 * Only company administrators (safety_manager) may cancel.
 */
export async function POST() {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, company_id, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    return NextResponse.json(
      { error: 'Your account is inactive' },
      { status: 403 }
    )
  }

  if (profile.role !== 'safety_manager' || !profile.company_id) {
    return NextResponse.json(
      {
        error:
          'Only company administrators can cancel the Pro subscription',
      },
      { status: 403 }
    )
  }

  try {
    const result = await cancelSubscription(
      createAdminClient(),
      profile.company_id
    )

    if (!result.cancelled) {
      return NextResponse.json(
        { error: result.message ?? 'No active Pro subscription' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 }
      )
    }
    console.error('Billing cancel error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to cancel the Pro subscription',
      },
      { status: 500 }
    )
  }
}
