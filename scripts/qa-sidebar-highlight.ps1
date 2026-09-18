# QA: sidebar markup shipping the fixed highlight classes.
#
# NOTE: the sidebar's role-based rows only exist after the client-side role
# fetch resolves, so the per-route active-item rules are covered by the pure
# unit test in scripts/qa-nav-active.js (22 assertions). This script only
# checks what server-rendered HTML can prove: the classes shipped and the
# default-role nav marks its active row.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env.local'
$url = ((Select-String -Path $envFile -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path $envFile -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$tmp = Join-Path $env:TEMP 'eptw-sidebar-qa'
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
  $payload = @{ access_token = $session.access_token; refresh_token = $session.refresh_token; expires_at = $expiresAt; expires_in = $session.expires_in; token_type = 'bearer'; user = $session.user } | ConvertTo-Json -Compress -Depth 10
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload)).TrimEnd('=').Replace('+','-').Replace('/','_')
  return "sb-$ref-auth-token=base64-$b64"
}

function Get-Page([string]$cookie, [string]$path) {
  $f = Join-Path $tmp "p-$([guid]::NewGuid().ToString('N')).html"
  $code = & curl.exe -s -o $f -w '%{http_code}' "$base$path" -H "Cookie: $cookie" --max-time 30
  return [pscustomobject]@{ Status = [int]$code; Html = [IO.File]::ReadAllText($f) }
}

$SM = Get-ApiCookie 'safetymanager@test.com'
$dash = Get-Page $SM '/dashboard'

Write-Output '--- highlight classes shipped ---'
Check 'hover uses bg-sidebar-accent (was invisible bg-muted)' ($dash.Html -match 'hover:bg-sidebar-accent')
Check 'active uses bg-primary/10 + text-primary' ($dash.Html -match 'bg-primary/10 font-semibold text-primary')
Check 'nav icons upsized to 18px (DESIGN.md §9)' ($dash.Html -match 'h-\[18px\] w-\[18px\]')

# Scope the "no legacy hover" assertion to the sidebar nav: other components
# (header, back button, cards) legitimately still use hover:bg-muted.
$navEarly = [regex]::Match($dash.Html, '(?s)<nav[^>]*aria-label="Primary".*?</nav>').Value
Check 'no legacy hover:bg-muted inside the nav rows' (-not ($navEarly -match 'hover:bg-muted'))

Write-Output '--- default-role nav marks exactly one active row ---'
$nav = [regex]::Match($dash.Html, '(?s)<nav[^>]*aria-label="Primary".*?</nav>')
Check 'primary nav rendered server-side' $nav.Success
if ($nav.Success) {
  $current = ([regex]::Matches($nav.Value, 'aria-current="page"')).Count
  Check "exactly one aria-current in the nav (found $current)" ($current -eq 1)
  $activeText = [regex]::Matches($nav.Value, '(?s)<a[^>]*aria-current="page"[^>]*>(.*?)</a>')
  if ($activeText.Count -eq 1) {
    $label = ([regex]::Replace($activeText[0].Groups[1].Value, '<[^>]+>', ' ') -replace '\s+', ' ').Trim()
    Write-Output "       active row: '$label' (expected Dashboard for the pre-hydration default nav)"
  }
}

Write-Output ''
Write-Output "PASSED=$pass FAILED=$fail"
