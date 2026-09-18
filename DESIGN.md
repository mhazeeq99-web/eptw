# ePTW DESIGN.md v2

## Page-Level UI/UX Implementation Specification

**Product:** Electronic Permit to Work (ePTW)  
**Purpose:** UI refinement and implementation guidance  
**Status:** Current UI already overhauled — this specification is for polish and consistency

---

# 0. NON-NEGOTIABLE RULE

## THIS IS A POLISH PASS, NOT A REDESIGN

The existing ePTW application already has a substantial UI implementation.

The agent MUST:

1. Inspect the existing page first.
2. Understand existing functionality.
3. Preserve working components.
4. Preserve business logic.
5. Preserve routes.
6. Preserve API behavior.
7. Preserve Supabase queries.
8. Preserve RLS/security.
9. Preserve role-based access.
10. Improve the UI only where this specification identifies a problem.

### Never do this:

Existing page → Delete everything → Build generic SaaS dashboard

### Do this:

Existing page → Audit → Identify weak areas → Refine → Responsive QA → Accessibility QA

---

# 1. GLOBAL DESIGN LANGUAGE

ePTW is industrial safety software.

The UI should feel:

- professional
- controlled
- reliable
- operational
- safety-oriented
- modern
- clean

The design should NOT feel:

- playful
- gaming-oriented
- futuristic/cyberpunk
- excessively rounded
- overly colorful
- overly animated
- like a generic CRM template

---

# 2. GLOBAL CONTENT WIDTH

Authenticated application content should use a consistent maximum width.

Preferred:

`max-w-7xl`

or the existing equivalent.

Pages should not unnecessarily stretch content across the entire screen.

For data-heavy pages, wider layouts are acceptable.

For forms, use a narrower readable content width where practical.

---

# 3. GLOBAL PAGE PADDING

Desktop:

`px-6 py-6`

Large desktop:

`px-8`

Mobile:

`px-4 py-4`

Avoid excessive edge-to-edge content.

---

# 4. GLOBAL PAGE VERTICAL RHYTHM

Use:

`space-y-6`

as the default page-level rhythm.

Section separation:

`space-y-4`

Card internal spacing:

`p-4`, `p-5`, or `p-6`

Do not mix arbitrary spacing throughout the application.

---

# 5. GLOBAL PAGE HEADER

Every major authenticated page should follow this structure where practical:

```text
┌──────────────────────────────────────────────────────┐
│ PAGE TITLE                                  [ACTION] │
│ Short description                                    │
└──────────────────────────────────────────────────────┘
```

Example:

```text
Permit Management                       + Create Permit
View and manage permits across your organization.
```

## Desktop

Action aligned right.

## Mobile

```text
Permit Management
View and manage permits...

[ + Create Permit ]
```

Button may become full width if necessary.

---

# 6. GLOBAL CARD STYLE

Preferred:

- `rounded-xl`
- `border`
- `shadow-sm`
- `bg-card`

Do not use heavy shadows.

Do not use different card radius values on every page.

---

# 7. GLOBAL BUTTON HEIGHT

Standard:

`h-10`

Large primary action:

`h-11`

Compact action:

`h-9`

Mobile touch target should remain approximately 44px even if visual content is smaller.

---

# 8. GLOBAL INPUT HEIGHT

Preferred:

`h-10`

Large mobile inputs may use:

`h-11`

Do not create extremely small inputs.

---

# 9. GLOBAL ICON SIZE

- 16px → compact
- 18px → navigation
- 20px → standard action
- 24px → major section

Use Lucide.

Do not introduce another icon library.

---

# 10. GLOBAL STATUS BADGE

Use the existing `StatusBadge` implementation where available.

Do not create page-specific status badges.

Example:

```text
[ ACTIVE ]
[ PENDING APPROVAL ]
[ SUSPENDED ]
[ COMPLETED ]
```

Status visual language must remain consistent throughout the application.

---

# 11. GLOBAL EMPTY STATE

Use this pattern:

```text
┌─────────────────────────────────────┐
│                                     │
│              [ Icon ]               │
│                                     │
│          No permits found           │
│                                     │
│  There are no records matching      │
│  your current filters.              │
│                                     │
│             [ Clear ]               │
│                                     │
└─────────────────────────────────────┘
```

Do not simply display:

`No data`

---

# 12. GLOBAL ERROR STATE

