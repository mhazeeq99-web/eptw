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
    instrument?: string | null
    instrument_id?: string | null
    calibration_status?: string | null
    test_location?: string | null
    result?: 'PASS' | 'CONDITIONAL' | 'FAIL' | null
    readings?: Array<{
      parameter?: string
      reading?: number | null
      unit?: string | null
      result?: 'PASS' | 'CONDITIONAL' | 'FAIL' | null
    }>
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

  const result =
    body.result === 'PASS' ||
    body.result === 'CONDITIONAL' ||
    body.result === 'FAIL'
      ? body.result
      : null

  const readings: Array<{
    parameter: string
    reading: number | null
    unit: string | null
    result: 'PASS' | 'CONDITIONAL' | 'FAIL' | null
  }> = (Array.isArray(body.readings) ? body.readings : [])
    .map((reading) => ({
      parameter:
        typeof reading.parameter === 'string'
          ? reading.parameter.trim()
          : '',
      reading: toNumber(reading.reading),
      unit:
        typeof reading.unit === 'string' &&
        reading.unit.trim()
          ? reading.unit.trim()
          : null,
      result:
        reading.result === 'PASS' ||
        reading.result === 'CONDITIONAL' ||
        reading.result === 'FAIL'
          ? reading.result
          : null,
    }))
    .filter((reading) => reading.parameter.length > 0)

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
        instrument:
          typeof body.instrument === 'string'
            ? body.instrument.trim() || null
            : null,
        instrument_id:
          typeof body.instrument_id === 'string'
            ? body.instrument_id.trim() || null
            : null,
        calibration_status:
          typeof body.calibration_status === 'string'
            ? body.calibration_status.trim() || null
            : null,
        test_location:
          typeof body.test_location === 'string'
            ? body.test_location.trim() || null
            : null,
        result,
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

  // Persist the flexible parameter readings.
  if (readings.length > 0) {
    const { error: readingsError } = await supabase
      .from('gas_test_readings')
      .insert(
        readings.map((reading, index) => ({
          gas_test_id: gasTest.id,
          parameter: reading.parameter,
          reading: reading.reading,
          unit: reading.unit,
          result: reading.result,
          sort_order: index,
        }))
      )

    if (readingsError) {
      console.error(
        'Failed to save gas test readings:',
        readingsError
      )
      return NextResponse.json(
        {
          error:
            'Gas test was recorded, but the parameter readings could not be saved. Please contact support.',
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json(
    {
      success: true,
      gas_test: gasTest,
    },
    { status: 201 }
  )
}
