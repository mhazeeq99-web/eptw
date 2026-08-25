# ePTW — Master PTW Form Redesign — Gap Analysis

> Status: **ANALYSIS ONLY — no code was modified.**
> Repository + live database inspected, current PTW UI/JHA/LOTO/Gas/PPE/controls/RLS reviewed,
> Malaysian/DOSH reference basis compiled. Waiting for approval before implementation.

---

## 1. What was inspected

**Repository** (`src/`, `supabase/`, `scripts/`, `docs/`): permit create/edit/detail UI,
safety-document modules (JHA/LOTO/gas), safety-controls flow, RLS policies, entitlement engine,
billing, audit history, 5-role authorization model.

**Live database** (project `iyqoihinciwecvuwepoj`):
- `permits` (41 columns) — lifecycle + `worker_name`, `worker_id`, `staff_reference_name`
  (single-worker model), legacy `supervisor_id`/`permit_issuer_id`/`safety_reviewer_id`.
- `permit_types` — per company; `code` = HOT / COLD / CSE / ELEC / WAH;
  `requires_jha` / `requires_loto` / `requires_gas_test` flags (the de-facto work-classification
  driver; no excavation/lifting types exist yet but the catalogue is company-configurable).
- `safety_controls` — catalogue with `category`; only **7 seeded controls**
  (JHA, GAS, LOTO, FIRE_WATCH, FALL_PROTECTION, RESCUE_PLAN, ATTENDANT).
- `permit_type_safety_controls` — per-type mapping + `is_required`.
- `jhas` — `hazards_controls` jsonb `[{hazard, control}]`, status pending/verified/rejected.
- `loto_isolation_points` — tag/description/isolation_point/lock_number/status (no isolation type).
- `gas_tests` — o2/lel/h2s/co + remarks + status (no instrument / acceptance field).
- `permit_approvals` (audit), `areas`, `equipment`, `contractors`, `contractor_users`,
  `permit_attachments`, `notifications`, `notification_preferences`, `plans`,
  `company_subscriptions`, `payments`, `billing_events`.
- **No PPE catalogue, no worker-list table, no emergency/briefing/site-verification/completion
  checklist storage, no validity configuration, no separate work-classification entity.**

**RLS** (audited earlier): 53 policies; all public tables RLS-enabled; JHA/LOTO/gas/attachments
scoped via `can_access_permit`; company isolation verified end-to-end. Any new table must follow
the same pattern.

**Current form UX** (create + edit): compact and fast —
Permit Information (company/type/area/equipment dropdowns) → Contractor Worker Details
(single name + ID) + Staff Reference (name only, dynamic label) → Work Details
(title/description/location) → Safety Requirements (auto-listed, informational) → Planned Period.
JHA/LOTO/gas/controls verification happen on the **detail page** after creation; the
approve-and-issue gate requires verified controls + type-required JHA/LOTO/gas and allows
SM/SC self-approval.

---

## 2. Reference basis (honest classification)

| Category | Source | What it supports |
|---|---|---|
| **DOSH / regulatory anchor** | DOSH *Industry Code of Practice for Safe Working in Confined Spaces* (2010) and DOSH *Safe Working in a Confined Space* pamphlet; FMA 1967 (factory context) | Confined-space work requires a documented **entry permit**, atmospheric gas testing, a standby person/attendant, ventilation and rescue arrangements. Strongest permit-anchor in the redesign. |
| **DOSH guideline** | DOSH *HIRARC Guidelines* (2008) — Hazard Identification, Risk Assessment and Risk Control | JHA/HIRARC structure (hazard → risk → risk rating → control → residual risk) is DOSH-guideline aligned; the specific matrix values remain company-configurable. |
| **Industry practice (not a single mandated form)** | PTW is a management-system control under OSHA 1994 general duties; Malaysian industrial PTW practice | Hot-work fire watch, LOTO, work-at-height fall protection, exclusion zones, PPE selection, toolbox talk/briefing are widely-expected PTW sections. |
| **Malaysian PTW examples** | UM PTW procedure (inspected), UTHM ePTW guideline, UPNM/UMK examples (per brief), Port of Tanjung Pelepas e-Permit | Common section layout (work info → personnel → risk → controls → gas/LOTO → authorisation → validity → close-out); dynamic work-type sections. |
| **Advanced industrial ePTW reference** | PETRONAS PDB ePTW+ (public listing/reference) | Dynamic work-type forms, structured checklists, readiness/verification gates, lifecycle control. |
| **Recommended ePTW feature** | This redesign | Worker lists, PPE catalogue + checkbox groups, dynamic form sections, site-verification and briefing checklists, readiness gate UI, per-type validity config. |
| **Company-configurable** | This redesign | Emergency contacts/muster points, gas acceptance thresholds, validity durations, which checklist items are mandatory. |