Use:

- Title
- Explanation
- Recovery action

Example:

```text
Unable to load permits

We couldn't retrieve the permit list.
Please try again.

[ Try Again ]
```

Do not expose raw Supabase/PostgreSQL errors.

---

# 13. GLOBAL LOADING STATE

For data tables:

- skeleton rows

For cards:

- skeleton cards

For initial page loading:

- avoid blank page

Do not overuse large spinners.

---

# 14. GLOBAL MOBILE RULE

The entire application must avoid using `overflow-x-hidden` as a workaround for actual layout problems.

Fix the source of overflow instead.

Pay particular attention to:

- tables
- buttons
- dialogs
- long permit numbers
- cards
- filter controls
- sticky elements
- forms

---

# 15. DASHBOARD

Route:

`/dashboard`

File:

`src/app/dashboard/page.tsx`

The current dashboard already has:

- company setup alert
- welcome header
- Create Permit
- primary KPI row
- secondary KPI row
- Recent Permits
- platform-admin-specific dashboard behavior

Preserve this architecture.

---

# 16. DASHBOARD DESKTOP LAYOUT

Target:

```text
┌──────────────────────────────────────────────────────┐
│ Welcome                                  + Create    │
│ Overview                                             │
├──────────────────────────────────────────────────────┤
│ Setup / warning if required                          │
├────────────┬────────────┬────────────┬───────────────┤
│ Pending    │ Active     │ Expiring   │ Completion    │
├────────────┼────────────┼────────────┼───────────────┤
│ Draft      │ Suspended  │ Expired    │ Completed     │
├──────────────────────────────────────────────────────┤
│ Recent Permits                             View all → │
│                                                      │
│ Permit rows                                          │
└──────────────────────────────────────────────────────┘
```

---

# 17. DASHBOARD KPI HIERARCHY

Primary:

- Pending Approval
- Active
- Expiring Soon
- Completion Rate

Secondary:

- Draft
- Suspended
- Expired
- Completed

Primary KPI cards should have slightly stronger visual emphasis.

Secondary cards should be visually quieter.

Do NOT add another 8–12 KPI cards.

---

# 18. DASHBOARD KPI CARD

Preferred structure:

```text
┌──────────────────────────┐
│ icon        Pending      │
│                          │
│ 3                        │
│ Awaiting review          │
└──────────────────────────┘
```

The number is the strongest element.

Description is secondary.

Icon is supportive.

---

# 19. DASHBOARD KPI INTERACTION

Cards that represent a meaningful filtered view should remain clickable.

Example:

`Pending Approval → /permits?status=pending_approval`

Do not remove existing drill-down behavior.

Hover:

- subtle border/shadow change
- no large scaling
- no dramatic animation

---

# 20. DASHBOARD SETUP ALERT

The existing:

`Complete your company setup`

alert should remain.

Visual hierarchy:

```text
[Warning icon]

Complete your company setup
Add permit types and safety controls...

                         [Go to Settings]
```

On mobile:

```text
[Warning]

Complete your company setup
Description

[Go to Settings]
```

Button should become full-width or naturally sized depending on available space.

---

# 21. DASHBOARD ACTION REQUIRED

If meaningful action items exist, place them before secondary information.

Example:

```text
Action Required

3 permits awaiting approval       Review →
2 permits expiring today          View →
1 suspended permit                Review →
```

Do not create a permanent empty Action Required block.

If nothing requires action, omit it.

---

# 22. DASHBOARD RECENT PERMITS

Desktop:

Use a clean table/list.

Suggested visual hierarchy:

```text
Permit No.       PTW-2026-00125
Work             Pump maintenance
Type             Hot Work
Status           ACTIVE
Validity         Today, 18:00
```

Do not overpopulate the row.

---

# 23. DASHBOARD MOBILE

At mobile width:

```text
Welcome, User

[Create Permit]

Pending Approval
3
Awaiting review

Active
5
In progress

...

Recent Permits

PTW-2026-00125
Pump maintenance
[ACTIVE]
```

KPI cards may become one-column or two-column if readability remains good.

Never force four tiny cards into one row.

---

# 24. PERMITS PAGE

Route:

`/permits`

File:

`src/app/permits/page.tsx`

Existing server-side filtering and pagination MUST remain.

Existing filtering capabilities include:

