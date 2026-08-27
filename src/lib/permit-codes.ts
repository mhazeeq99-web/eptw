/**
 * ePTW — code auto-generation for user-created permit types and safety
 * controls. The end user should never have to think of a "code" — it is
 * derived from the name and made unique. Codes remain internal identifiers
 * (NOT NULL + unique constraints are preserved; system-seeded codes like
 * HOT / COLD / CSE / WAH / ELEC / JHA are unchanged).
 */

/** Derive a base code token from a display name (uppercase, alnum/underscore). */
export function deriveCodeToken(name: string): string {
  const token = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

  return token || 'ITEM'
}

/**
 * Produce a code that is not already present in `existing`. Appends _2, _3 …
 * on collision. Used so user-added rows satisfy the UNIQUE(code) constraints
 * without the user choosing a code.
 */
export function deriveUniqueCode(
  name: string,
  existing: Set<string>
): string {
  const base = deriveCodeToken(name)
  let candidate = base
  let suffix = 2
  while (existing.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  return candidate
}
