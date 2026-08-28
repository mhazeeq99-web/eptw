/**
 * Client-side change notification for the permit detail page.
 *
 * The Safety Verification readiness panel fetches its data independently via
 * GET /api/permits/[id]/readiness. When a sibling safety-document section
 * mutates the permit (JHA / LOTO / gas / site / PPE / worker briefing /
 * emergency / safety controls), it must trigger the panel to re-fetch so the
 * readiness state stays live without a manual browser refresh.
 *
 * Mutating components call `notifyPermitChanged()` (or the default export)
 * right before / after their own `router.refresh()`. The panel listens for the
 * `eptw:permit-changed` window event and reloads.
 */
export const PERMIT_CHANGED_EVENT = 'eptw:permit-changed'

export function notifyPermitChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PERMIT_CHANGED_EVENT))
  }
}

export default notifyPermitChanged
