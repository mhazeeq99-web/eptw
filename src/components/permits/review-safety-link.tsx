'use client'

/**
 * "Review outstanding items" link inside the Approval Readiness card.
 *
 * Lives in its own client component so the onClick handler is not passed
 * across the server→client boundary (Next.js 16 forbids event handlers on
 * server-rendered elements). Clicking switches the permit detail page to the
 * Safety tab by dispatching a click on the tab trigger.
 */
export function ReviewSafetyLink() {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const trigger = document.querySelector(
      '[data-value="safety"]'
    ) as HTMLElement | null
    if (trigger) {
      trigger.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    }
  }

  return (
    <a
      href="#safety"
      className="mt-3 block text-xs text-white underline"
      onClick={handleClick}
    >
      Review outstanding items →
    </a>
  )
}
