# QA: persistent app shell (route group (app) + server-resolved role).
# Asserts: URLs unchanged, the shell renders once per page from the layout, the
# sidebar is server-rendered WITH the role-specific nav on first paint (no
# client fetch / no flash), the print route stays shell-less, and unauthenticated
# access to app routes still redirects to /login.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env.local'
$url = ((Select-String -Path $envFile -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path $envFile -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$tmp = Join-Path $env:TEMP 'eptw-shell-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pass = 0; $fail = 0

function Check([string]$name, [bool]$ok, [string]$detail = '') {
  if ($ok) { $script:pass++; Write-Output "PASS | $name" }
  else { $script:fail++; Write-Output "FAIL | $name $detail" }
}

function Get-Cookie([string]$email) {
  $b = @{ email = $email; password = 'Test@123456' } | ConvertTo-Json -Compress
  $s = Invoke-RestMethod -Uri "$url/auth/v1/token?grant_type=password" -Method Post -Headers @{ apikey = $sr; 'Content-Type' = 'application/json' } -Body $b -TimeoutSec 20
  $ea = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + [int]$s.expires_in
  $pl = @{ access_token = $s.access_token; refresh_token = $s.refresh_token; expires_at = $ea; expires_in = $s.expires_in; token_type = 'bearer'; user = $s.user } | ConvertTo-Json -Compress -Depth 10
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pl)).TrimEnd('=').Replace('+','-').Replace('/','_')
  return "sb-$ref-auth-token=base64-$b64"
}

function Get-Page([string]$cookie, [string]$path) {
  $f = Join-Path $tmp "p-$([guid]::NewGuid().ToString('N')).html"
  $code = & curl.exe -s -o $f -w '%{http_code}' "$base$path" -H "Cookie: $cookie" --max-time 30
  return [pscustomobject]@{ Status = [int]$code; Html = [IO.File]::ReadAllText($f) }
}

$sm = Get-Cookie 'safetymanager@test.com'
$pa = Get-Cookie 'mhazeeq99@gmail.com'

Write-Output '--- URLs unchanged after the route-group move ---'
foreach ($p in @('/dashboard','/permits','/permits/mine','/permits/new','/safety/jha','/safety/loto','/safety/gas-testing','/contractors','/company/users','/equipment','/areas','/reports','/settings','/settings/subscription','/pricing')) {
  $r = Get-Page $sm $p
  Check "SM $p still 200" ($r.Status -eq 200) "(got $($r.Status))"
}
foreach ($p in @('/companies','/platform/users','/platform/configuration','/platform/billing','/platform/audit','/platform/security','/platform/support','/platform/system-health')) {
  $r = Get-Page $pa $p
  Check "PA $p still 200" ($r.Status -eq 200) "(got $($r.Status))"
}

Write-Output ''
Write-Output '--- shell comes from the layout, rendered exactly once ---'
$dash = Get-Page $sm '/dashboard'
$navCount = ([regex]::Matches($dash.Html, 'aria-label="Primary"')).Count
Check 'exactly one sidebar nav on the page' ($navCount -eq 1) "(got $navCount)"
Check 'header rendered once' (([regex]::Matches($dash.Html, '<header')).Count -eq 1)

Write-Output ''
Write-Output '--- role-specific nav is present on FIRST paint (no client fetch) ---'
$perms = Get-Page $sm '/permits'
foreach ($label in @('All Permits','My Permits','Approval Queue','Create Permit')) {
  Check "sidebar shows '$label' server-rendered" ($perms.Html -match [regex]::Escape($label))
}
$platform = Get-Page $pa '/companies'
foreach ($label in @('Companies','Platform','Audit Log','System Health')) {
  Check "platform sidebar shows '$label' server-rendered" ($platform.Html -match [regex]::Escape($label))
}

Write-Output ''
Write-Output '--- print route stays shell-less ---'
$list = Get-Page $sm '/permits'
$permitId = [regex]::Match($list.Html, '/permits/(\d+)"').Groups[1].Value
if ($permitId) {
  $print = Get-Page $sm "/permits/$permitId/print"
  Check "print page (/permits/$permitId/print) still 200" ($print.Status -eq 200) "(got $($print.Status))"
  Check 'print page has NO sidebar' (-not ($print.Html -match 'aria-label="Primary"'))
  # The printed document legitimately contains the words "Electronic Permit to
  # Work", so assert on the app header's own control instead of that phrase.
  Check 'print page has NO app header' (-not ($print.Html -match 'aria-label="Open menu"'))
} else {
  Write-Output 'SKIP | no permit id found for print check'
}

Write-Output ''
Write-Output '--- unauthenticated access still gated ---'
$anon = Get-Page '' '/dashboard'
Check 'anonymous /dashboard redirects (302/307/308)' ($anon.Status -in @(302,307,308)) "(got $($anon.Status))"

Write-Output ''
Write-Output "PASSED=$pass FAILED=$fail"