- search
- status
- permit type
- area
- contractor
- requester
- date from
- date to
- expiry
- pagination

---

# 25. PERMITS PAGE DESKTOP

Target:

```text
Permit Management                    + Create Permit

[ Search permits... ]

[Status] [Permit Type] [Area] [Contractor]
[Requester] [Date] [Expiry]       [Clear]

┌──────────────────────────────────────────────────────┐
│ Permit │ Work │ Type │ Location │ Status │ Validity │
├──────────────────────────────────────────────────────┤
│ ...                                                  │
└──────────────────────────────────────────────────────┘

                         < 1 2 3 4 >
```

---

# 26. PERMITS FILTER DESIGN

Primary filter:

`Search`

Common filters:

- Status
- Permit Type
- Area

Advanced filters:

- Contractor
- Requester
- Date From
- Date To
- Expiry

Desktop may display more controls.

Mobile should consolidate advanced filters into a sheet/dialog.

---

# 27. ACTIVE FILTER INDICATOR

When filters are active:

`Filters (3)`

or equivalent.

Provide:

`Clear filters`

without forcing the user to remove each filter individually.

---

# 28. PERMIT TABLE

Do not make every column equally prominent.

Priority:

- Permit No.
- Work
- Status
- Validity

Secondary:

- Type
- Location
- Requester

Actions:

- View
- Edit
- Delete

according to permission/state.

---

# 29. PERMIT TABLE ROW

Target:

```text
PTW-2026-00125
Pump maintenance
Hot Work
Production Area
[ACTIVE]
18 Sep 18:00
...
```

Use readable row height.

Do not use 10–11px text merely to fit more columns.

---

# 30. PERMIT MOBILE CARD

Preferred structure:

```text
┌──────────────────────────────┐
│ PTW-2026-00125      ACTIVE   │
│ Pump maintenance             │
│                              │
│ Hot Work                     │
│ Production Area              │
│                              │
│ Valid until 18 Sep, 18:00    │
│                              │
│                         →    │
└──────────────────────────────┘
```

The card must remain scannable.

---

# 31. PERMIT DETAIL

The permit detail page should look like an operational record.

Header:

```text
PTW-2026-00125

Pump Maintenance

[ACTIVE]
```

Metadata:

- Permit Type
- Location
- Requester
- Supervisor
- Valid From
- Valid Until

Primary actions should be visible.

---

# 32. PERMIT DETAIL — ACTION BAR

Desktop:

```text
[Back]                         [Edit] [Approve]
```

Actual actions depend on role and status.

Mobile:

```text
[Primary action]
[Secondary actions]
```

Do not create a huge horizontal row of buttons.

---

# 33. PERMIT DETAIL — SAFETY SECTIONS

Use clear sections:

- Work Details
- Workers
- PPE
- Safety Controls
- JHA / JSA
- HIRARC
- LOTO
- Gas Testing
- Attachments
- Approval History
- Audit Information

Each section should have a consistent header.

---

# 34. CREATE PERMIT — CRITICAL

Route:

`/permits/new`

This is the most important form interface in the application.

DO NOT rewrite its underlying architecture.

---

# 35. CREATE PERMIT — DESKTOP

Target:

```text
Create Permit

Permit Completion
████████████░░░░ 72%

┌───────────────────────────────────────────────┐
│ ✓ Permit Information                       ˅ │
├───────────────────────────────────────────────┤
│                                               │
│ Company                                       │
│ [                                         ]   │
│                                               │
│ Permit Type                                   │
│ [                                         ]   │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Work Description                           ˅ │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Workers                                    ˅ │
└───────────────────────────────────────────────┘

...
```

---

# 36. CREATE PERMIT — SECTION ORDER

Preferred:

1. Permit Information
2. Work Description
3. Workers
4. PPE
5. Safety Controls
6. JHA / HIRARC
7. LOTO
8. Gas Testing
9. Attachments
10. Declaration

If current implementation has specialized permit sections, retain them in their existing logical location.

---

# 37. CREATE PERMIT — COLLAPSED SECTIONS

Collapsed:

`Work Description >`

Expanded:

```text
Work Description ˅

Work Title
[...................................]

Description
[...................................]

Location
[...................................]
```

The entire header should be clickable.

Do not make the clickable area too small.

---

# 38. CREATE PERMIT — COMPLETION STATE

Completed section:

