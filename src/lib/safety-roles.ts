/**
 * Roles authorised to perform safety verification actions.
 *
 * Safety Manager and Safety Coordinator are the authorised safety verifiers
 * for site verification, PPE verification, emergency confirmation, worker
 * briefing, worker acknowledgement and the JHA/LOTO/gas verify endpoints.
 * Internal Staff and Contractor Admin cannot self-certify safety readiness.
 */
export const SAFETY_VERIFIER_ROLES = [
  'safety_manager',
  'safety_coordinator',
] as const

export type SafetyVerifierRole =
  (typeof SAFETY_VERIFIER_ROLES)[number]

export const VERIFY_ROLES: string[] = [
  ...SAFETY_VERIFIER_ROLES,
]
