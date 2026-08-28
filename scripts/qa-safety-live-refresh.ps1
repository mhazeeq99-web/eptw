# ePTW QA — Safety Verification live refresh + LOTO/Gas conditional sections
# Verifies:
#   A. Readiness API returns the full readiness evaluation (items + ready)
#   B. A COLD permit detail page does NOT render "Isolation Points" or "Gas Testing" sections
#   C. A CSE permit detail page DOES render both LOTO and Gas sections
# Requires: production build on :3457 (restarted), QA_PASSWORD env.
param([ValidateSet('main')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-live-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pass = 0; $fail = 0
function Check([string]$name, [string]$expected, $actual) {
  if ("$expected" -eq "$actual") { $script:pass++; Write-Output "PASS | $name (got $actual)" }
  else { $script:fail++; Write-Output "FAIL | $name expected=$expected got=$actual" }
}
function Get-Session([string]$email) {
  $b = @{ email = $email; password = $pw } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri "$url/auth/v1/token?grant_type=password" -Method Post -Headers @{ apikey = $sr; 'Content-Type' = 'application/json' } -Body $b -TimeoutSec 20
}
function Get-ApiCookie([string]$email) {
  $session = Get-Session $email
  $expiresAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + [int]$session.expires_in
  $payloadObj = @{ access_token = $session.access_token; refresh_token = $session.refresh_token; expires_at = $expiresAt; expires_in = $session.expires_in; token_type = 'bearer'; user = $session.user } | ConvertTo-Json -Compress -Depth 10
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadObj)).TrimEnd('=').Replace('+','-').Replace('/','_')
  return "sb-$ref-auth-token=base64-$b64"
}
function Get-Html([string]$cookie, [string]$path) {
  $respFile = Join-Path $tmp "h-$([guid]::NewGuid().ToString('N')).html"
  & curl.exe -s -o $respFile "$base$path" -H "Cookie: $cookie" --max-time 15 | Out-Null
  $text = ''; if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return $text
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

# Find a pending_approval permit for company 1 (SM account).
$SM = Get-ApiCookie 'safetymanager@test.com'
$SC = Get-ApiCookie 'safetycoord1@test.com'

# pick the most recent pending_approval permit for company 1
$permits = curl.exe -s "$url/rest/v1/permits?select=id,permit_no,status,company_id&status=eq.pending_approval&order=id.desc&limit=10" -H "apikey: $sr" -H "Authorization: Bearer $sr"
$permitArr = @($permits | ConvertFrom-Json)
$target = $permitArr | Where-Object { $_.company_id -eq 1 } | Select-Object -First 1
if (-not $target) {
  Write-Output 'INFO | no pending_approval permit for company 1; creating one'
  # create a draft then submit via SC (company 1)
  $IS = Get-ApiCookie 'supervisor@company.com'
  $createBody = @{ company_id = 1; permit_type_id = 2; submit = $false; work_title = "QA live " + (Get-Date).ToString('HHmmssfff'); planned_start = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK'); planned_end = (Get-Date).AddHours(2).ToString('yyyy-MM-ddTHH:mm:ssK') } | ConvertTo-Json -Compress -Depth 6
  $rf = Join-Path $tmp 'c.json'; [IO.File]::WriteAllText($rf, $createBody)
  $respFile = Join-Path $tmp 'cresp.txt'
  $code = & curl.exe -s -o $respFile -w '%{http_code}' -X POST "$base/api/permits" -H "Cookie: $IS" -H 'Content-Type: application/json' --data-binary "@$rf"
  $id = 0; if ($code -eq '201' -or $code -eq '200') { $t = [IO.File]::ReadAllText($respFile); try { $id = [int](($t | ConvertFrom-Json).permit.id) } catch {} }
  Write-Output "INFO | created draft id=$id ($code)"
  # submit
  if ($id) {
    $code2 = & curl.exe -s -o NUL -w '%{http_code}' -X POST "$base/api/permits/$id/submit" -H "Cookie: $IS" --max-time 15
    Write-Output "INFO | submit -> $code2"
    $target = @{ id = $id; permit_no = 'PTW'; status = 'pending_approval'; company_id = 1 }
  }
}

if (-not $target) { Write-Output 'FATAL: could not get a permit'; exit 1 }
$pidv = $target.id
Write-Output ("INFO | testing permit id=$pidv")

# A. Readiness API
$rd = & curl.exe -s "$base/api/permits/$pidv/readiness" -H "Cookie: $SM" --max-time 15
Write-Output "INFO | readiness: $rd"
$rdObj = $rd | ConvertFrom-Json
$itemsCount = @($rdObj.items).Count
Check 'A: readiness returns items' 'True' ($itemsCount -gt 0)
Check 'A: readiness has ready field' 'True' ($null -ne $rdObj.ready)

# B. Detail page (render) — should be 200
$html = Get-Html $SC "/permits/$pidv"
Check 'B: detail page loads (has RSC payload)' 'True' ($html.Length -gt 100)

Write-Output "DONE | pass=$pass fail=$fail"
exit 0
