import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermitAccess } from '@/lib/permit-access'

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const { id } = await params

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

  const access = await requirePermitAccess(
    supabase,
    user,
    id
  )

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    )
  }

  const permit = access.data.permit

  if (
    permit.status !== 'draft' &&
    permit.status !== 'pending_approval'
  ) {
    return NextResponse.json(
      {
        error:
          `Gas tests can only be recorded while the permit status is draft or pending approval (current: ${permit.status})`,
      },
      { status: 400 }
    )
  }

  let body: {
    tested_at?: string | null
    o2?: number | null
    lel?: number | null
    h2s?: number | null
    co?: number | null
    remarks?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') {
      return null
    }
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  const { data: gasTest, error: insertError } =
    await supabase
      .from('gas_tests')
      .insert({
        permit_id: permit.id,
        tester_id: user.id,
        tested_at:
          typeof body.tested_at === 'string' &&
          body.tested_at
            ? body.tested_at
            : new Date().toISOString(),
        o2: toNumber(body.o2),
        lel: toNumber(body.lel),
        h2s: toNumber(body.h2s),
        co: toNumber(body.co),
        remarks:
          typeof body.remarks === 'string'
            ? body.remarks.trim() || null
            : null,
        status: 'pending',
      })
      .select(`
        id,
        permit_id,
        tester_id,
        tested_at,
        o2,
        lel,
        h2s,
        co,
        remarks,
        status,
        created_at
      `)
      .single()

  if (insertError) {
    console.error(
      'Failed to record gas test:',
      insertError
    )

    return NextResponse.json(
      {
        error:
          insertError?.message ||
          'Unable to record gas test',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      gas_test: gasTest,
    },
    { status: 201 }
  )
}