**Explicit disclaimer:** nothing here claims "DOSH requires exactly this form". The only hard
regulatory anchor is confined-space entry-permit practice (and HIRARC as a documented risk-
assessment guideline); everything else is classified as industry practice / recommended /
company-configurable above.

---

## 3. Gap analysis table (21 target sections)

Legend — Priority: **A** Phase A · **B** Phase B · **C** Phase C · **D** Phase D · **E** Phase E ·
**F** Phase F · **(keep)** preserve as-is.

| # | Target Section | Existing Feature | Existing DB | Existing UI | Gap | Required Change | Priority |
|---|---|---|---|---|---|---|---|
| 1 | Permit Information | Company/type/area/equipment dropdowns; auto permit_no | `permits`, `permit_types`, `areas`, `equipment` | Create + edit forms | Dynamic sections driven by type not yet present | Keep; drive dynamic sections from permit type + classification | A |
| 2 | Work Description & Scope | work_title / description / location | `permits` columns | Title/description/location fields | No structured work-method/sequence | Add optional `work_method` textarea (free text only where genuinely needed) | A |
| 3 | Applicant / Responsible Person | requester = creator (profile) | `requester_id` | Implicit (current user) | No explicit responsible-person assignment | Optional permit-level responsible-person field (display/name), no new role | B |
| 4 | Workers / Authorised Personnel | Single `worker_name` + `worker_id` (contractor only) | columns on `permits` | 2 inputs (contractor only) | **No worker list**; internal PTWs list no workers; no NRIC/passport, nationality, induction; no "only listed workers" statement | **New `permit_workers` child table**; migrate existing worker fields; multi-row editor with `[+ Add Worker]`; internal = name+employee id; contractor = name+NRIC/passport+nationality+induction; statement text on form | A |
| 5 | Work Classification | Permit type code acts as classification (HOT/COLD/CSE/ELEC/WAH) | `permit_types.code` | Permit-type dropdown | No separate classification dimension; no excavation/lifting types seeded | Treat permit type as the classification driver; catalogue is already configurable; document mapping; no new entity required | B |
| 6 | JHA / HIRARC | JHA module (permit-linked, add/verify) | `jhas` + `hazards_controls` jsonb | Free-text "hazard \| control" lines on detail page | Not HIRARC-structured (no risk rating/residual risk); not integrated into the create form; JHA status not shown on form | Enrich `hazards_controls` jsonb entries (hazard, risk, likelihood, severity, rating, control, residual); structured editor UI; show JHA status (Draft/Submitted/Verified) on form; retain verify gate | C |
| 7 | PPE Requirements | **None** | **None** | **None** | No PPE catalogue, no PPE selection, no per-type recommendation | **New `ppe_items` catalogue** (code, name, category, is_active, company_id) + `permit_ppe` links (or jsonb); checkbox-group UI (head/eye/hearing/respiratory/hand/body/foot/fall/other); type-based recommended pre-selection; reviewed by safety personnel | B |
| 8 | Safety Controls | Catalogue (7 items) + per-type mapping + per-permit verification | `safety_controls`, `permit_type_safety_controls`, `permit_safety_controls` | Auto-listed on form; verified on detail | Catalogue too small (no barricade/signage/ventilation/lighting/housekeeping/fire extinguisher); controls not selectable at creation | Expand catalogue (single source — no duplicate system); dynamic display per type; keep verification gate | B |
| 9 | Isolation / LOTO | LOTO module + `requires_loto` approve gate | `loto_isolation_points` | LOTO section on detail page | No isolation-type field; not surfaced on create form | Add optional `isolation_type` to loto table; surface "LOTO required YES/NO" on form; keep approval block when mandatory+unverified | C |
| 10 | Gas Testing | Gas module + `requires_gas_test` approve gate | `gas_tests` (o2/lel/h2s/co) | Gas section on detail page | No instrument, no acceptance/result field, no other gases | Add optional `instrument` + `acceptance`/result fields; keep gate; **no universal threshold hardcoded** (company procedure) | C |
| 11 | Permit-Specific Requirements | `requires_*` flags on permit types | `permit_types` | — | No per-type extra data (e.g. CSE entry purpose, WAH height, excavation depth/location) | Add `special_details` jsonb on `permits`; type-driven optional structured fields | E |
| 12 | Emergency Arrangements | Only `RESCUE_PLAN` control in catalogue | — | — | No emergency section on PTW | Structured emergency section: emergency contact (dropdown/config), muster point (dropdown), first-aid, fire response, rescue arrangement (applicable/NA), procedure dropdown, other | E |
| 13 | Site / Work Area Verification | `work_verified_by/at` (legacy fields, no checklist) | columns on `permits` | Shown in workflow info | No structured pre-work verification checklist | Add `site_verification` jsonb checklist (inspected/access/boundaries/controls/equipment/emergency/safe-to-commence) + verified-by/at; gate where appropriate | D |
| 14 | Worker Briefing / Toolbox Talk | **None** | **None** | **None** | No briefing confirmation | Add `briefing` jsonb checklist (scope/hazards/controls/conditions/emergency explained) + briefed_by/at + acknowledged x/y | D |
| 15 | Safety Verification | Server-side approve gate (controls + JHA/LOTO/gas verified; SM/SC self-approval preserved) | `permit_safety_controls`, `jhas`, `loto_isolation_points`, `gas_tests` | Approve button + gate error messages | No visual readiness checklist; block reason is generic | Readiness-checklist UI reading the same gate state; per-item block messages (e.g. "Approval blocked: Confined Space Gas Testing not verified"); **no silent bypass** | D |
| 16 | Approval / Authorisation | Full lifecycle DRAFT→…→ACTIVE, reject/resubmit, audit | `permits.status` enum, `permit_approvals` | Detail-page buttons | None for general permits | **Keep as-is** (preserve enums, self-approval, audit) | (keep) |
| 17 | Permit Validity | planned_start/end + actual_start/end | `permits` columns | Date pickers | No per-type validity rule | Optional `max_validity_hours` on `permit_types` (configurable, not hardcoded); enforce at approval if set | E |
| 18 | Work Execution | status=active + actual_start | `permits` | Lifecycle buttons | Minimal (no progress tracking) | Keep — no MVP change | (keep) |
| 19 | Suspension / Revalidation | suspend/resume + reason + audit | `permits` + `permit_approvals` | Suspend/Resume buttons | No re-verification checklist on resume | Optional `resume_checks` jsonb (conditions reassessed, JHA reviewed, controls effective, LOTO valid, gas repeated, area safe — applicable items only) | E |
| 20 | Completion | complete + remarks + audit | `permits.completed_*` | Complete button | No completion checklist | Add `completion` jsonb checklist (work done, tools removed, area cleaned, restored, temp controls addressed, equipment safe) + completed_by/at | F |
| 21 | Closure | close + closed_by/at + audit | `permits.closed_*` | Close button | Minimal | Keep; optionally require completion checklist before close | F |