`✓ Workers`

Incomplete:

`○ Workers`

Error:

`! Workers`

Do not rely exclusively on color.

---

# 39. CREATE PERMIT — SECTION DESCRIPTION

Each complex section may have a short helper:

`Safety Controls`

`Select the controls required for this work activity.`

Keep descriptions short.

---

# 40. CREATE PERMIT — FORM GRID

Desktop:

`grid-cols-2`

for naturally paired fields.

Example:

```text
Work Location          Area
[................]     [................]
```

Full-width fields:

```text
Work Description
[........................................]
```

Mobile:

`grid-cols-1`

---

# 41. CREATE PERMIT — WORKERS

Worker list should prioritize:

- Name
- Role
- Company
- Actions

Avoid excessive metadata.

Add worker action should be obvious:

`[ + Add Worker ]`

---

# 42. CREATE PERMIT — PPE

PPE selection should be scannable.

Prefer:

```text
☐ Safety Helmet
☑ Safety Shoes
☑ Safety Glasses
☐ Face Shield
```

Required/recommended state should be obvious.

Do not rely solely on color.

---

# 43. CREATE PERMIT — SAFETY CONTROLS

Safety controls should be grouped logically.

Example:

```text
☑ Barricade work area
☑ Fire extinguisher available
☑ Emergency access maintained
☐ Continuous gas monitoring
```

Required controls should be visually distinguishable.

---

# 44. CREATE PERMIT — JHA / HIRARC

These are safety-critical records.

Do not hide important information behind excessive interaction.

Show:

- existing records
- record status
- number of records
- add/edit action

Example:

```text
JHA / HIRARC

2 assessments saved

[View] [Add Assessment]
```

---

# 45. CREATE PERMIT — LOTO

LOTO should communicate whether isolation controls exist.

Example:

```text
LOTO

✓ 3 isolation points recorded

[View LOTO]
[Add LOTO]
```

Do not represent LOTO merely as another generic checkbox.

---

# 46. CREATE PERMIT — GAS TESTING

Show actual readings where available.

Example:

```text
Gas Testing

✓ Test recorded
O₂      20.8%
LEL     0%
H₂S     0 ppm
CO      0 ppm
```

The visual presentation must prioritize safety readings.

---

# 47. CREATE PERMIT — ATTACHMENTS

Attachment section should show:

```text
Attachments
3 files

[ filename.pdf ]
[ risk-assessment.jpg ]
[ method-statement.pdf ]

[ + Add Attachment ]
```

Do not make file names overflow the page.

Use truncation where appropriate.

---

# 48. CREATE PERMIT — DECLARATION

The declaration should be visually separated from normal fields.

Example:

```text
Declaration

☐ I confirm that the information provided is accurate
  and that the required safety controls have been
  identified.

[ Submit Permit ]
```

---

# 49. CREATE PERMIT — FOOTER ACTIONS

Desktop:

```text
────────────────────────────────────────────────
[Cancel]                  [Save Draft] [Submit]
────────────────────────────────────────────────
```

Mobile:

```text
[Save Draft]
[Submit Permit]
```

If sticky:

- reserve bottom spacing
- respect mobile safe area
- never cover content

---

# 50. APPROVAL QUEUE

Route:

`/permits/approvals`

The page is for reviewers.

Top priority:

`Pending approval count`

Then permit list.

Each record should answer:

- What work?
- Where?
- Who?
- When?
- What type?
- What status?

---

# 51. APPROVAL DETAIL

Reviewer should not need to search through the page for critical safety information.

Recommended hierarchy:

```text
Permit Summary
↓
Work Details
↓
Risk / Safety Controls
↓
JHA / HIRARC
↓
LOTO / Gas Testing
↓
Supporting Documents
↓
Approval Decision
```

---

# 52. APPROVAL ACTIONS

Use:

```text
[Approve]
[Reject]
```

with any additional workflow-specific action.

Approve = primary.

Reject = destructive.

Correction/request-changes = secondary if supported.

---

# 53. ACTIVE PERMITS

Route:

`/permits/active`

Prioritize:

- ACTIVE
- Location
- Work
- Responsible person
- Valid until

Expiring permits should have a clear warning indicator.

Do not make every active permit appear urgent.

---

# 54. SUSPENDED PERMITS

Prioritize:

- SUSPENDED
- Reason
- Suspended at
- Suspended by
- Work
- Location

