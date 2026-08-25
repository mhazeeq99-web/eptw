import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Performs a controlled permit status transition through the SECURITY DEFINER
 * RPC public.perform_permit_transition(). This is the ONLY way a permit
 * status may change: the DB BEFORE UPDATE trigger rejects any direct REST/
 * PostgREST status write, and the RPC sets the transaction-local GUC the
 * trigger requires while enforcing the state machine + company/role scope.
 *
 * The readiness/entitlement/validity checks remain in the application layer
 * (call this only AFTER those pass).
 */
export async function performPermitTransition(
  supabase: SupabaseClient,
  permitId: number,
  expectedStatus: string,
  newStatus: string,
  fields: Record<string, unknown> = {}
): Promise<{
  ok: boolean
  error?: string
  id?: number
}> {
  const { data, error } = await supabase.rpc(
    'perform_permit_transition',
    {
      p_permit_id: permitId,
      p_expected_status: expectedStatus,
      p_new_status: newStatus,
      p_fields: fields,
    }
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  if (data?.success !== true) {
    return {
      ok: false,
      error: 'Permit status transition failed',
    }
  }

  return { ok: true, id: data.id as number }
}
