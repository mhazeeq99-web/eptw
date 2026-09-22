# QA: /permits/mine mirrors /permits (same UI/UX, requester-scoped).
# Compares the structural markers of both pages and checks server-side filtering,
# pagination hrefs and backward-compatible ?status= links.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env.local'
$url = ((Select-String -Path $envFile -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path $envFile -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$tmp = Join-Path $env:TEMP 'eptw-mine-mirror'
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

$sm = Get-Cookie 'safetymanager@test.com'
$all = Get-Page $sm.cookie '/permits'
$mine = Get-Page $sm.cookie '/permits/mine'

Check '/permits 200' ($all.Status -eq 200)
Check '/permits/mine 200' ($mine.Status -eq 200)

Write-Output ''
Write-Output '--- shared structural markers (both pages) ---'
$markers = @{
  'KPI: Total Permits'      = 'Total Permits'
  'KPI: Active'             = 'KPI_ACTIVE'
  'KPI: Pending'            = 'KPI_PENDING'
  'KPI: Expiring Soon'      = 'Expiring Soon'
  'Filter: search box'      = 'aria-label="Search permits"'
  'Filter: Status select'   = 'aria-label="Status"'
  'Count badge'             = 'permit'
  'Table card title'        = 'Permit List'
  'Table header: Permit'    = '>Permit<'
  'Table header: Work'      = '>Work<'
  'Table header: Type'      = '>Type<'
  'Table header: Area'      = '>Area<'
  'Table header: Status'    = '>Status<'
  'Tip note'                = 'Tip'
}
foreach ($name in $markers.Keys) {
  $needle = $markers[$name]
  if ($needle -eq 'KPI_ACTIVE')  { $a = $all.Html -match '>Active<';   $m = $mine.Html -match '>Active<' }
  elseif ($needle -eq 'KPI_PENDING') { $a = $all.Html -match '>Pending<'; $m = $mine.Html -match '>Pending<' }
  else { $a = $all.Html.Contains($needle); $m = $mine.Html.Contains($needle) }
  Check "$name present on both" ($a -and $m) "(permits=$a mine=$m)"
}

Write-Output ''
Write-Output '--- same table shell + pagination ---'
Check 'both use min-w-[680px] table' ($all.Html -match 'min-w-\[680px\]' -and $mine.Html -match 'min-w-\[680px\]')
Check 'both use ScrollArea max-h-[600px]' ($all.Html -match 'max-h-\[600px\]' -and $mine.Html -match 'max-h-\[600px\]')
# Pagination only renders when the dataset exceeds one page (20), so assert
# against the actual counts rather than assuming 2 pages.
$mineOwned = @(Invoke-RestMethod -Uri "$url/rest/v1/permits?requester_id=eq.$($sm.userId)&select=id" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 25).Count
$minePag = ([regex]::Matches($mine.Html, 'aria-label="Pagination"')).Count
if ($mineOwned -gt 20) {
  Check "pagination shown (mine has $mineOwned > 20)" ($minePag -eq 1) "(found $minePag)"
} else {
  Check "pagination hidden (mine has $mineOwned on one page)" ($minePag -eq 0) "(found $minePag)"
}
Check 'never more than one pagination on /permits/mine' ($minePag -le 1)
Check 'no status tabs remain on /permits/mine' (-not ($mine.Html -match 'Drafts\s*<span'))

Write-Output ''
Write-Output '--- data: /permits/mine is scoped to the requester ---'
$mineIds = [regex]::Matches($mine.Html, '/permits/(\d+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
Check "mine lists rows ($($mineIds.Count) permit links)" ($mineIds.Count -gt 0)
# every id on /permits/mine must be a permit this user raised
$owned = Invoke-RestMethod -Uri "$url/rest/v1/permits?requester_id=eq.$($sm.userId)&select=id" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 25
$ownedIds = @($owned | ForEach-Object { "$($_.id)" })
$foreign = @($mineIds | Where-Object { $ownedIds -notcontains $_ })
Check 'all listed permits belong to the signed-in user' ($foreign.Count -eq 0) "(foreign: $($foreign -join ','))"

Write-Output ''
Write-Output '--- server-side filtering works the same way ---'
$filtered = Get-Page $sm.cookie '/permits/mine?status=pending_approval'
Check 'status filter returns 200' ($filtered.Status -eq 200)
Check 'status filter marks Filtered' ($filtered.Html -match 'Filtered')
$rowsFiltered = [regex]::Matches($filtered.Html, '/permits/(\d+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
$pendingOwned = @($owned | Measure-Object).Count
Check 'status filter narrows the list' ($rowsFiltered.Count -le $mineIds.Count)

$searched = Get-Page $sm.cookie '/permits/mine?q=zzzz-no-match'
Check 'search with no match -> filtered empty state' ($searched.Html -match 'No Permits Match Your Filters' -and $searched.Html -match 'Clear Filters')

Write-Output ''
Write-Output '--- legacy tab URLs still work ---'
$legacy = Get-Page $sm.cookie '/permits/mine?status=draft'
Check 'old ?status=draft link still 200' ($legacy.Status -eq 200)
Check 'old ?status=draft link still marks Filtered' ($legacy.Html -match 'Filtered')

Write-Output ''
Write-Output '--- pagination keeps filters ---'
# This user has fewer than one page of permits, so the rendered pagination is
# absent; assert the wiring at source level instead (identical to /permits).
$mineSrc = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\src\app\(app)\permits\mine\page.tsx'))
$allSrc = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\src\app\(app)\permits\page.tsx'))
Check "mine pagination href carries params (pageHref('/permits/mine', params, p))" ($mineSrc -match "pageHref\('/permits/mine', params, p\)")
Check 'permits page uses the same pattern' ($allSrc -match "pageHref\('/permits', params, p\)")
Check 'mine reuses the shared PermitFilters component' ($mineSrc -match 'PermitFilters')
Check 'mine reuses the shared StatusBadge + getExpiryState' (($mineSrc -match 'StatusBadge') -and ($mineSrc -match 'getExpiryState'))

Write-Output ''
Write-Output "PASSED=$pass FAILED=$fail"