The suspension reason should be visible without opening multiple dialogs.

---

# 55. HISTORY

History is record-oriented.

Do not make historical records look like current active work.

Use subdued action emphasis.

---

# 56. JSA / JHA PAGE

Route:

`/safety/jha`

Use:

- Page header
- Description
- Add JHA
- Filters/search if supported
- Record list

Each JHA record should communicate:

- Reference
- Permit
- Activity
- Date
- Status
- Actions

---

# 57. LOTO PAGE

Route:

`/safety/loto`

Use the same page structure.

LOTO-specific information:

- Equipment
- Isolation points
- Status
- Responsible person
- Date/time

Safety state must be visually obvious.

---

# 58. GAS TESTING PAGE

Route:

`/safety/gas-testing`

Prioritize actual readings.

Example:

```text
Gas Test

O₂      20.8%
LEL     0%
H₂S     0 ppm
CO      0 ppm

[SAFE / ATTENTION]
```

Do not use decorative gauges unless they improve understanding.

---

# 59. CONTRACTORS

Route:

`/contractors`

Use management-table design.

Top:

`Contractors                         + Add Contractor`

Then:

`Search`

`Status`

Table:

- Company
- Contact
- Status
- Permits
- Actions

---

# 60. COMPANY USERS

Route:

`/company/users`

Prioritize:

- Name
- Email
- Role
- Status
- Last activity
- Actions

Role must be clearly readable.

---

# 61. EQUIPMENT

Route:

`/equipment`

Use:

- Equipment
- Name
- Code
- Area
- Status
- Actions

The page should remain compact.

---

# 62. AREAS

Route:

`/areas`

Use the same management-table language.

Avoid large cards unless there is meaningful area-specific information.

---

# 63. REPORTS

Route:

`/reports`

Reports should be analytical but still operational.

Recommended hierarchy:

```text
Report title
Filters
Key summary
Charts/tables
Export/action
```

Do not fill the page with charts.

Every chart should answer a business/safety question.

---

# 64. SETTINGS HUB

Route:

`/settings`

The current Settings Hub should remain.

Use grouped sections.

Example:

```text
Settings

Company Configuration
────────────────────────────
Permit Types
Safety Controls
PPE
Checklist Templates

Account
────────────────────────────
Profile
Notifications
Feedback
Subscription
```

Visibility depends on role.

---

# 65. SUBSCRIPTION

Route:

`/settings/subscription`

Subscription information should clearly communicate:

- Current plan
- Usage
- Limits
- Billing status
- Available upgrade

Do not use misleading pricing emphasis inside operational settings.

---

# 66. PLATFORM ADMIN

Platform Admin should use the same global design system.

Navigation groups remain:

- Platform
- Configuration
- Billing
- Security
- Support
- Account

Do not redesign the platform area independently.

---

# 67. PLATFORM DASHBOARD

Platform dashboard is different from company operational dashboard.

Prioritize:

- Companies
- Users
- Subscriptions
- Revenue/billing
- System health
- Security events

Avoid mixing company PTW operational metrics into platform administration unless they have a clear platform-level purpose.

---

# 68. PLATFORM CONFIGURATION

Existing tabs include concepts such as:

- Permit Types
- Safety Controls
- PPE
- Checklist Templates

Use tabbed configuration where already implemented.

Each configuration section should have:

- Title
- Description
- Add action
- Search/filter if needed
- Table/list

---

# 69. PLATFORM BILLING

Existing areas:

- Plans
- Subscriptions
- Payments

Maintain separation.

Do not make payment data visually similar to safety-critical permit data.

---

# 70. PLATFORM SECURITY

Existing areas:

- Audit Log
- Security Events

These should be information-dense.

Prioritize:

- Timestamp
- User
- Event
- Resource
- Result
- IP/context where already available

Do not hide important security information behind excessive UI decoration.

---

# 71. PLATFORM SUPPORT

Existing lookup areas:

- Company Lookup
- User Lookup
- Permit Lookup
- System Health

These are support tools.

Use highly searchable interfaces.

---

# 72. LOGIN

Route:

`/login`

Preserve current industrial background visual.

Preserve:

- ePTW branding
- email
- password
- password visibility
- Remember Me
- Forgot Password
- error/success states
- theme support

Do not replace with generic centered login unless the current layout is demonstrably broken.

