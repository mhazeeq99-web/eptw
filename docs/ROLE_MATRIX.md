# ePTW — Role Authorization Matrix (Final 5-Role Business Model)

> Derived from the actual authorization checks in the API routes and RLS
> policies. "Own" = the acting user is the permit requester (or a member of
> the contractor assigned to the permit, with the contractor authorized for
> the customer company). "Company" = the acting user's company matches the
> permit's company. RLS enforces data scope on top of these action checks.

## The 5 business roles

| Role | Meaning |
|---|---|
| **platform_admin** | Platform-wide administrator. Not an operational PTW user — cannot create or approve operational permits. |
| **safety_manager** | Company admin + operational user. Manages company users/settings/permit types/safety controls/areas/equipment/contractors. Can create, submit and **self-approve** permits. |
| **safety_coordinator** | Main safety approval authority + operational user. Reviews/approves/rejects PTWs, reviews JHA/LOTO/gas/controls. Can create, submit and **self-approve** permits. |
| **internal_staff** | Ordinary company employee. Creates/submits internal PTWs, monitors status. Cannot approve or reject. |
| **contractor_admin** | Authorized person from a contractor company. Creates/submits contractor PTWs with worker details + customer staff reference. Cannot approve or reject. |

## Permission matrix

| Action | platform_admin | safety_manager | safety_coordinator | internal_staff | contractor_admin |
|---|---|---|---|---|---|
| Create permit (operational) | — | ✓ | ✓ | ✓ | ✓ (contractor only) |
| Edit own draft / revise rejected | — | Own | Own | Own | Own |
| Submit own PTW | — | Own | Own | Own | Own |
| **Self-approve own PTW** | — | ✓ | ✓ | — | — |
| Approve & Issue (own + other authorized company PTWs) | — | Company | Company | — | — |
| Reject (with reason) | — | Company | Company | — | — |
| Suspend / Resume / Complete / Close | — | Company | Company | — | — |
| Cancel | — | Own/Company | Own/Company | Own | Own |
| Resubmit (rejected) | — | Own | Own | Own | Own |
| Verify safety controls | — | Company | Company | — | — |
| Verify JHA / LOTO / gas | — | Company | Company | — | — |
| Add JHA / LOTO / gas / attachments | while draft or pending_approval (permit access) | | | | |
| Manage company users | — | ✓ | — | — | — |
| Create / authorize contractors | ✓ | ✓ | — | — | — |
| Configure areas / equipment / permit types / safety controls | ✓ | ✓ | — | — | — |
| View reports | ✓ (platform-wide) | ✓ (company) | ✓ (company) | — | — |

Legend:
- **Own** — the acting user is the permit requester (or a member of the
  contractor assigned to the permit, where the contractor is authorized for
  the customer company).
- **Company** — the acting user's company matches the permit's company.
- **platform_admin** — cross-company platform access, but **not** operational
  (cannot create/approve operational PTWs).
- Blank cells mean the action is not permitted.

## Key rules
- **Self-approval** is permitted for Safety Manager and Safety Coordinator —
  they may approve & issue a PTW they personally created, or a PTW created by
  any authorized user in their company. Self-approval does **not** bypass the
  safety gates (verified controls, JHA, LOTO, gas testing as required).
- Internal Staff and Contractor Admin can **never** approve or reject.
- Permits are always scoped by company/contractor via RLS; the checks above
  are defense in depth.
- Contractor Admin creates/submits permits only for customer companies that
  authorize their contractor (`contractor_companies.is_active = true`).
- The legacy supervisor-approval chain (assign-approval / review / issue /
  start) is deprecated and unreachable — its roles no longer exist.

## Final role distribution (live)
1 platform_admin · 1 safety_manager · 2 safety_coordinator · 5 internal_staff ·
1 contractor_admin. No legacy roles remain on any active profile.
