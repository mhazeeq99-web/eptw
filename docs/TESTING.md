# ePTW — Manual Test Procedure (Final 5-Role Business Model)

Roles: `platform_admin`, `safety_manager`, `safety_coordinator`, `internal_staff`,
`contractor_admin`. All test accounts use password `Test@123456` (set during setup).

Prerequisites:
1. Apply the migration `supabase/migrations/20260101_eptw_mvp.sql` in the
   Supabase SQL editor (or `supabase db push`).
2. Start the app: `npm run dev` (http://localhost:3000).
3. Verify `.env.local` contains valid `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (service-role key is server-side only).

> The confirmed working permit **PTW-2026-0020** must remain `active` /
> `active` with its original history (`submitted`, `approved`) intact.

---

## TEST 1 — Internal Staff: create + submit internal PTW
1. Log in as **Internal Staff** (e.g. `supervisor@company.com`).
2. My Permits → Create Permit. Fill work title, location, planned start/end,
   select a permit type (e.g. HOT WORK).
3. Save Draft → status `draft`. Edit draft works (Edit Permit).
4. The detail page lists required safety controls (JHA, Gas Test, ...) as
   `pending`.
5. Click **Submit Permit** → confirm.
6. Verify: status `pending_approval`, workflow_stage `safety_approval`; audit
   has `submitted`; safety staff of the company received a notification.
7. Internal Staff must **not** see Approve & Issue / Reject.

## TEST 2 — Safety Coordinator / Safety Manager: approve & issue another user's PTW
1. Log in as a Safety Coordinator (or Safety Manager) of the same company.
2. Approval Queue → the permit appears tagged **Internal PTW**.
3. On the permit detail page, verify JHA / LOTO / gas sections behave; add a
   JHA if not present (title + hazards/controls) → `pending`.
4. **Approve & Issue** → expect rejection (400) listing unverified controls /
   documents (safety gate).
5. Verify required controls + documents, then **Approve & Issue**.
6. Verify: status `active`, workflow_stage `active`, `approved_by`,
   `approved_at`, `actual_start` set; audit has `approved` and `issued`
   (never `approved_and_issued`).

## TEST 3 — Self-approval (Safety Coordinator)
1. Log in as a Safety Coordinator. Create a PTW, submit it, add + verify JHA
   and required controls.
2. On the same permit (created by yourself) click **Approve & Issue**.
3. Verify: status `active`, workflow_stage `active`; audit history is exactly
   `submitted, approved, issued` (same user). Self-approval is allowed.

## TEST 4 — Self-approval (Safety Manager)
1. Log in as a Safety Manager. Create a PTW in their company, submit, verify
   required documents/controls, then **Approve & Issue** on their own permit.
2. Verify: status `active`, workflow_stage `active`; audit `submitted,
   approved, issued`.

## TEST 5 — Safety gate blocks self-approval without verified controls
1. Create + submit a PTW as a Safety Manager/Coordinator (own permit).
2. Do **not** verify JHA / controls. **Approve & Issue** → must fail (400)
   with a clear message. Self-approval does not bypass safety gates.

## TEST 6 — Suspend / Resume
1. As Safety Manager or Safety Coordinator: **Suspend Permit**, enter a reason
   (e.g. "Unsafe condition – gas leak").
2. Verify: status `suspended`, `suspension_reason` recorded, audit has
   `suspended`; requester notified.
3. **Resume Work**, enter a reason → status `active`, audit has `resumed`.

## TEST 7 — Complete / Close
1. As a Safety Manager/Coordinator: **Complete Work** (remark) → status
   `completed`, `completed_by`/`completed_at` set, audit has `completed`.
2. **Close Permit** (remark) → status `closed`, `closed_by`/`closed_at` set,
   audit has `closed`.

## TEST 8 — Reject → Revise → Resubmit
1. Create + submit another permit.
2. As a Safety Coordinator/Manager: **Reject** (reason required) → status
   `rejected`, `rejection_reason` recorded, audit has `rejected`.
3. The requester can **Revise Permit** (edit) and **Resubmit**.
4. Resubmit → status `pending_approval`, workflow_stage `safety_approval`;
   audit has `resubmitted`.

## TEST 9 — Cancel
1. On a draft or pending permit, **Cancel Permit** (reason required) → status
   `cancelled`, audit has `cancelled`.

## TEST 10 — Contractor Admin flow (with Staff Reference)
1. Log in as **Contractor Admin** (e.g. `contractor@test.com`).
2. Create Permit → the form shows **Worker Details** (Worker Name *, Worker
   ID *) and **"{Customer Company}'s Staff Reference"** * (single name field).
3. The Staff Reference label uses the selected customer company name
   (e.g. "Test Company's Staff Reference"). Helper: "Name of the company staff
   you are liaising with for this work."
4. Submit without worker/staff fields → error. Fill them and submit.
5. Verify: initiation mode `contractor_direct`; worker name/ID + staff
   reference stored; appears in the customer's Approval Queue tagged
   **Contractor PTW** (contractor company, worker, staff reference shown).
6. Contractor Admin cannot Approve/Reject (no buttons, API returns 403).

## TEST 11 — Platform Admin is not operational
1. Log in as `platform_admin`. Create Permit shows a "Platform Admin does not
   create operational permits" notice.
2. Attempting to create/approve via API returns 403.

## TEST 12 — Company isolation
1. Company A users cannot open Company B permits (404), attachments, JHA/LOTO/
   gas, approval history, or manage Company B users.

## TEST 13 — Contractor isolation
1. Contractor Admin sees only permits for authorized customer companies;
   cannot access unauthorized companies (403/404).

## TEST 14 — Attachments
1. Upload a PDF/image on a permit; verify uploader + timestamp; download works.
2. Another company cannot download it (403/404). Delete by uploader or Safety
   Manager.

## TEST 15 — Print / PDF
1. On any permit, **Print / PDF** → printable layout with QR code; browser
   Print → Save as PDF. Includes contractor details + staff reference for
   contractor permits.

## TEST 16 — Reports
1. Reports page shows per-status counts + breakdowns by type/area/contractor/
   month, scoped to the user's company.

## TEST 17 — User management & settings
1. Safety Manager → Users: create a user with role **Safety Coordinator** or
   **Internal Staff**, change a role, deactivate a user.
2. Settings (Safety Manager): create permit types, safety controls, map
   controls to types; verify required controls appear on new permits.

## TEST 18 — Notifications
1. Perform a submit/approve/suspend/complete cycle while logged in as the
   requester in another browser → bell shows unread notifications; clicking
   opens the permit and marks it read.
