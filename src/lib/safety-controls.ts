import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Synchronizes the required safety controls for a permit from its permit
 * type definition (permit_type_safety_controls -> permit_safety_controls).
 *
 * The heavy lifting is done by the `sync_permit_safety_controls` database
 * function (SECURITY DEFINER, created in the MVP migration), which is
 * idempotent: it deletes the permit's existing rows and re-inserts the
 * required controls for the permit's current type.
 *
 * Degradation: if the RPC does not exist yet (migration not applied), the
 * existing database trigger (if any) is left to handle population and this
 * helper reports `applied: false` without failing the operation.
 *
 * @returns { applied: boolean; error: Error | null }
 */
export async function syncPermitSafetyControls(
  supabase: SupabaseClient,
  permitId: number
): Promise<{ applied: boolean; error: Error | null }> {
  const { error } = await supabase.rpc(
    'sync_permit_safety_controls',
    {
      p_permit_id: permitId,
    }
  )

  if (!error) {
    return { applied: true, error: null }
  }

  // PGRST202 = function not found in PostgREST.
  if (
    error.code === 'PGRST202' ||
    /function .* does not exist/i.test(
      error.message ?? ''
    )
  ) {
    return { applied: false, error: null }
  }

  return { applied: false, error }
}
