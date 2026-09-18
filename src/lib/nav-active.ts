/**
 * Sidebar navigation active-item resolution.
 *
 * Pure (no React) so it can be unit-tested directly — the sidebar itself only
 * renders its full nav after the role fetch resolves on the client, which makes
 * the highlight impossible to assert from server-rendered HTML.
 *
 * Why this exists (bug fixes):
 *  - Comparing `pathname` against each href independently lit up TWO rows at
 *    once, e.g. "/permits/approvals" matched both "/permits" and
 *    "/permits/approvals".
 *  - Items whose href carries a query string (platform/billing/support tabs,
 *    e.g. "/platform/billing?tab=payments") could never be active, because
 *    `pathname` never contains "?tab=…".
 */

export type NavLike = { href: string }

type Candidate = {
  href: string
  path: string
  depth: number
  queryMatch: boolean
}

/**
 * Resolve exactly one active navigation item.
 *
 * Rules, in priority order:
 *  1. a candidate whose query string matches the current search wins;
 *  2. otherwise the longest matching path wins ("/permits/new" beats
 *     "/permits");
 *  3. a nested path falls back to its list item, so a permit detail page
 *     ("/permits/123") keeps "All Permits" highlighted;
 *  4. when a path has tab links but no `?tab=` is present, the first declared
 *     tab is active, mirroring the page's default tab.
 */
export function findActiveHref(
  sections: { items: NavLike[] }[],
  pathname: string,
  search: string
): string | null {
  const params = new URLSearchParams(search || '')
  const items = sections.flatMap((section) => section.items)
  const candidates: Candidate[] = []

  for (const item of items) {
    const [path, query] = item.href.split('?')
    const exact = pathname === path
    const nested = !exact && pathname.startsWith(path + '/')

    if (!exact && !nested) continue

    let queryMatch = false
    if (query) {
      const required = new URLSearchParams(query)
      queryMatch = [...required.entries()].every(
        ([key, value]) => params.get(key) === value
      )
    }

    candidates.push({ href: item.href, path, depth: path.length, queryMatch })
  }

  if (candidates.length === 0) return null

  const queryMatches = candidates.filter((candidate) => candidate.queryMatch)
  if (queryMatches.length > 0) {
    queryMatches.sort((a, b) => b.depth - a.depth)
    return queryMatches[0].href
  }

  candidates.sort((a, b) => b.depth - a.depth)
  const best = candidates[0]

  // Same path, different tabs: fall back to the first declared tab.
  const samePath = items.filter((item) => item.href.split('?')[0] === best.path)
  return (samePath[0] ?? { href: best.href }).href
}
