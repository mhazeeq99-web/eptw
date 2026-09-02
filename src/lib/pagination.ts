/**
 * Shared pagination helpers for list pages.
 *
 * Each list page reads `page` from its searchParams, slices the query with
 * limit/offset, and renders <Pagination> with `buildHref` produced by
 * `pageHref(basePath, params, page)`.
 */

export const DEFAULT_PAGE_SIZE = 20

export function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 1
}

/**
 * Build a URL for a given page preserving the current query params
 * (minus the previous `page` value, replaced with the new one).
 */
export function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  search.set('page', String(page))
  const qs = search.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
