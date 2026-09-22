# QA: DESIGN.md polish pass — static verification of the shipped changes.
# Logs in as the QA accounts and asserts the concrete UI contracts that were
# changed (no hover-only actions, deliberate table scroll, error states,
# accessible labels, skeletons present).
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env.local'
$url = ((Select-String -Path $envFile -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path $envFile -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$tmp = Join-Path $env:TEMP 'eptw-polish-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pw = 'Test@123456'
$pass = 0; $fail = 0

function Check([string]$name, [bool]$ok, [string]$detail = '') {
  if ($ok) { $script:pass++; Write-Output "PASS | $name" }
  else { $script:fail++; Write-Output "FAIL | $name $detail" }
}

function Get-ApiCookie([string]$email) {
  $b = @{ email = $email; password = $pw } | ConvertTo-Json -Compress
  $session = Invoke-RestMethod -Uri "$url/auth/v1/token?grant_type=password" -Method Post -Headers @{ apikey = $sr; 'Content-Type' = 'application/json' } -Body $b -TimeoutSec 20
  $expiresAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + [int]$session.expires_in
  $payloadObj = @{ access_token = $session.access_token; refresh_token = $session.refresh_token; expires_at = $expiresAt; expires_in = $session.expires_in; token_type = 'bearer'; user = $session.user } | ConvertTo-Json -Compress -Depth 10
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadObj)).TrimEnd('=').Replace('+','-').Replace('/','_')
  return "sb-$ref-auth-token=base64-$b64"
}

function Get-Page([string]$cookie, [string]$path) {
  $respFile = Join-Path $tmp "resp-$([guid]::NewGuid().ToString('N')).html"
  $code = & curl.exe -s -o $respFile -w '%{http_code}' "$base$path" -H "Cookie: $cookie" --max-time 30
  $text = ''
  if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return [pscustomobject]@{ Status = [int]$code; Html = $text }
}

$PA  = Get-ApiCookie 'mhazeeq99@gmail.com'
$SM  = Get-ApiCookie 'safetymanager@test.com'
$CON = Get-ApiCookie 'contractor@test.com'

Write-Output '--- unauthenticated public pages ---'
foreach ($p in @('/', '/login', '/about-us')) {
  $r = Get-Page '' $p
  Check "public $p renders 200" ($r.Status -eq 200) "(got $($r.Status))"
}
# /pricing is intentionally auth-gated (pre-existing redirect), so it is
# asserted with a session instead of anonymously.
$pricing = Get-Page $SM '/pricing'
Check 'authed /pricing renders 200' ($pricing.Status -eq 200) "(got $($pricing.Status))"

Write-Output '--- authenticated pages ---'
$pages = @('/dashboard', '/permits', '/permits/active', '/permits/approvals', '/permits/history', '/permits/suspended', '/permits/mine', '/permits/new', '/safety/jha', '/safety/loto', '/safety/gas-testing', '/contractors', '/company/users', '/equipment', '/areas', '/reports', '/settings', '/settings/subscription')
foreach ($p in $pages) {
  $r = Get-Page $SM $p
  Check "SM $p renders 200" ($r.Status -eq 200) "(got $($r.Status))"
}

Write-Output '--- platform pages ---'
foreach ($p in @('/companies', '/platform/users', '/platform/configuration', '/platform/billing', '/platform/audit', '/platform/security', '/platform/support', '/platform/system-health')) {
  $r = Get-Page $PA $p
  Check "PA $p renders 200" ($r.Status -eq 200) "(got $($r.Status))"
}

Write-Output '--- P0: no hover-only action cells anywhere ---'
$hoverHits = 0
foreach ($p in @('/permits', '/permits/active', '/permits/approvals', '/permits/history', '/permits/suspended', '/safety/jha', '/safety/loto', '/safety/gas-testing')) {
  $r = Get-Page $SM $p
  if ($r.Html -match 'opacity-0 transition-opacity group-hover:opacity-100') { $hoverHits++; Write-Output "  still hover-only: $p" }
}
Check 'no hover-only row actions' ($hoverHits -eq 0)

Write-Output '--- P1: deliberate table scroll strategy + error states ---'
$perms = Get-Page $SM '/permits'
Check 'permits table has explicit min-width' ($perms.Html -match 'min-w-\[\d+px\]')
$jha = Get-Page $SM '/safety/jha'
Check 'jha table has explicit min-width' ($jha.Html -match 'min-w-\[\d+px\]')

# Conditional branches (error surfaces, empty tables) are asserted at source
# level: the rendered HTML only contains them when that state is active.
function Assert-Source([string]$rel, [string]$pattern) {
  $p = Join-Path (Join-Path $PSScriptRoot '..') $rel
  if (-not (Test-Path $p)) { return $false }
  return ([IO.File]::ReadAllText($p) -match $pattern)
}
Check 'jha error branch renders shared ErrorState' (Assert-Source 'src\app\(app)\safety\jha\page.tsx' '<ErrorState')
Check 'loto error branch renders shared ErrorState' (Assert-Source 'src\app\(app)\safety\loto\page.tsx' '<ErrorState')
Check 'gas-testing error branch renders shared ErrorState' (Assert-Source 'src\app\(app)\safety\gas-testing\page.tsx' '<ErrorState')
Check 'active permits table min-width (source)' (Assert-Source 'src\app\(app)\permits\active\page.tsx' 'min-w-\[1100px\]')
Check 'approvals table min-width (source)' (Assert-Source 'src\app\(app)\permits\approvals\page.tsx' 'min-w-\[900px\]')
Check 'platform billing plan table min-width (source)' (Assert-Source 'src\app\(app)\platform\billing\page.tsx' 'min-w-\[1100px\]')
Check 'companies table min-width (source)' (Assert-Source 'src\app\(app)\companies\page.tsx' 'min-w-\[880px\]')
Check 'audit page uses shared Pagination (source)' (Assert-Source 'src\app\(app)\platform\audit\page.tsx' '<Pagination')
Check 'no hover-only cells remain in source' (-not (Assert-Source 'src\app\(app)\permits\page.tsx' 'group-hover:opacity-100'))

Write-Output '--- a11y: filter controls named ---'
Check 'permit filters have aria-labels' ($perms.Html -match 'aria-label="Status"' -and $perms.Html -match 'aria-label="Search permits"')
Check 'header menu exposes aria-expanded' ($perms.Html -match 'aria-label="Open menu"[^>]*aria-expanded')

Write-Output '--- generated markup sanity ---'
Check 'no raw postgres error leak on permits page' (-not ($perms.Html -match 'PGRST|relation ".*" does not exist|duplicate key value'))

Write-Output ''
Write-Output "PASSED=$pass FAILED=$fail"
