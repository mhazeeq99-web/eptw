// QA: expiring email links (invitations + password resets).
// Run: node scripts/qa-link-expiry.js   (expects the app on :3457)
//
// 1) unit-tests the signing/verification rules in src/lib/link-*.ts
// 2) renders /invite and /reset-password with freshly signed, expired and
//    tampered links and asserts the page state that comes back.
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

// --- load env (same values the server runs with) -------------------------
const envFile = path.join(__dirname, '..', '.env.local')
const env = {}
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

// --- transpile the libs (strip the server-only guard) --------------------
function loadModule(rel) {
  let source = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
  source = source.replace(/^import 'server-only'\r?\n/m, '')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText
  const mod = { exports: {} }
  const localRequire = (id) => {
    if (id === './link-policy') return loadModule('src/lib/link-policy.ts')
    return require(id)
  }
  new Function('exports', 'module', 'require', js)(mod.exports, mod, localRequire)
  return mod.exports
}

const policy = loadModule('src/lib/link-policy.ts')
const signing = loadModule('src/lib/link-signing.ts')

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS | ${name}`) }
  else { fail++; console.log(`FAIL | ${name} ${detail}`) }
}

console.log('--- policy constants ---')
check('invitation TTL is 24h', policy.INVITE_LINK_TTL_SECONDS === 86400, `got ${policy.INVITE_LINK_TTL_SECONDS}`)
check('reset TTL is 60min', policy.RESET_LINK_TTL_SECONDS === 3600, `got ${policy.RESET_LINK_TTL_SECONDS}`)
check('labels', policy.linkTtlLabel('invite') === '24 hours' && policy.linkTtlLabel('recovery') === '60 minutes')

console.log('')
console.log('--- signing rules ---')
const now = Date.now()
const token = 'test-token-hash-abc123'

const fresh = signing.buildExpiringLink('https://example.test', '/invite', token, 'invite', now)
check('link carries token + iat + sig', /[?&]token=test-token-hash-abc123/.test(fresh) && /[?&]iat=\d+/.test(fresh) && /[?&]sig=[0-9a-f]{64}/.test(fresh))

const freshCheck = signing.checkSignedLink('invite', token, String(Math.floor(now / 1000)), new URL(fresh).searchParams.get('sig'), now)
check('fresh invitation link accepted', freshCheck.ok === true && freshCheck.expired === false && freshCheck.invalid === false)

const oldIssuedAt = Math.floor(now / 1000) - (25 * 60 * 60) // 25h ago
const oldSig = signing.signLink('invite', token, oldIssuedAt)
const oldCheck = signing.checkSignedLink('invite', token, String(oldIssuedAt), oldSig, now)
check('25h-old invitation link = expired', oldCheck.ok === false && oldCheck.expired === true, JSON.stringify(oldCheck))

const recentResetIssuedAt = Math.floor(now / 1000) - (30 * 60) // 30 min ago
const recentResetSig = signing.signLink('recovery', 'reset-token', recentResetIssuedAt)
const recentResetCheck = signing.checkSignedLink('recovery', 'reset-token', String(recentResetIssuedAt), recentResetSig, now)
check('30-min-old reset link still valid', recentResetCheck.ok === true)

const staleResetIssuedAt = Math.floor(now / 1000) - (90 * 60) // 90 min ago
const staleResetSig = signing.signLink('recovery', 'reset-token', staleResetIssuedAt)
const staleResetCheck = signing.checkSignedLink('recovery', 'reset-token', String(staleResetIssuedAt), staleResetSig, now)
check('90-min-old reset link = expired', staleResetCheck.ok === false && staleResetCheck.expired === true)

const tampered = signing.checkSignedLink('invite', 'a-different-token', String(Math.floor(now / 1000)), new URL(fresh).searchParams.get('sig'), now)
check('token swapped after signing = invalid', tampered.invalid === true && tampered.ok === false)

const wrongKind = signing.checkSignedLink('recovery', token, String(Math.floor(now / 1000)), new URL(fresh).searchParams.get('sig'), now)
check('invite signature cannot be reused for a reset link', wrongKind.invalid === true)

const legacy = signing.checkSignedLink('invite', token, null, null, now)
check('legacy unsigned link still allowed (Supabase ceiling governs)', legacy.ok === true && legacy.legacy === true)

// --- rendered page states -------------------------------------------------
const BASE = 'http://localhost:3457'
async function fetchHtml(url) {
  const res = await fetch(url)
  return { status: res.status, html: await res.text() }
}

async function main() {
  console.log('')
  console.log('--- rendered /invite ---')
  const issuedAt = Math.floor(Date.now() / 1000)

  const goodInvite = `${BASE}/invite?token=${token}&iat=${issuedAt}&sig=${signing.signLink('invite', token, issuedAt)}`
  const good = await fetchHtml(goodInvite)
  check('/invite with fresh signed link -> 200 + invitation UI', good.status === 200 && good.html.includes('Invited') && good.html.includes('Continue Registration'))

  const expiredIat = Math.floor(Date.now() / 1000) - (30 * 60 * 60)
  const expiredInvite = `${BASE}/invite?token=${token}&iat=${expiredIat}&sig=${signing.signLink('invite', token, expiredIat)}`
  const expired = await fetchHtml(expiredInvite)
  check('/invite with 30h-old link -> "Invitation Expired"', expired.status === 200 && expired.html.includes('Invitation Expired') && !expired.html.includes('Continue Registration'))

  const badInvite = `${BASE}/invite?token=${token}&iat=${issuedAt}&sig=${'0'.repeat(64)}`
  const bad = await fetchHtml(badInvite)
  check('/invite with bad signature -> "Link Invalid"', bad.status === 200 && bad.html.includes('Link Invalid'))

  const legacyInvite = await fetchHtml(`${BASE}/invite?token=${token}`)
  check('/invite without iat/sig -> still offered (legacy)', legacyInvite.status === 200 && legacyInvite.html.includes('Continue Registration'))

  console.log('')
  console.log('--- rendered /reset-password ---')
  const resetToken = 'reset-token-hash-xyz'
  const goodReset = `${BASE}/reset-password?token=${resetToken}&iat=${issuedAt}&sig=${signing.signLink('recovery', resetToken, issuedAt)}`
  const goodResetPage = await fetchHtml(goodReset)
  check('/reset-password with fresh link -> reset UI', goodResetPage.status === 200 && goodResetPage.html.includes('Reset Your Password'))

  const staleIat = Math.floor(Date.now() / 1000) - (2 * 60 * 60)
  const staleReset = `${BASE}/reset-password?token=${resetToken}&iat=${staleIat}&sig=${signing.signLink('recovery', resetToken, staleIat)}`
  const stalePage = await fetchHtml(staleReset)
  check('/reset-password with 2h-old link -> "Reset Link Expired" + request new', stalePage.status === 200 && stalePage.html.includes('Reset Link Expired') && stalePage.html.includes('Request a new link'))

  const badReset = await fetchHtml(`${BASE}/reset-password?token=${resetToken}&iat=${issuedAt}&sig=${'f'.repeat(64)}`)
  check('/reset-password with bad signature -> "Link Invalid"', badReset.status === 200 && badReset.html.includes('Link Invalid'))

  console.log('')
  console.log(`PASSED=${pass} FAILED=${fail}`)
  // Set the code instead of process.exit(): exiting with pending fetch handles
  // trips a libuv assertion on Windows and masks the real result.
  process.exitCode = fail === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('QA crashed:', error)
  process.exitCode = 1
})
