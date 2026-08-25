import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BillingNotConfiguredError, startCheckout } from '@/lib/billing'

/**
 * Starts the HitPay Pro checkout for the caller's company.
 *
 * Server-side only: the company id always comes from the authenticated
 * profile, never from the client. Only company administrators
 * (safety_manager) may initiate billing actions.
 *
 * Returns the HitPay hosted checkout URL; the company is NOT upgraded until
 * the verified webhook arrives.
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
    .select('id, role, company_id, is_active, full_name')
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
          'Only company administrators can start the Pro checkout',
      },
      { status: 403 }
    )
  }

  try {
    const checkout = await startCheckout(
      createAdminClient(),
      profile.company_id,
      user.email ?? '',
      profile.full_name ?? ''
    )

    return NextResponse.json({
      success: true,
      url: checkout.url,
      reference: checkout.reference,
    })
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 }
      )
    }
    console.error('Billing checkout error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to start the Pro checkout',
      },
      { status: 500 }
    )
  }
}