---

## 4. A — Existing features that can be reused

- 5-role authorization model, permit lifecycle + status enum + `permit_approvals` audit.
- Self-approval (SM/SC) and no-approval (IS/contractor) rules.
- Permit types / areas / equipment / contractors / contractor_users catalogues (company-scoped).
- Safety-control catalogue + per-type mapping + per-permit verification + approve gate.
- JHA / LOTO / gas-test modules with verify gates.
- Attachments, notifications, printable permit.
- Company isolation RLS (reuse `can_access_permit` pattern for all new tables).
- Entitlement engine + HitPay billing (untouched).
- Compact dropdown/checkbox UX patterns already in the create form.

## 5. B — Features requiring modification

- Create/edit permit form → dynamic sections per permit type + classification.
- Single worker fields → worker list (with data migration).
- JHA editor → structured HIRARC-style rows (risk/rating/residual) while keeping the module.
- LOTO + gas modules → small optional fields (isolation type, instrument, acceptance).
- Safety-requirements section → dynamic, editable selection at creation (not just informational).
- Approve gate → richer per-item block messages + readiness checklist UI.
- Safety-control catalogue → expand seeded items (barricade, signage, ventilation, lighting, housekeeping, fire extinguisher, exclusion zone, etc.).

## 6. C — New database entities required (smallest schema)

- `permit_workers` (child of `permits`): permit_id, full_name, id_number (employee id / NRIC/passport),
  nationality, is_contractor, contractor_id, induction_completed, created_by, created_at.
- `ppe_items` (catalogue, company-scoped): code, name, category (head/eye/hearing/respiratory/hand/body/foot/fall/other), is_active.
- `permit_ppe` (permit ↔ ppe_items links; or jsonb on `permits` — prefer a link table for
  reporting, jsonb acceptable for MVP).
- jsonb columns on `permits` (or small child tables): `special_details`, `emergency`,
  `site_verification`, `briefing`, `resume_checks`, `completion` — **jsonb preferred** to avoid
  a proliferation of narrow tables; checklist items are company-configurable later.
