import Link from 'next/link'

/**
 * Contextual back-navigation link.
 *
 * Server-compatible by design: no `'use client'` directive, no state and
 * no hooks — it renders a plain `next/link`, so it can be used directly
 * from Server Components.
 *
 * Desktop shows "← {label}"; on small screens only the arrow is visible
 * (the label is still announced to screen readers via an sr-only span).
 */
export function BackButton({
  href,
  label,
}: {
  href: string
  label: string
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <span aria-hidden="true">←</span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Link>
  )
}
