# ePTW entitlement (Free/Pro) live tests — production build on :3457
# Modes: free | pro | downgrade
param([Parameter(Mandatory=$true)][ValidateSet('free','pro','downgrade')][string]$Mode)
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$idsFile = Join-Path $env:TEMP 'eptw-ent-ids.json'
$ids = @{ permits = @(); users = @() }
if (Test-Path $idsFile) { try { $ids = Get-Content $idsFile -Raw | ConvertFrom-Json } catch {} }
$tmp = Join-Path $env:TEMP 'eptw-ent-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pass = 0; $fail = 0

function Check([string]$name, [string]$expected, $actual) {
  if ("$expected" -eq "$actual") { $script:pass++; Write-Output "PASS | $name (got $actual)" }
  else { $script:fail++; Write-Output "FAIL | $name expected=$expected got=$actual" }
}
function SaveIds() { $ids | ConvertTo-Json -Depth 5 | Set-Content -Path $idsFile -Encoding UTF8 }

function Get-Session([string]$email) {
  $loginBody = @{ email = $email; password = $pw } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri "$url/auth/v1/token?grant_type=password" -Method Post `
    -Headers @{ apikey = $sr; 'Content-Type' = 'application/json' } -Body $loginBody -TimeoutSec 20
}
function Get-ApiCookie([string]$email) {
  $session = Get-Session $email
  $expiresAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + [int]$session.expires_in
  $payloadObj = @{
    access_token  = $session.access_token
    refresh_token = $session.refresh_token
    expires_at    = $expiresAt
    expires_in    = $session.expires_in
    token_type    = 'bearer'
    user          = $session.user
  } | ConvertTo-Json -Compress -Depth 10
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadObj)).TrimEnd('=').Replace('+','-').Replace('/','_')
  return "sb-$ref-auth-token=base64-$b64"
}

function Invoke-Api([string]$cookie, [string]$method, [string]$path, [string]$jsonBody = '') {
  $respFile = Join-Path $tmp "resp-$([guid]::NewGuid().ToString('N')).txt"
  $bodyFile = Join-Path $tmp "body-$([guid]::NewGuid().ToString('N')).json"
  $curlArgs = @('-s', '-o', $respFile, '-w', '%{http_code}', '-X', $method, "$base$path", '-H', "Cookie: $cookie")
  if ($jsonBody) { [IO.File]::WriteAllText($bodyFile, $jsonBody); $curlArgs += @('-H', 'Content-Type: application/json', '--data-binary', "@$bodyFile") }
  $code = & curl.exe @curlArgs
  $text = ''
  if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return [pscustomobject]@{ Status = [int]$code; Body = $text }
}

# service-role REST (bypasses RLS) — used only for state counts
function RestQ([string]$path) {
  $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20
  if ($null -eq $r) { return @() }
  return $r
}
# user-scoped REST (RLS enforced) — used for the subscription isolation tests
function RestQUser([string]$path, [string]$accessToken) {
  $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $accessToken" } -TimeoutSec 20
  if ($null -eq $r) { return @() }
  return $r
}
function PermitsOf([int]$companyId) { return @(RestQ "permits?select=id,status,created_at&company_id=eq.$companyId") }
function ActiveCountOf([int]$companyId) {
  $rows = PermitsOf $companyId
  return @($rows | Where-Object { $_.status -eq 'active' -or $_.status -eq 'suspended' }).Count
}
function MonthlyCountOf([int]$companyId) {
  $rows = PermitsOf $companyId
  $monthStart = [DateTime]::UtcNow.ToString('yyyy-MM-01T00:00:00Z')
  return @($rows | Where-Object { $_.created_at -ge $monthStart }).Count
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }
Write-Output "server ready (mode=$Mode ref=$ref)"

$SM3 = Get-ApiCookie 'safetymanager@test.com'
$SC1 = Get-ApiCookie 'safetycoord1@test.com'
$IS1 = Get-ApiCookie 'supervisor@company.com'
$PA  = Get-ApiCookie 'mhazeeq99@gmail.com'

if ($Mode -eq 'free') {
  # ---------------- SECURITY: subscription isolation ----------------
  $isTok = (Get-Session 'supervisor@company.com').access_token
  $smTok = (Get-Session 'safetymanager@test.com').access_token
  $paTok = (Get-Session 'mhazeeq99@gmail.com').access_token
  $subsIs = @(RestQUser 'company_subscriptions?select=id,company_id' $isTok)
  $leak = @($subsIs | Where-Object { $_.company_id -ne 1 }).Count
  Check 'IS(company1) cannot see other companies subscriptions (0 leaked)' '0' $leak
  $subsSm = @(RestQUser 'company_subscriptions?select=id,company_id' $smTok)
  Check 'SM(company3) sees no other company subscriptions' '0' $subsSm.Count
  $subsPa = @(RestQUser 'company_subscriptions?select=id,company_id' $paTok)
  Check 'platform_admin sees platform-level subscriptions (>=1)' '1' $(if ($subsPa.Count -ge 1) {'1'} else {'0'})
  try {
    Invoke-RestMethod -Uri "$url/rest/v1/company_subscriptions" -Method Post `
      -Headers @{ apikey = $sr; Authorization = "Bearer $isTok"; 'Content-Type' = 'application/json' } `
      -Body '{"company_id":3,"plan_id":1,"status":"active"}' -TimeoutSec 15 | Out-Null
    Check 'company user cannot INSERT subscription (403)' '403' '200'
  } catch { $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }; Check 'company user cannot INSERT subscription (403)' '403' $code }

  # ---------------- USER LIMITS (company 3) ----------------
  $b = @{ full_name = 'QA Ent SC A'; email = 'qaent-sc-a@test.com'; role = 'safety_coordinator' } | ConvertTo-Json -Compress
  $u1 = Invoke-Api $SM3 'POST' '/api/company/users' $b
  Check 'create SC #2 (allowed 2/2)' '201' $u1.Status
  $b = @{ full_name = 'QA Ent SC B'; email = 'qaent-sc-b@test.com'; role = 'safety_coordinator' } | ConvertTo-Json -Compress
  $u2 = Invoke-Api $SM3 'POST' '/api/company/users' $b
  Check 'create SC #3 (blocked 2/2)' '403' $u2.Status
  $b = @{ full_name = 'QA Ent IS A'; email = 'qaent-is-a@test.com'; role = 'internal_staff' } | ConvertTo-Json -Compress
  $u3 = Invoke-Api $SM3 'POST' '/api/company/users' $b
  Check 'create IS #4 (allowed)' '201' $u3.Status
  $b = @{ full_name = 'QA Ent IS B'; email = 'qaent-is-b@test.com'; role = 'internal_staff' } | ConvertTo-Json -Compress
  $u4 = Invoke-Api $SM3 'POST' '/api/company/users' $b
  Check 'create IS #5 (allowed 5/5)' '201' $u4.Status
  $b = @{ full_name = 'QA Ent IS C'; email = 'qaent-is-c@test.com'; role = 'internal_staff' } | ConvertTo-Json -Compress
  $u5 = Invoke-Api $SM3 'POST' '/api/company/users' $b
  Check 'create IS #6 (blocked 5/5)' '403' $u5.Status
  foreach ($resp in @($u1, $u3, $u4)) {
    if ($resp.Status -eq 201) { try { $uid = ($resp.Body | ConvertFrom-Json).user.id; if ($uid) { $ids.users += $uid } } catch {} }
  }

  # ---------------- MONTHLY LIMIT (company 1) ----------------
  $m0 = MonthlyCountOf 1
  $needed = [Math]::Max(0, 20 - $m0)
  $c1Permits = @()
  for ($i = 1; $i -le $needed; $i++) {
    $b = @{ company_id = 1; permit_type_id = 2; work_title = "QA ent monthly $i"; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-01T08:00:00'; planned_end = '2026-09-01T17:00:00' } | ConvertTo-Json -Compress
    $r = Invoke-Api $SC1 'POST' '/api/permits' $b
    if ($r.Status -eq 201) { try { $c1Permits += [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  }
  Check "company1 monthly fills to 20/20 ($needed allowed)" $needed $c1Permits.Count
  Check 'company1 monthly usage reached 20' '20' (MonthlyCountOf 1)
  $b = @{ company_id = 1; permit_type_id = 2; work_title = 'QA ent monthly 21'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-01T08:00:00'; planned_end = '2026-09-01T17:00:00'; plan = 'pro' } | ConvertTo-Json -Compress
  $blocked = Invoke-Api $SC1 'POST' '/api/permits' $b
  Check '21st permit blocked (403) even with plan=pro body' '403' $blocked.Status
  foreach ($p in $c1Permits) { $ids.permits += $p }

  # ---------------- SELF-APPROVE REGRESSION (company 1, SC1) ----------------
  $selfPid = $c1Permits[0]
  $r = Invoke-Api $SC1 'POST' "/api/permits/$selfPid/submit"
  Check 'SC1 submit own permit (200)' '200' $r.Status
  $j = Invoke-Api $SC1 'POST' "/api/permits/$selfPid/jha" '{"title":"QA ent JHA"}'
  $jhaId = 0; if ($j.Status -eq 200 -or $j.Status -eq 201) { try { $jhaId = ($j.Body | ConvertFrom-Json).jha.id } catch {} }
  if ($jhaId) { Invoke-Api $SC1 'POST' "/api/permits/$selfPid/jha/$jhaId/verify" '{"status":"verified"}' | Out-Null }
  foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$selfPid")) {
    if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $SC1 'PATCH' "/api/permits/$selfPid/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
  }
  $r = Invoke-Api $SC1 'POST' "/api/permits/$selfPid/approve-and-issue"
  Check 'SC1 self-approve (200)' '200' $r.Status
  $st = @(RestQ "permits?select=status,workflow_stage&id=eq.$selfPid")
  if ($st.Count -gt 0) { Check 'SC1 self-approved permit active' 'active' $st[0].status }
  $isPid = $c1Permits[1]
  $r = Invoke-Api $IS1 'POST' "/api/permits/$isPid/approve-and-issue"
  Check 'internal_staff cannot approve (403)' '403' $r.Status

  # ---------------- ACTIVE LIMIT (company 3) ----------------
  $a0 = ActiveCountOf 3
  $allow = [Math]::Max(0, 10 - $a0)
  $c3Permits = @()
  for ($i = 1; $i -le 10; $i++) {
    $b = @{ company_id = 3; permit_type_id = 10; work_title = "QA ent active $i"; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-02T08:00:00'; planned_end = '2026-09-02T17:00:00' } | ConvertTo-Json -Compress
    $r = Invoke-Api $SM3 'POST' '/api/permits' $b
    if ($r.Status -eq 201) { try { $c3Permits += [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  }
  foreach ($p in $c3Permits) {
    Invoke-Api $SM3 'POST' "/api/permits/$p/submit" | Out-Null
    $j = Invoke-Api $SM3 'POST' "/api/permits/$p/jha" '{"title":"QA ent JHA"}'
    $jid = 0; if ($j.Status -eq 200 -or $j.Status -eq 201) { try { $jid = ($j.Body | ConvertFrom-Json).jha.id } catch {} }
    if ($jid) { Invoke-Api $SM3 'POST' "/api/permits/$p/jha/$jid/verify" '{"status":"verified"}' | Out-Null }
    foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$p")) {
      if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $SM3 'PATCH' "/api/permits/$p/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
    }
  }
  $approved = 0
  for ($i = 0; $i -lt $allow; $i++) {
    $r = Invoke-Api $SM3 'POST' "/api/permits/$($c3Permits[$i])/approve-and-issue"
    if ($r.Status -eq 200) { $approved++ }
  }
  Check "company3 approvals to 10/10 active ($allow allowed)" $allow $approved
  Check 'company3 active count = 10' '10' (ActiveCountOf 3)
  $r = Invoke-Api $SM3 'POST' "/api/permits/$($c3Permits[$allow])/approve-and-issue"
  Check 'next active permit blocked (403)' '403' $r.Status
  foreach ($p in $c3Permits) { $ids.permits += $p }

  # ---------------- STORAGE (company 3) ----------------
  $storagePid = $c3Permits[$c3Permits.Count - 1]
  $r = Invoke-Api $SM3 'POST' "/api/permits/$storagePid/attachments/upload-url" '{"filename":"big.pdf","content_type":"application/pdf","size_bytes":629145600}'
  Check 'storage 600MB upload blocked (403)' '403' $r.Status
  $r = Invoke-Api $SM3 'POST' "/api/permits/$storagePid/attachments/upload-url" '{"filename":"small.pdf","content_type":"application/pdf","size_bytes":1024}'
  Check 'storage small upload allowed (200)' '200' $r.Status

  # ---------------- PAGES ----------------
  $p1 = & curl.exe -s -o NUL -w '%{http_code}' "$base/pricing" -H "Cookie: $SM3" --max-time 20
  Check 'GET /pricing (200)' '200' $p1
  $p2 = & curl.exe -s -o NUL -w '%{http_code}' "$base/settings/subscription" -H "Cookie: $SM3" --max-time 20
  Check 'GET /settings/subscription (200)' '200' $p2
}

elseif ($Mode -eq 'pro') {
  $sub = @(RestQ 'company_subscriptions?select=plan_id,status&company_id=eq.3')
  $isPro = ($sub.Count -ge 1) -and ($sub[0].status -eq 'active')
  Check 'company 3 has active subscription' 'True' $isPro
  $proPermits = @()
  for ($i = 1; $i -le 21; $i++) {
    $b = @{ company_id = 3; permit_type_id = 10; work_title = "QA ent pro $i"; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-03T08:00:00'; planned_end = '2026-09-03T17:00:00' } | ConvertTo-Json -Compress
    $r = Invoke-Api $SM3 'POST' '/api/permits' $b
    if ($r.Status -eq 201) { try { $proPermits += [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  }
  Check 'PRO: 21 permits created (unlimited monthly)' '21' $proPermits.Count
  $p = $proPermits[0]
  Invoke-Api $SM3 'POST' "/api/permits/$p/submit" | Out-Null
  $j = Invoke-Api $SM3 'POST' "/api/permits/$p/jha" '{"title":"QA ent pro JHA"}'
  $jid = 0; if ($j.Status -eq 200 -or $j.Status -eq 201) { try { $jid = ($j.Body | ConvertFrom-Json).jha.id } catch {} }
  if ($jid) { Invoke-Api $SM3 'POST' "/api/permits/$p/jha/$jid/verify" '{"status":"verified"}' | Out-Null }
  foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$p")) {
    if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $SM3 'PATCH' "/api/permits/$p/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
  }
  $r = Invoke-Api $SM3 'POST' "/api/permits/$p/approve-and-issue"
  Check 'PRO: >10 active permits allowed (11th active)' '200' $r.Status
  $b = @{ full_name = 'QA Ent SC Pro'; email = 'qaent-sc-pro@test.com'; role = 'safety_coordinator' } | ConvertTo-Json -Compress
  $u = Invoke-Api $SM3 'POST' '/api/company/users' $b
  Check 'PRO: create SC #3 allowed (pro limit 10)' '201' $u.Status
  if ($u.Status -eq 201) { try { $uid = ($u.Body | ConvertFrom-Json).user.id; if ($uid) { $ids.users += $uid } } catch {} }
  foreach ($p in $proPermits) { $ids.permits += $p }
  $subHtml = & curl.exe -s "$base/settings/subscription" -H "Cookie: $SM3" --max-time 20
  Check 'subscription page shows Pro' 'True' $([bool]($subHtml -match 'Pro'))
}

elseif ($Mode -eq 'downgrade') {
  $sub = @(RestQ 'company_subscriptions?select=plan_id,status&company_id=eq.3')
  Check 'company 3 subscription removed (falls back to Free)' '0' $sub.Count
  $b = @{ company_id = 3; permit_type_id = 10; work_title = 'QA ent downgrade'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-04T08:00:00'; planned_end = '2026-09-04T17:00:00' } | ConvertTo-Json -Compress
  $r = Invoke-Api $SM3 'POST' '/api/permits' $b
  Check 'downgrade: new permit blocked (403, over Free monthly)' '403' $r.Status
  $cnt = @(PermitsOf 3).Count
  Check 'downgrade: existing permits remain accessible (>0)' 'True' $([bool]($cnt -gt 0))
  $users = @(RestQ 'profiles?select=id&company_id=eq.3&is_active=eq.true')
  Check 'downgrade: existing users remain active' 'True' $([bool]($users.Count -gt 0))
  $p2 = & curl.exe -s -o NUL -w '%{http_code}' "$base/settings/subscription" -H "Cookie: $SM3" --max-time 20
  Check 'subscription page still renders (Free)' '200' $p2
}

SaveIds
Write-Output ''
Write-Output "TOTAL (mode=$Mode): PASS=$pass FAIL=$fail"