- `permit_types.max_validity_hours` (nullable).
- Optional company config reference: `company_config` (emergency contacts, muster points,
  gas thresholds) — only if required for MVP; otherwise seed values in jsonb.

## 7. D — New API routes required

- `permit_workers` CRUD (add/remove workers on draft/revise).
- PPE selection persisted within permit create/update (no separate endpoint needed if part of
  the permit payload; separate endpoints only if editing after creation).
- Checklist updates: site verification, briefing, resume checks, completion (PATCH `/api/permits/[id]/…`).
- Admin: PPE catalogue CRUD (extend the existing `/api/admin/*` pattern).

## 8. E — UI changes required

- Create/edit form: dynamic sections per type; worker-list editor; PPE checkbox groups
  (recommended presets per type); emergency section; site-verification and briefing checklists.
- Detail page: readiness checklist + per-item block reasons; LOTO/gas surfaced from the form;
  JHA status; resume/completion checklists.
- No giant text form — checkboxes/dropdowns/multi-select/date-time/structured tables throughout.

## 9. F — RLS changes required

- `permit_workers`, `permit_ppe`: SELECT/INSERT/UPDATE via `can_access_permit(permit_id)` +
  `is_platform_admin()` (same pattern as jhas/loto/gas).
- `ppe_items`: company-scoped read for authenticated (like safety_controls) + admin write
  (safety_manager / platform_admin via `requireAdminProfile`).
- jsonb columns live on `permits` → automatically covered by existing permits RLS (no new policies).
- Company isolation must be verified for every new table.

## 10. G — Migration requirements

One idempotent migration (`supabase/migrations/20260106_ptw_redesign.sql`):
create `permit_workers` + `ppe_items` + `permit_ppe`; add jsonb columns to `permits`;
add `permit_types.max_validity_hours`; **migrate existing `worker_name`/`worker_id` from
`permits` into `permit_workers`** (preserve data; keep the legacy columns populated for
back-compat or drop after UI switch — recommend keeping with a deprecation note);
seed the PPE catalogue; add RLS policies; verify 0 orphans and PTW-2026-0020 regression after.

## 11. H — Safety/legal points requiring human/company confirmation

1. **Confined-space separation of duties** — current self-approval lets SM/SC self-approve a
   CSE permit. DOSH confined-space practice requires an entry supervisor + standby person and a
   written entry permit. Recommend implementing **permit-level assignment** of an Entry
   Supervisor/standby (and optionally: approver ≠ entrant/standby for CSE) **without adding a
   global role** — this is a business decision that needs confirmation.
2. **Gas-test acceptance thresholds** — do not hardcode universal O2/LEL/H2S/CO limits; each
   company must confirm its procedure values (configurable).
3. **Hot-work fire watch** — company policy on when a dedicated fire watch is mandatory.
4. **Worker NRIC/Passport collection** — personal data; confirm PDPA handling/consent for
   contractor worker IDs.
5. **Safety-induction requirement** — whether induction is mandatory per company/contractor
   (configurable), and who records it.
6. **Validity durations per permit type** — confirm company rules (e.g., CSE max duration,
   WAH shift-based).
7. **Emergency contact / muster point values** — company-provided configuration.
8. **Risk-matrix values for HIRARC** — DOSH HIRARC-aligned but the exact likelihood/severity
   matrix is company-configurable.

## 12. I — Features that should NOT be added in MVP

- Digital signatures / e-signature capture (only checkbox acknowledgements).
- Worker competency/training database, induction-management system.
- Full enterprise HIRARC/risk register (keep JHA-per-permit).
- QR-code site checks / geo-fencing.
- Automatic validity-expiry engine with notifications.
- Multi-site management (entitlement abstraction only).
- Contractor worker master-data management.
- PDF/print priority (exists; not a focus this phase).

---

## 13. Implementation phasing (for approval — nothing built yet)

**Phase A** — permit information + work scope/method + **worker list** + contractor info (sections 1–4).
**Phase B** — work classification + dynamic safety controls + detailed PPE (sections 5, 7, 8).
**Phase C** — JHA/HIRARC + LOTO + gas integration (sections 6, 9, 10).
**Phase D** — site verification + worker briefing + safety-verification gates (sections 13–15).
**Phase E** — specialised requirements + emergency + validity + suspension/revalidation (11, 12, 17, 19).
**Phase F** — completion/closure improvements (20–21).

After every phase: `tsc`, `lint`, production build, relevant QA tests, RLS/security checks;
do not proceed on any RLS/security regression. PTW-2026-0020 (active/active, history intact)
and the 5-role/entitlement/billing systems must remain green.

---

**ePTW PTW FORM REDESIGN — GAP ANALYSIS COMPLETE** — awaiting approval before implementation.
