// Unit test for the sidebar active-item rules (src/lib/nav-active.ts).
// Run: node scripts/qa-nav-active.js
// The sidebar's role-based nav only exists after a client-side role fetch, so
// the highlight logic is tested directly instead of via rendered HTML.
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const file = path.join(__dirname, '..', 'src', 'lib', 'nav-active.ts')
const source = fs.readFileSync(file, 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText

const mod = { exports: {} }
new Function('exports', 'module', 'require', js)(mod.exports, mod, require)
const { findActiveHref } = mod.exports

// Mirrors buildSections() in sidebar.tsx for a safety_manager plus the
// platform tab links that carry query strings.
const sections = [
  {
    items: [
      { href: '/permits/new' },
      { href: '/dashboard' },
      { href: '/permits' },
      { href: '/permits/mine' },
      { href: '/permits/approvals' },
      { href: '/permits/active' },
      { href: '/permits/suspended' },
      { href: '/permits/history' },
      { href: '/reports' },
    ],
  },
  {
    items: [
      { href: '/contractors' },
      { href: '/company/users' },
      { href: '/equipment' },
      { href: '/areas' },
    ],
  },
  { items: [{ href: '/safety/jha' }, { href: '/safety/loto' }, { href: '/safety/gas-testing' }] },
  {
    items: [
      { href: '/settings' },
      { href: '/settings/feedback' },
      { href: '/settings/subscription' },
    ],
  },
]

const platformSections = [
  {
    items: [
      { href: '/platform/configuration?tab=permit_types' },
      { href: '/platform/configuration?tab=safety_controls' },
      { href: '/platform/configuration?tab=ppe' },
      { href: '/platform/configuration?tab=checklists' },
    ],
  },
  {
    items: [
      { href: '/platform/billing?tab=plans' },
      { href: '/platform/billing?tab=subscriptions' },
      { href: '/platform/billing?tab=payments' },
    ],
  },
  { items: [{ href: '/platform/support?tab=company' }, { href: '/platform/support?tab=user' }] },
]

const cases = [
  ['/dashboard', '', '/dashboard'],
  ['/permits', '', '/permits'],
  // the double-highlight bug: sub-routes must NOT also light up "/permits"
  ['/permits/approvals', '', '/permits/approvals'],
  ['/permits/mine', '', '/permits/mine'],
  ['/permits/active', '', '/permits/active'],
  ['/permits/suspended', '', '/permits/suspended'],
  ['/permits/history', '', '/permits/history'],
  // longest match wins over the plain list item
  ['/permits/new', '', '/permits/new'],
  // nested detail route falls back to its list item
  ['/permits/123', '', '/permits'],
  ['/settings', '', '/settings'],
  ['/settings/feedback', '', '/settings/feedback'],
  ['/settings/subscription', '', '/settings/subscription'],
  ['/safety/gas-testing', '', '/safety/gas-testing'],
  ['/company/users', '', '/company/users'],
  // no nav item matches
  ['/somewhere-else', '', null],
  // query-string (tab) links: previously never active
  ['/platform/configuration', '?tab=ppe', '/platform/configuration?tab=ppe'],
  ['/platform/configuration', '?tab=checklists', '/platform/configuration?tab=checklists'],
  ['/platform/billing', '?tab=payments', '/platform/billing?tab=payments'],
  ['/platform/support', '?tab=user', '/platform/support?tab=user'],
  // no tab present -> first declared tab wins (page default)
  ['/platform/configuration', '', '/platform/configuration?tab=permit_types'],
  ['/platform/billing', '', '/platform/billing?tab=plans'],
]

let pass = 0
let fail = 0
for (const [pathname, search, expected] of cases) {
  const pool = pathname.startsWith('/platform') ? platformSections : sections
  const actual = findActiveHref(pool, pathname, search)
  if (actual === expected) {
    pass++
    console.log(`PASS | ${pathname}${search} -> ${actual}`)
  } else {
    fail++
    console.log(`FAIL | ${pathname}${search} -> got ${actual}, expected ${expected}`)
  }
}

// exactly one highlighted row for every sub-route of the permits section
const doubleHighlight = findActiveHref(sections, '/permits/approvals', '')
console.log(
  doubleHighlight === '/permits/approvals'
    ? 'PASS | single active row on sub-route (no double highlight)'
    : 'FAIL | double highlight still present'
)
if (doubleHighlight === '/permits/approvals') pass++
else fail++

console.log('')
console.log(`PASSED=${pass} FAILED=${fail}`)
process.exit(fail === 0 ? 0 : 1)
