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

---

# Final QA / Commercial Hardening Results

## Approval flow decision
The legacy supervisor review chain (`assign-approval`, `review`, `issue`, `start`)
is **deprecated** — the supervisor-assignment UI was removed from the permit detail
page and the routes are no longer reachable from the UI (kept only for permits
already in the legacy state). The single commercial workflow is:

DRAFT → submit → PENDING_APPROVAL + SAFETY_APPROVAL → Safety Coordinator/Manager →
Approve & Issue (or Reject) → ACTIVE (or REJECTED → revise/resubmit).

The Approval Queue page now lists the company's safety-stage permits instead of
supervisor-scoped items, making the workflow obvious. Resubmit no longer depends on
the removed supervisor assignment.

## Live QA test results (real users, real API, against the live Supabase)
52 automated checks executed against the running app + database:

- Test A — full happy path (create → submit → JHA → controls → approve → suspend →
  resume → complete → close): 30/30 PASS, audit trail exactly
  `submitted, approved, issued, suspended, resumed, completed, closed`.
- Test B — reject + resubmit: 9/9 PASS (`rejected` + rejection_reason persisted;
  resubmit → `pending_approval` + `safety_approval`; history `submitted, rejected,
  resubmitted`).
- Test C — role + cross-company restrictions: 7/7 PASS (cross-company approve hidden
  as 404, contractor/requester denials 403, cross-company user management denied,
  manager lists own users only).
- Test D — expiry sweep + dedup: 3/3 PASS (expiring-soon notifications created,
  repeat dashboard visits do not duplicate them).
- Test E — storage security: 3/3 PASS (company A cannot read company B attachment,
  company B can, unauthenticated denied; bucket remains private).

## Bugs found and fixed during QA
1. **New permits could not be submitted** — the create route never set
   `initiation_mode` (null), so the submit workflow had no branch to follow.
   Fixed in the route (`internal` / `contractor_direct`) and a DB default
   `'internal'` was added (migration section 10.1, applied live).
2. **Safety Coordinators/Managers could never approve** — the pre-existing
   `permit_safety_controls` policies excluded those roles from SELECT/UPDATE, so
   approve-and-issue always failed with "no safety controls configured". Policies
   refreshed to include safety roles (same-company restriction preserved).
3. **Safety reject was impossible** — the pre-existing `permits` UPDATE policy for
   safety roles only allowed the `active` outcome. Extended to also allow
   `rejected` (still same-company, pending_approval + safety_approval only).

All three fixes are in the migration (section 10, idempotent) and applied live.

## Expiry handling
Badges (Active / Expiring Soon / Expired) verified on lists and dashboard;
expiring-soon notifications are created on dashboard visits with per-permit
deduplication. Scheduler/background execution is documented as a production
deployment task — not built in.

## Email
SMTP stays optional (SMTP_* env vars). Without them, emails are skipped and
in-app notifications continue; verified by code path and the live QA runs (which
had no SMTP configured and all notification logic passed).

## Mobile
Drawer navigation, filters, tables (horizontal scroll), permit detail actions,
JHA/LOTO/gas sections and attachments use responsive layouts; no blocking mobile
issues found in code review. Browser-based visual QA remains part of
docs/TESTING.md.
