# ePTW — Manual Test Procedure

Prerequisites:
1. Apply the migration `supabase/migrations/20260101_eptw_mvp.sql` in the
   Supabase SQL editor (or `supabase db push`).
2. Start the app: `npm run dev` (http://localhost:3000).
3. Verify `.env.local` contains valid `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (service-role key is server-side only).

> The confirmed working permit **PTW-2026-0020** should remain `active` /
> `active` after the migration. Its approval history must not change.

---

## TEST 1 — Internal Work Supervisor: create + submit
1. Log in as an internal work supervisor (or requester).
2. Permits → Create Permit. Fill work title, location, planned start/end,
   select a permit type (e.g. HOT WORK).
3. Save Draft → status `draft`, workflow_stage `draft` (or default).
4. Confirm the permit detail page lists the required safety controls
   (JHA, Gas Test, Fire Watch, ...) with status `pending`.
5. Click **Submit Permit** → confirm.
6. Verify: status `pending_approval`, workflow_stage `safety_approval`;
   audit history contains `submitted` (by you); safety staff of the company
   received a notification.

## TEST 2 — Safety Coordinator: approve & issue
1. Log in as the company Safety Coordinator / Safety Manager.
2. Open the permit (via notification or Permits list filtered by
   `pending_approval`).
3. Verify JHA / LOTO / gas-test sections behave:
   - Add a JHA (title + hazards/controls) → status `pending`.
   - If the permit type requires gas testing, record a gas test
     (O₂ / LEL / H₂S / CO) → status `pending`.
   - If it requires LOTO, add isolation point(s).
4. **Approve & Issue** → expect rejection (400) with a clear message listing
   the unverified controls/documents.
5. Verify each required safety control (`permit_safety_controls`) and each
   required document, then **Approve & Issue** again.
6. Verify: status `active`, workflow_stage `active`, `approved_by`,
   `approved_at`, `actual_start` set; audit history contains `approved`
   and `issued` (never `approved_and_issued`).

## TEST 3 — Suspend
1. As permit issuer/admin, click **Suspend Permit**, enter a reason
   (e.g. "Unsafe condition – gas leak").
2. Verify: status `suspended`; audit history contains `suspended` with the
   remarks; requester received a notification.

## TEST 4 — Resume
1. Click **Resume Work**, enter a reason.
2. Verify: status `active`; audit history contains `resumed`.

## TEST 5 — Complete
1. Click **Complete Work**, enter a completion remark.
2. Verify: status `completed`, `completed_by`, `completed_at` set; audit
   history contains `completed`.

## TEST 6 — Close
1. Click **Close Permit**, enter a closing remark.
2. Verify: status `closed`, `closed_by`, `closed_at` set; audit history
   contains `closed`.

## TEST 7 — Reject
1. Create + submit another permit.
2. As the safety reviewer, click **Reject** — the UI must require a reason.
3. Verify: status `rejected`; audit history contains `rejected` with remarks;
   requester can **Revise Permit** (edit) and **Resubmit**; resubmission
   records `revised` and `resubmitted`.

## TEST 8 — Cancel
1. On a draft or pending permit, click **Cancel Permit**, enter a reason.
2. Verify: status `cancelled`; audit history contains `cancelled`;
   no further actions are offered.

## TEST 9 — Company isolation
1. Register a second company (Register Your Company).
2. As company B user, attempt to open company A's permit URL directly
   (e.g. `/permits/<A-permit-id>`) → must be `404`/not found (RLS blocks it).
3. Verify company B cannot see company A's permits in the list, attachments,
   or approval history.

## TEST 10 — Contractor isolation
1. Register as a contractor (Register as Contractor).
2. Company A Safety Manager → Contractors → **Authorize** the contractor.
3. Contractor logs in: Permits → Create Permit → customer company dropdown
   shows only Company A.
4. Contractor submits a permit → it appears in Company A's safety queue.
5. Company A Safety Manager → Contractors → **Revoke** authorization.
6. Contractor can no longer create permits for Company A (403).

## TEST 11 — Attachments
1. On a permit, upload a PDF/image (Attachments section).
2. Verify the file appears with uploader + timestamp; download works.
3. As a user of another company, verify the file is not downloadable (403/404).
4. Delete the attachment (uploader or admin).

## TEST 12 — Print / PDF
1. On any permit, click **Print / PDF** → new tab with the printable layout
   including QR code; use the browser's Print → Save as PDF.
2. Verify sections: company, permit no., type, status, work details, area,
   equipment, contractor, planned times, requester, safety controls,
   JHA/LOTO/gas status, approval info, history.

## TEST 13 — Dashboard & search
1. Dashboard shows real counts per status and the 5 most recent permits;
   cards link to filtered lists.
2. Permits page: use filters (text, status, type, area, contractor,
   requester, date range) — results are server-side filtered; the URL
   reflects the filters.

## TEST 14 — User management & settings
1. Safety Manager → Users: invite a Permit Issuer, change a user's role,
   deactivate a user → the user cannot log in to take actions.
2. Settings: create a permit type with JHA/Gas/LOTO requirements; create a
   safety control; map controls to a permit type and mark one as required;
   verify the required control appears on new permits of that type.

## TEST 15 — Notifications
1. Perform a submit/approve/suspend/complete cycle while logged in as the
   requester in another browser → the bell shows unread notifications;
   clicking one opens the permit and marks it read.