---

# 73. LANDING PAGE

Route:

`/`

The landing page is public marketing.

Maintain:

- industrial visual identity
- clear value proposition
- CTA
- feature explanation
- pricing/free-plan messaging where already present

Do not force dashboard-style components into the marketing page.

---

# 74. ABOUT US

Route:

`/about-us`

Existing sections:

- The Problem
- Features
- How It Works
- Who It's For
- Pricing

Maintain marketing-oriented presentation.

Keep relationship with application branding.

---

# 75. MOBILE SIDEBAR

Existing sidebar already supports mobile drawer.

Required behavior:

```text
Open
↓
Overlay
↓
Navigation
↓
Select route
↓
Close drawer
```

Escape must close.

Body scroll must be locked while drawer is open.

Do not remove these behaviors.

---

# 76. MOBILE HEADER

Target:

```text
[☰] Electronic Permit to Work
```

The application title should truncate gracefully.

Company badge should not force overflow.

Theme/notification/account controls must remain usable.

---

# 77. SIDEBAR COLLAPSED DESKTOP

When collapsed:

```text
[ P ]

[icon]
[icon]
[icon]
```

Tooltips/title attributes should identify icon-only navigation.

Do not leave users guessing what an icon means.

---

# 78. DARK MODE

Every authenticated route must be inspected in dark mode.

Check especially:

- Dashboard KPI cards
- Tables
- Forms
- Dialogs
- Status badges
- Alerts
- Sidebar
- Header
- Empty states

Avoid hardcoded colors that conflict with the application's dark-mode system.

Prefer semantic theme classes where possible.

---

# 79. RESPONSIVE TABLE STRATEGY

For every table decide explicitly:

```text
Desktop table
        ↓
Mobile card
```

OR:

```text
Desktop table
        ↓
Horizontal scroll
```

Do NOT accidentally create:

```text
Desktop table
        ↓
tiny unreadable table
```

---

# 80. RESPONSIVE FORM STRATEGY

Desktop:

`2 columns where appropriate`

Mobile:

`1 column`

Never make fields narrower merely to preserve two columns on mobile.

---

# 81. DIALOG RESPONSIVENESS

Desktop:

`max-w-lg` or `max-w-xl` depending on content.

Mobile:

`w-[calc(100%-2rem)]`

`max-h-[90vh]`

`overflow-y-auto`

Use existing dialog primitives where available.

---

# 82. LONG TEXT

Permit titles, company names, file names and requester names may be long.

Use:

- `truncate`
- `line-clamp`
- `break-words`

where appropriate.

Do not allow long content to destroy layout.

---

# 83. DATE/TIME

Use the application's existing date formatting utilities.

Do not create multiple date formats across pages.

Malaysia-oriented display should remain consistent.

---

# 84. TOASTS

Use concise messages.

Good:

`Permit saved successfully.`

Good:

`Permit submitted for approval.`

Avoid unnecessarily verbose system messages.

---

# 85. CONFIRMATION DIALOG LANGUAGE

High-risk action:

```text
Suspend Permit?

This will stop the permit from remaining active.

[Cancel] [Suspend Permit]
```

Avoid vague:

`Are you sure?`

The consequence should be stated.

---

# 86. ACCESSIBILITY

Every interactive control must be usable by keyboard.

Check:

- Tab
- Shift+Tab
- Enter
- Space
- Escape
- Arrow keys where appropriate

Focus must be visible.

---

# 87. ICON-ONLY BUTTONS

Every icon-only button requires an accessible name.

Example:

```tsx
aria-label="Delete draft permit"
```

Do not rely on the icon itself.

---

# 88. COLOR CONTRAST

Safety-critical text must remain readable in:

- light mode
- dark mode
- disabled state
- hover state

Do not use extremely light grey text for important information.

---

# 89. COMPONENT CONSOLIDATION

Before creating a component:

1. Search repository.
2. Find existing component.
3. Reuse/extend it.
4. Only create a new component if no suitable component exists.

Avoid duplicate components such as:

- StatusBadge
- StatusPill
- PermitStatus
- PermitStatusBadge

when one shared component can handle the requirement.

---

# 90. CODE CHANGE BOUNDARY

UI implementation may modify:

- JSX
- Tailwind classes
- component composition
- responsive behavior
- accessibility attributes
- visual states

