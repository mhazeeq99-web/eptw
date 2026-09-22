# QA: /permits/mine status tabs + single pagination.
# Compares the rendered tab counts against the database, checks the filtered
# views, and verifies pagination links keep the active filter.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env.local'
$url = ((Select-String -Path $envFile -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path $envFile -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$tmp = Join-Path $env:TEMP 'eptw-mine-qa'
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
  return @{ cookie = "sb-$ref-auth-token=base64-$b64"; userId = $s.user.id }
}

function Get-Page([string]$cookie, [string]$path) {
  $f = Join-Path $tmp "p-$([guid]::NewGuid().ToString('N')).html"
  $code = & curl.exe -s -o $f -w '%{http_code}' "$base$path" -H "Cookie: $cookie" --max-time 30
  return [pscustomobject]@{ Status = [int]$code; Html = [IO.File]::ReadAllText($f) }
}

# Tab badges render as:  Pending <span ...>7</span>
function Get-TabCount([string]$html, [string]$label) {
  $m = [regex]::Match($html, ">\s*$label\s*<span[^>]*>(\d+)</span>")
  if ($m.Success) { return [int]$m.Groups[1].Value }
  return -1
}

$sm = Get-Cookie 'safetymanager@test.com'

# Ground truth straight from the database (service role; bypasses RLS).
$rows = Invoke-RestMethod -Uri "$url/rest/v1/permits?requester_id=eq.$($sm.userId)&select=status" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 25
$all = @($rows).Count
$active = @($rows | Where-Object { $_.status -in @('active','approved','issued') }).Count
$pending = @($rows | Where-Object { $_.status -in @('pending_approval','submitted') }).Count
$draft = @($rows | Where-Object { $_.status -eq 'draft' }).Count
$suspended = @($rows | Where-Object { $_.status -eq 'suspended' }).Count
$completed = @($rows | Where-Object { $_.status -in @('completed','closed','cancelled','rejected','expired') }).Count

Write-Output "--- database truth (safetymanager: $($sm.userId)) ---"
Write-Output "  all=$all active=$active pending=$pending draft=$draft suspended=$suspended completed=$completed"

$mine = Get-Page $sm.cookie '/permits/mine'
Write-Output ''
Write-Output '--- rendered tabs vs database ---'
Check 'page loads' ($mine.Status -eq 200)
Check "All badge = $all" ((Get-TabCount $mine.Html 'All') -eq $all) "(got $(Get-TabCount $mine.Html 'All'))"
Check "Active badge = $active" ((Get-TabCount $mine.Html 'Active') -eq $active) "(got $(Get-TabCount $mine.Html 'Active'))"
Check "Pending badge = $pending" ((Get-TabCount $mine.Html 'Pending') -eq $pending) "(got $(Get-TabCount $mine.Html 'Pending'))"
Check "Drafts badge = $draft" ((Get-TabCount $mine.Html 'Drafts') -eq $draft) "(got $(Get-TabCount $mine.Html 'Drafts'))"
Check "Suspended badge = $suspended" ((Get-TabCount $mine.Html 'Suspended') -eq $suspended) "(got $(Get-TabCount $mine.Html 'Suspended'))"
Check "Completed badge = $completed" ((Get-TabCount $mine.Html 'Completed') -eq $completed) "(got $(Get-TabCount $mine.Html 'Completed'))"

Write-Output ''
Write-Output '--- single pagination, outside-filter behaviour ---'
Check 'unfiltered view marks All as current' ($mine.Html -match 'aria-current="page"[^>]*>\s*All' -or $mine.Html -match 'All\s*<span')
$pagCount = ([regex]::Matches($mine.Html, 'aria-label="Pagination"')).Count
if ($all -gt 20) {
  Check "pagination present ($all permits > 20 per page)" ($pagCount -eq 1) "(found $pagCount)"
} else {
  Check "pagination correctly hidden ($all permits fit one page)" ($pagCount -eq 0) "(found $pagCount)"
}
Check 'never more than one pagination (no per-section pagers)' ($pagCount -le 1) "(found $pagCount)"

Write-Output ''
Write-Output '--- filtered view: drafts ---'
$drafts = Get-Page $sm.cookie '/permits/mine?status=draft'
Check 'drafts page loads' ($drafts.Status -eq 200)
Check 'drafts tab is current' ($drafts.Html -match 'aria-current="page"')
if ($draft -gt 0) {
  Check "drafts badge shows total ($draft)" ($drafts.Html -match "$draft permits?")
  $draftRows = ([regex]::Matches($drafts.Html, '/permits/\d+"')).Count
  Check 'draft rows rendered' ($draftRows -gt 0)
} else {
  Check 'no drafts -> filtered empty state with Clear filter' ($drafts.Html -match 'No drafts permits' -and $drafts.Html -match 'Clear filter')
}

Write-Output ''
Write-Output '--- filtered view: suspended (previously invisible) ---'
$susp = Get-Page $sm.cookie '/permits/mine?status=suspended'
Check 'suspended page loads' ($susp.Status -eq 200)
if ($suspended -gt 0) {
  $suspRows = ([regex]::Matches($susp.Html, '/permits/\d+"')).Count
  Check "suspended permits are now listed ($suspended in db)" ($suspRows -gt 0)
} else {
  Check 'no suspended permits -> empty state with Clear filter' ($susp.Html -match 'Clear filter')
}

Write-Output ''
Write-Output '--- pagination keeps the filter ---'
$page2 = Get-Page $sm.cookie '/permits/mine?status=completed&page=1'
Check 'pagination href keeps status=...' ($page2.Html -match 'permits/mine\?status=completed(&amp;|&)page=')

Write-Output ''
Write-Output "PASSED=$pass FAILED=$fail"
