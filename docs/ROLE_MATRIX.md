# ePTW — Role Authorization Matrix

> Derived from the actual authorization checks in the API routes (audited
> during the completion audit). "Own" = the user is the permit requester or
> an authorized contractor user; "Company" = the user belongs to the permit's
> company. RLS enforces data scope on top of these action checks.

| Action | requester | supervisor | permit_issuer | safety | admin | platform_admin | safety_manager | safety_coordinator | work_supervisor |
|---|---|---|---|---|---|---|---|---|---|
| Create permit | Own (contractor) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit draft/rejected | Own | — | — | — | — | ✓ | — | — | — |
| Submit permit | Own | — | — | — | — | — | — | — | — |
| Review (old flow) | — | Assigned | — | — | ✓ | — | — | — | — |
| Approve & Issue | — | — | — | — | — | ✓ | Company | Company | — |
| Reject (safety) | — | — | — | — | Company | ✓ | Company | Company | — |
| Issue (old flow) | — | — | ✓ | — | ✓ | ✓ | — | — | — |
| Start work | — | — | ✓ | — | ✓ | ✓ | — | — | — |
| Suspend | — | — | ✓ | — | ✓ | ✓ | — | — | — |
| Resume | — | — | ✓ | — | ✓ | ✓ | — | — | — |
| Complete | — | — | ✓ | — | ✓ | ✓ | — | — | — |
| Close | — | — | ✓ | — | ✓ | ✓ | — | — | — |
| Cancel | Own | — | Company | — | Company | ✓ | Company | Company | Company |
| Resubmit (rejected) | Own | — | — | — | — | — | — | — | — |
| Verify safety controls | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Verify JHA / LOTO / gas | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add JHA / LOTO / gas / attachments | while draft or pending_approval (permit access) | | | | | | | | |
| Manage users | — | — | — | — | ✓ | ✓ | ✓ | — | — |
| Create / authorize contractors | — | — | — | — | ✓ | ✓ | ✓ | — | — |
| Configure areas / equipment / permit types / safety controls | — | — | — | — | ✓ | ✓ | ✓ | — | — |
| View reports | ✓ (company scope) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Legend:
- **Own** — the acting user is the permit requester (or a member of the
  contractor assigned to the permit, with the contractor authorized for the
  customer company).
- **Company** — the acting user's company matches the permit's company.
- **Assigned** — the user is the assigned supervisor (`supervisor_id`).
- Blank cells mean the action is not permitted.

## Notes
- Permits are always scoped by company/contractor via RLS; the action checks
  above are defense in depth.
- Contractor users (role `requester`, no company) can create/submit permits
  only for customer companies that authorize their contractor
  (`contractor_companies.is_active = true`).
- No new roles were introduced; only the existing enum roles are used.
