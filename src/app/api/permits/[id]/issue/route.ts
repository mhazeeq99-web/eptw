import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Update permit to issued status
    const { data: permit, error: updateError } = await supabase
      .from('permits')
      .update({
        status: 'issued',
        workflow_stage: 'issued',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error issuing permit:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Record in approvals history
    const { error: historyError } = await supabase
      .from('permit_approvals')
      .insert({
        permit_id: parseInt(id),
        action: 'issued',
        performed_by: user.id,
        remarks: 'Permit issued',
      })

    if (historyError) {
      console.error('Error recording approval history:', historyError)
    }

    return NextResponse.json({ permit })
  } catch (error) {
    console.error('Error in issue:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
