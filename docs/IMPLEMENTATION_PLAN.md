# ePTW MVP — Implementation Plan (based on repository inspection)

> Internal plan produced after Phase 1 inspection. This documents what exists and what
> will be implemented incrementally. It is a working document, not a spec.

## 1. What exists (verified by reading the code)

### Architecture
- Next.js 16.3 App Router (`src/app`), TypeScript strict, Tailwind CSS v4.
- Supabase: `@supabase/ssr` client (browser + server) and a service-role admin client
  (`src/lib/supabase/{client,server,admin}.ts`) used **only server-side** for user
  provisioning and (future) storage signed URLs. `src/proxy.ts` protects `/dashboard/*`.
- All mutations go through Route Handlers under `src/app/api/*`; pages are a mix of
  server components (direct `supabase` queries) and client components (fetch to APIs).

### Database usage mapped from code (tables)
`profiles`, `companies`, `permit_types`, `permits`, `permit_approvals`,
`safety_controls`, `permit_type_safety_controls`, `permit_safety_controls`, `areas`,
`equipment`, `contractors`, `contractor_users`, `contractor_companies`.
RPCs referenced: `register_company`, `is_contractor_authorized_for_company`.
No SQL migrations exist in the repository — schema lives in the Supabase project.

### Permit workflow (already implemented)
- Create -> `status=draft` (initiation_mode defaults in DB; internal / contractor_direct /
  contractor_work_supervisor flows supported).
- Submit (internal) -> `status=pending_approval`, `workflow_stage=safety_approval`.
- Contractor submit -> same two fields set directly.
- Approve & Issue (safety_coordinator/safety_manager) -> `status=active`,
  `workflow_stage=active`, sets `approved_by`, `approved_at`, `actual_start`.
- Old path preserved: review (supervisor) -> `approved`; issue (permit_issuer/admin) ->
  `issued`; start -> `active`.
- Suspend / Resume / Complete / Close / Start / Resubmit routes all exist.
- Audit trail via `permit_approvals` (permit_id, action, performed_by, remarks, created_at).

## 2. Gaps vs. MVP objective (to implement)

| # | Area | Gap |
|---|------|-----|
| 2-4 | Lifecycle | No Cancel; `approve-and-issue` writes non-enum `approved_and_issued`; complete/close do not persist `completed_by/completed_at/closed_by/closed_at`; several routes swallow audit failures; approve-and-issue does not enforce verified safety controls |
| 5 | Safety controls | `permit_safety_controls` rows are never written by app code (relies on unknown DB trigger) — add idempotent sync; verify route lacks company check; approve gate missing |
| 6-8 | JHA / LOTO / Gas | No tables, routes, or UI |
| 9 | Contractors | No registration page, no management UI, no authorize UI |
| 10 | Attachments | None |
| 11 | PDF | None (will add print-optimized page + QR) |
| 12 | Dashboard | Static placeholder with hard-coded zeros |
| 13 | Search/filter | None (plain table) |
| 14 | User mgmt | Exists for safety_manager; extend roles/admin access |
| 15 | Company config | Areas/equipment/permit types/safety controls tables exist but no admin UI; nav links 404 |
| 16 | Notifications | None |
| 17 | RLS | Cannot introspect DB from this environment — provide audit doc + policies for new tables, guarded additions for existing |
| 19 | Error handling | Fix swallowed audit errors, return meaningful messages |
| 21 | UI/UX | Keep existing style; confirmations/remarks on dangerous actions (already partly present) |

## 3. Constraints discovered
- The Supabase project URL in `.env.local` does not resolve from this environment, so the
  live schema/RLS cannot be inspected and end-to-end DB tests cannot run here.
  All schema work is delivered as one **idempotent** SQL migration
  (`supabase/migrations/20260101_eptw_mvp.sql`) plus an RLS audit document.
- Verification available here: `npx tsc --noEmit`, `npm run lint`, `next build`,
  unit-level checks of route logic. Live DB flows must be verified by the user
  (manual test procedure in `docs/TESTING.md`).

## 4. Implementation order
1. Lifecycle & audit fixes (Phases 2,3,4,18,19)
2. Safety-control sync + gate (Phase 5)
3. JHA / LOTO / Gas testing (Phases 6,7,8)
4. Contractor workflow (Phase 9)
5. Attachments (Phase 10)
6. Printable permit (Phase 11)
7. Dashboard (Phase 12)
8. Search/filter (Phase 13)
9. User management extension (Phase 14)
10. Company configuration (Phase 15)
11. Notifications (Phase 16)
12. RLS audit + migration (Phases 17,20)
13. Checks + test procedure (Phase 22)
