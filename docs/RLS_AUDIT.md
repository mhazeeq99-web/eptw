# ePTW — RLS & Security Audit

> The Supabase project URL in `.env.local` does not resolve from the development
> environment where this audit was written, so the live policies could not be
> introspected. This document states the **required** security model and what was
> delivered (migration policies + guarded additions). Verify the matrix below in
> the Supabase dashboard (Database → Policies) and apply the migration.

## Non-negotiables
- RLS must be ENABLED on every application table.
- No `service_role` key in browser/client code (the admin client in
  `src/lib/supabase/admin.ts` is used **server-side only**).
- Company A must never read/update/approve Company B data.
- Contractors only access customer companies that authorize them
  (`contractor_companies.is_active = true`).
- Platform admin has cross-company read/manage access.

## Required policy matrix (per table)

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | own company (or platform admin) | own row (via signup/trigger/RPC) | own row; company admin manages same-company rows | none |
| companies | users of that company; platform admin | via `register_company` RPC (security definer) | company admin; platform admin | none |
| permits | own company; contractor authorized; platform admin | own company; authorized contractor; platform admin | own company (state transitions also guarded in API) | none |
| permit_approvals | via `can_access_permit(permit_id)` | API routes only (performer is actor) | none | none |
| permit_types | own company; platform admin | company admin; platform admin | company admin; platform admin | none |
| safety_controls | authenticated | company admin; platform admin | company admin; platform admin | none |
| permit_type_safety_controls | own company (via type); platform admin | company admin | company admin | none |
| permit_safety_controls | via `can_access_permit(permit_id)` | via `sync_permit_safety_controls` RPC (security definer) | via `can_access_permit` (verify route also role-checks) | via sync RPC |
| areas | own company; platform admin | company admin | company admin | none |
| equipment | own company; platform admin | company admin | company admin | none |
| contractors | company users, platform admin, contractor's own users | company admin; platform admin; `register_contractor` RPC | company admin | none |
| contractor_users | own contractor members; platform admin | via `register_contractor` RPC | none | none |
| contractor_companies | own company rows; authorized contractor users | via `set_contractor_authorization` RPC | via RPC | none |
| jhas | via `can_access_permit(permit_id)` | via `can_access_permit` | via `can_access_permit` (verify route role-checks) | none |
| loto_isolation_points | via `can_access_permit` | via `can_access_permit` | via `can_access_permit` | none |
| gas_tests | via `can_access_permit` | via `can_access_permit` | via `can_access_permit` | none |
| permit_attachments | via `can_access_permit` | via `can_access_permit` | none | via `can_access_permit` (route restricts to uploader or Safety Manager) |
| notifications | own rows (`user_id = auth.uid()`) | via `notify_user` RPC | own rows | none |
| storage.objects (bucket `permit-attachments`) | `can_access_attachment_path(name)` | same | same | same |

## Helpers shipped in the migration
- `public.can_access_permit(bigint)` — SECURITY DEFINER, STABLE. True for the
  permit's company users, authorized contractor users of the permit's contractor,
  and platform admin.
- `public.can_access_attachment_path(text)` — parses `{permit_id}/{...}` from a
  storage path and delegates to `can_access_permit`.
- `public.sync_permit_safety_controls(bigint)` — SECURITY DEFINER. Rebuilds a
  permit's required safety controls from its permit type.
- `public.register_contractor(...)` / `public.set_contractor_authorization(...)`
  / `public.notify_user(...)` — SECURITY DEFINER RPCs used by the app.

## Guarded additions for existing tables
The migration only adds policies to existing tables when the table has **no
policies at all** (checked via `pg_policies`). If the live project already has
policies, they are left untouched — verify they match the matrix above. Adding
permissive policies on top of existing ones could widen access, so the migration
never does that.

## What to verify in the dashboard after applying the migration
1. Every table in the matrix has RLS enabled and the expected policies.
2. `storage.buckets` contains `permit-attachments` (private, 20 MB limit).
3. No `service_role` key appears in the frontend bundle (`NEXT_PUBLIC_*` only).
4. Spot-check with two companies: user of company A cannot select a company B
   permit via PostgREST, cannot read its attachments, and cannot see its
   `permit_approvals` rows.