Avoid modifying:

- database schema
- RLS
- API contracts
- authentication
- authorization
- permit workflow
- billing logic
- notification logic

unless explicitly requested.

---

# 91. PERFORMANCE BOUNDARY

Do not turn server-rendered pages into client components purely for UI effects.

Do not add `useEffect` unless required.

Do not create repeated database requests to calculate visual information if existing data already provides it.

---

# 92. QA MATRIX

Every major page must be tested at:

```text
320px
375px
390px
414px
768px
1024px
1280px
1440px
1920px
```

And:

```text
Light
Dark
```

---

# 93. PAGE QA MATRIX

## Public

- [ ] /
- [ ] /login
- [ ] /about-us

## Operations

- [ ] /dashboard
- [ ] /permits
- [ ] /permits/mine
- [ ] /permits/approvals
- [ ] /permits/active
- [ ] /permits/suspended
- [ ] /permits/history
- [ ] /permits/new

## Safety

- [ ] /safety/jha
- [ ] /safety/loto
- [ ] /safety/gas-testing

## Management

- [ ] /contractors
- [ ] /company/users
- [ ] /equipment
- [ ] /areas
- [ ] /reports

## Settings

- [ ] /settings
- [ ] /settings/feedback
- [ ] /settings/subscription

## Platform

- [ ] /companies
- [ ] /platform/users
- [ ] /platform/configuration
- [ ] /platform/billing
- [ ] /platform/audit
- [ ] /platform/security
- [ ] /platform/support
- [ ] /platform/system-health

Also inspect:

- permit detail
- permit edit
- dialogs
- notifications
- attachments
- approval controls

where those routes/components exist.

---

# 94. STATE QA

Every important page should be tested in:

- Normal
- Loading
- Empty
- Error
- Success
- Disabled
- Long content
- Many records
- No records

---

# 95. VISUAL REGRESSION RULE

When changing one shared component:

- StatusBadge
- Button
- Card
- Dialog
- Sidebar
- Header

inspect all pages using that component.

Do not fix one page and accidentally break another.

---

# 96. PRIORITY

## P0

Fix immediately:

- broken responsive layout
- page overflow
- inaccessible controls
- broken navigation
- unreadable content
- broken dark mode
- overlapping UI
- unusable forms
- broken dialogs

## P1

Then fix:

- dashboard hierarchy
- action-required visibility
- permit list usability
- create permit usability
- mobile cards
- loading/empty/error states
- status consistency

## P2

Then polish:

- spacing
- typography
- card density
- button consistency
- icon sizing
- borders
- shadows
- alignment

## P3

Optional:

- micro-interactions
- subtle transitions
- skeleton refinement
- hover refinement

---

# 97. DEVELOPER WORKFLOW

For every page:

1. Read current source.
2. Identify existing components.
3. Identify existing functionality.
4. Identify UI problems.
5. Apply this specification.
6. Make the smallest practical change.
7. Run TypeScript/build/lint checks.
8. Test desktop.
9. Test mobile.
10. Test light mode.
11. Test dark mode.
12. Verify workflow still works.

---

# 98. DO NOT CHASE PIXEL PERFECTION

The purpose of this specification is consistency.

If two approaches are both valid, choose the one that:

1. reuses existing components
2. requires fewer changes
3. preserves current functionality
4. behaves better on mobile
5. is more accessible

---

# 99. FINAL QUALITY TARGET

The finished ePTW application should feel like:

> A mature industrial SaaS platform used for controlled safety-critical permit operations.

Users should perceive:

- Professional
- Reliable
- Clear
- Controlled
- Safe
- Fast
- Consistent

The interface should not feel:

- Experimental
- Flashy
- Gaming-oriented
- Over-designed
- Generic

---

# 100. FINAL INSTRUCTION TO AI CODING AGENT

Before writing code:

> "I am refining an existing production application, not designing a new application."

Then:

```text
Inspect
→ Understand
→ Preserve
→ Refine
→ Test
```

The agent must prioritize small, deliberate improvements over large rewrites.

## GOLDEN RULE

**DO NOT REDESIGN ePTW.**

Make the current ePTW UI feel like a **cohesive, mature, production-ready industrial SaaS platform**.

Preserve what works.

Fix what is weak.

Standardize what is inconsistent.

Improve what is difficult to use.

Do not change things simply because they could look different.
