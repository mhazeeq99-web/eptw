# ePTW — MVP Completion Audit & Gap Closure Report

## 1. What was already complete (verified, not rebuilt)
- Permit lifecycle: create/draft/submit/approve&issue/suspend/resume/complete/close/cancel
- Audit trail (permit_approvals with existing enum values)
- Safety controls + verification, JHA, LOTO, gas testing (permit-scoped)
- Contractor management (list, create, per-company authorization)
- Attachments + private Supabase Storage bucket + signed URLs
- Printable permit page (/permits/[id]/print) with QR code
- Dashboard with status counts, server-side search/filter on /permits
- User management (invite/role/deactivate), company configuration
- Notifications (in-app + optional SMTP), mobile drawer navigation
- RLS + idempotent migration, tsc/lint/build validation

## 2. What was missing (genuine gaps found during inspection)
- /permits/active, /permits/suspended, /permits/history pages — did not exist
- /reports page — did not exist
- Standalone /safety/jha, /safety/loto, /safety/gas-testing pages — did not exist
  (JHA/LOTO/gas were only on the permit detail page)
- Safety Reject action for pending_approval permits (no route/button)
- Edit link on draft permits (detail page)
- Cancel from suspended state
- Permit expiry detection (active / expiring soon / expired) and expiring-soon
  notifications
- Notification preferences (per-event email toggles)
- First-time company setup banner
- Navigation restructure (missing PERMITS sub-items, SAFETY, REPORTS sections)

## 3. What was added
- Pages: /permits/active, /permits/suspended, /permits/history, /reports,
  /safety/jha, /safety/loto, /safety/gas-testing
- API: POST /api/permits/[id]/reject (safety roles),
  GET/PATCH /api/notification-preferences
- Shared components: status-badge (with expiry states), quick-filters,
  reject-permit-button, notification-preferences
- Libs: permit-scope (company/contractor scoping), notifyExpiringPermits
- Dashboard: expiring-soon notifications (24h), setup banner, expiry badges
- Permit lists (main + active): Expiring Soon / Expired badges
- Settings: notification preferences panel (per user)

## 4. What was fixed
- suspend route now persists suspension_reason (existing column); resume clears it
- review + reject routes persist rejection_reason (existing column)
- cancel route now also allows suspended permits
- detail page shows suspension/rejection reasons
- dead code removed (unused applyPermitScope helper)

## 5. Pages added
/permits/active, /permits/suspended, /permits/history, /reports,
/safety/jha, /safety/loto, /safety/gas-testing

## 6. API routes added/modified
- Added: POST /api/permits/[id]/reject; GET/PATCH /api/notification-preferences
- Modified: suspend (reason), resume (clear reason), review (rejection_reason),
  cancel (suspended status)

## 7. Database changes
- New table notification_preferences (user_id, event_type, email_enabled)
  with unique (user_id, event_type); applied to the live Supabase project
  (verified via information_schema)

## 8. RLS changes
- notification_preferences: select/insert/update policies restricted to
  user_id = auth.uid()
- Verified live: all 20 public tables have RLS enabled with policies;
  storage.objects has the 4 permit-attachment policies

## 9. Migration changes
- supabase/migrations/20260101_eptw_mvp.sql extended with the
  notification_preferences section (idempotent). The migration represents
  the full reproducible deployment path for the MVP layer; base schema
  (profiles/permits/permit_types/... and their enums) must already exist —
  it is an incremental migration, not a from-scratch schema dump.

## 10. Tests performed (live, with real user tokens against Supabase)
- RLS company isolation: company-1 user cannot read company-3 permits,
  approvals, or attachments (0 rows); company-3 user cannot read company-1
  data (0 rows) — PASS
- Contractor isolation: contractor user sees only its authorized permits;
  cannot read company-3 permits or non-contractor company-1 permits — PASS
- Storage: bucket private (public=false), 20 MB limit, object RLS policies
  present; no public URLs — PASS
- Notifications: user sees only own rows — PASS
- Production readiness: no service-role key in client code, no hardcoded
  passwords, no .env files tracked, nothing secret in git history — PASS
- TypeScript 0 errors, ESLint 0 errors, webpack production build succeeds

## 11. Failed tests
- None. (End-to-end UI flows require a browser session and were not
  automated; they are covered by docs/TESTING.md.)

## 12. Remaining MVP gaps
- Email sending requires SMTP_* environment variables (no provider configured)
- Expiring-soon notifications fire on dashboard visits (no scheduler); a
  scheduled job would be needed for hard timing guarantees
- The old supervisor "review" flow coexists with the safety approve flow;
  both are functional
- PDF is print-to-PDF (browser print); true server-side PDF generation was
  intentionally not added to avoid unnecessary complexity

## 13. MVP completion percentage
~95%. All 20 audit areas are implemented or verified; the remaining 5%
is production hardening (email provider wiring, scheduled expiry checks,
full automated UI test coverage).
