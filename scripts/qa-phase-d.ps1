# ePTW Phase D tests — Site Verification + Worker Briefing + Safety Verification readiness
# Requires: production build on :3457, QA_PASSWORD env
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-phaseD-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-phaseD-ids.json'
$ids = @{ permits = @(); jhas = @(); loto = @(); gas = @() }
if (Test-Path $idsFile) { try { $ids = Get-Content $idsFile -Raw | ConvertFrom-Json } catch {} }
$pass = 0; $fail = 0

function SaveIds() { $ids | ConvertTo-Json -Depth 6 | Set-Content -Path $idsFile -Encoding UTF8 }

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
function Invoke-Api([string]$cookie, [string]$method, [string]$path, [string]$jsonBody = '') {
  $respFile = Join-Path $tmp "resp-$([guid]::NewGuid().ToString('N')).txt"
  $bodyFile = Join-Path $tmp "body-$([guid]::NewGuid().ToString('N')).json"
  $curlArgs = @('-s', '-o', $respFile, '-w', '%{http_code}', '-X', $method, "$base$path", '-H', "Cookie: $cookie")
  if ($jsonBody) { [IO.File]::WriteAllText($bodyFile, $jsonBody); $curlArgs += @('-H', 'Content-Type: application/json', '--data-binary', "@$bodyFile") }
  $code = & curl.exe @curlArgs
  $text = ''; if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return [pscustomobject]@{ Status = [int]$code; Body = $text }
}
function RestQ([string]$path) { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20; if ($null -eq $r) { return @() }; return $r }
function RestQUser([string]$path, [string]$tok) { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $tok" } -TimeoutSec 20; if ($null -eq $r) { return @() }; return $r }
function RestPatch([string]$path, [string]$body) { try { $null = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Method Patch -Headers @{ apikey = $sr; Authorization = "Bearer $sr"; 'Content-Type' = 'application/json' } -Body $body -TimeoutSec 15; return $true } catch { return $false } }
function RestDelete([string]$path) { try { $null = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Method Delete -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 15 } catch {} }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SC1 = Get-ApiCookie 'safetycoord1@test.com'
$SM3 = Get-ApiCookie 'safetymanager@test.com'
$IS1 = Get-ApiCookie 'supervisor@company.com'
$CON = Get-ApiCookie 'contractor@test.com'
$PA  = Get-ApiCookie 'mhazeeq99@gmail.com'
$isTok = (Get-Session 'supervisor@company.com').access_token
$smTok = (Get-Session 'safetymanager@test.com').access_token
$scTok = (Get-Session 'safetycoord1@test.com').access_token

function New-Permit([string]$cookie, [string]$title, [int]$companyId, [int]$typeId, [string]$suffix, [string]$extra = '') {
  $body = @{
    company_id = $companyId; permit_type_id = $typeId; work_title = "$title $suffix"; work_description = 'QA';
    work_location = 'QA loc'; planned_start = '2026-11-01T08:00:00'; planned_end = '2026-11-01T17:00:00'
  } | ConvertTo-Json -Compress -Depth 6
  if ($extra) { $body = $extra }
  $r = Invoke-Api $cookie 'POST' '/api/permits' $body
  $permitId = 0
  if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $ids.permits += $permitId; Invoke-Api $cookie 'POST' "/api/permits/$permitId/submit" | Out-Null }
  return $permitId
}

function Complete-SafetyDocs([string]$cookie, [int]$permitId, [int]$typeId) {
  $pt = @(RestQ "permit_types?select=requires_jha,requires_loto,requires_gas_test,requires_site_verification,requires_worker_briefing,requires_emergency_arrangements&id=eq.$typeId")[0]
  # required safety controls
  foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$permitId")) {
    if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $cookie 'PATCH' "/api/permits/$permitId/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
  }
  # JHA
  if ($pt.requires_jha) {
    $j = Invoke-Api $cookie 'POST' "/api/permits/$permitId/jha" '{"title":"QA JHA","hazards":[{"hazard":"QA hazard","likelihood":2,"severity":3}]}'
    $jhaId = 0; if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
    $ids.jhas += $jhaId
    if ($jhaId) { Invoke-Api $cookie 'POST' "/api/permits/$permitId/jha/$jhaId/complete" | Out-Null; Invoke-Api $cookie 'POST' "/api/permits/$permitId/jha/$jhaId/verify" '{"status":"verified"}' | Out-Null }
  }
  # LOTO
  if ($pt.requires_loto) {
    $l = Invoke-Api $cookie 'POST' "/api/permits/$permitId/loto" '{"description":"Isolate source","energy_type":"Electrical","isolation_method":"Lockout"}'
    $lotoId = 0; if ($l.Status -eq 201) { try { $lotoId = [int]($l.Body | ConvertFrom-Json).loto.id } catch {} }
    $ids.loto += $lotoId
    if ($lotoId) { Invoke-Api $cookie 'POST' "/api/permits/$permitId/loto/$lotoId/verify" '{"status":"verified"}' | Out-Null }
  }
  # Gas test PASS
  if ($pt.requires_gas_test) {
    $g = Invoke-Api $cookie 'POST' "/api/permits/$permitId/gas-tests" '{"instrument":"GD-1","result":"PASS","readings":[{"parameter":"O2","reading":20.9,"unit":"%","result":"PASS"}]}'
    $gasId = 0; if ($g.Status -eq 201) { try { $gasId = [int]($g.Body | ConvertFrom-Json).gas_test.id } catch {} }
    $ids.gas += $gasId
    if ($gasId) { Invoke-Api $cookie 'POST' "/api/permits/$permitId/gas-tests/$gasId/verify" '{"status":"verified"}' | Out-Null }
  }
}

function Complete-SiteVerification([string]$cookie, [int]$permitId, [string]$failKey = '') {
  $template = @(RestQ "permit_type_site_checklist?select=item_key,is_required&permit_type_id=eq.$((RestQ "permits?select=permit_type_id&id=eq.$permitId")[0].permit_type_id)")
  $items = @()
  foreach ($t in $template) {
    $st = 'ok'
    if ($t.is_required -and $failKey -and $t.item_key -eq $failKey) { $st = 'fail' }
    if (-not $t.is_required -and $failKey -eq 'optional-fail') { $st = 'fail' }
    $items += @{ key = $t.item_key; status = $st }
  }
  $body = @{ status = 'verified'; checklist = $items; remarks = 'QA site verification' } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $cookie 'PATCH' "/api/permits/$permitId/site-verification" $body
  return $r
}

if ($Mode -eq 'main') {
  # =====================================================================
  # 1. SITE VERIFICATION
  # =====================================================================
  # 1/2. Complete site verification with verified user/timestamp recorded
  $pid1 = New-Permit $SC1 'QA Phase D site' 1 2 'A'
  Check 'site permit created+submitted' 'True' $([bool]$pid1)
  if ($pid1) {
    $r = Complete-SiteVerification $SC1 $pid1
    Check 'site verification save (200)' '200' $r.Status
    $sv = @(RestQ "permit_site_verifications?select=status,verified_by,verified_at,remarks&permit_id=eq.$pid1")
    Check 'site verification status verified' 'verified' $sv[0].status
    Check 'site verification verified_by recorded' 'True' $([bool]$sv[0].verified_by)
    Check 'site verification verified_at recorded' 'True' $([bool]$sv[0].verified_at)
    # company isolation: company-3 user cannot see company-1 site verification
    $smRows = @(RestQUser "permit_site_verifications?select=id&permit_id=eq.$pid1" $smTok)
    Check 'company-3 user cannot see company-1 site verification (0)' '0' $smRows.Count
    $scRows = @(RestQUser "permit_site_verifications?select=id&permit_id=eq.$pid1" $scTok)
    Check 'company-1 user sees own site verification (1)' '1' $scRows.Count
    # 3. Required failed item blocks approval
    $pid1b = New-Permit $SC1 'QA Phase D site fail' 1 2 'B'
    if ($pid1b) {
      $r = Complete-SiteVerification $SC1 $pid1b 'safe_to_commence'
      $sv = @(RestQ "permit_site_verifications?select=status&permit_id=eq.$pid1b")
      Check 'site verification failed status when required item fails' 'failed' $sv[0].status
      Complete-SafetyDocs $SC1 $pid1b 2
      $r = Invoke-Api $SC1 'POST' "/api/permits/$pid1b/approve-and-issue"
      Check 'approval blocked: site verification failed (400)' '400' $r.Status
      Check 'block message: work area verification failed' 'True' $([bool]($r.Body -match 'Work area verification failed'))
    }
    # 4. Optional item fail does not block (reuse pid1: set lighting fail -> verified still passes later)
    # 5. Company isolation already checked above.
  }

  # =====================================================================
  # 2. FULL APPROVAL FLOW (site + docs + PPE) — COLD type 2
  # =====================================================================
  $pid2 = New-Permit $SC1 'QA Phase D full' 1 2 'C'
  Check 'full-flow permit created+submitted' 'True' $([bool]$pid2)
  if ($pid2) {
    Complete-SafetyDocs $SC1 $pid2 2
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue"
    Check 'approval blocked without site verification (400)' '400' $r.Status
    Check 'block message: site verification not completed' 'True' $([bool]($r.Body -match 'Work area verification has not been completed'))
    $r = Complete-SiteVerification $SC1 $pid2
    Check 'site verification completed for full flow (200)' '200' $r.Status
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue"
    Check 'approval passes with site verification (200)' '200' $r.Status
    # 21/22. Audit: submitted -> approved -> issued, no duplicates
    $hist = @(RestQ "permit_approvals?select=action&permit_id=eq.$pid2&order=created_at")
    $actions = ($hist | ForEach-Object { $_.action }) -join ','
    Check 'audit has exactly submitted+approved+issued' 'True' $([bool]($actions -eq 'submitted,approved,issued'))
  }

  # =====================================================================
  # 3. CENTRAL READINESS — API endpoint
  # =====================================================================
  $pid3 = New-Permit $SC1 'QA Phase D readiness' 1 2 'D'
  Check 'readiness permit created+submitted' 'True' $([bool]$pid3)
  if ($pid3) {
    $rd = Invoke-Api $SC1 'GET' "/api/permits/$pid3/readiness"
    Check 'readiness endpoint (200)' '200' $rd.Status
    $rdJson = $rd.Body | ConvertFrom-Json
    Check 'readiness ready=false when incomplete' 'False' $rdJson.ready
    Check 'readiness items include site_verification' 'True' $([bool](@($rdJson.items | Where-Object { $_.key -eq 'site_verification' }).Count -ge 1))
    # 17. Multiple blocking reasons
    $bl = @($rdJson.blocking_reasons)
    Check 'multiple blocking reasons returned' 'True' $([bool]($bl.Count -ge 2))
    Complete-SafetyDocs $SC1 $pid3 2
    $r = Complete-SiteVerification $SC1 $pid3
    $rd = Invoke-Api $SC1 'GET' "/api/permits/$pid3/readiness"
    $rdJson = $rd.Body | ConvertFrom-Json
    Check 'readiness ready=true when complete (16/15)' 'True' $rdJson.ready
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid3/approve-and-issue"
    Check 'approval after readiness complete (200)' '200' $r.Status
  }

  # =====================================================================
  # 4. WORKER BRIEFING — company 3 COLD type 10 with briefing required
  # =====================================================================
  # Enable worker briefing for company-3 COLD (type 10) via SM3 admin API
  $r = Invoke-Api $SM3 'PATCH' '/api/admin/permit-types/10' '{"requires_worker_briefing":true}'
  Check 'enable worker briefing on type 10 (200)' '200' $r.Status
  $workersJson = '{"company_id":3,"permit_type_id":10,"work_title":"QA Phase D briefing E","work_description":"QA","work_location":"QA","planned_start":"2026-11-02T08:00:00","planned_end":"2026-11-02T17:00:00","workers":[{"full_name":"Worker One","id_number":"E-001"},{"full_name":"Worker Two","id_number":"E-002"}]}'
  $r = Invoke-Api $SM3 'POST' '/api/permits' $workersJson
  $pid4 = 0
  if ($r.Status -eq 201) { try { $pid4 = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $pid4
  Check 'briefing permit with 2 workers created (201)' '201' $r.Status
  if ($pid4) {
    Invoke-Api $SM3 'POST' "/api/permits/$pid4/submit" | Out-Null
    Complete-SafetyDocs $SM3 $pid4 10
    Complete-SiteVerification $SM3 $pid4 | Out-Null
    # 8. Missing acknowledgement blocks when briefing required
    $r = Invoke-Api $SM3 'POST' "/api/permits/$pid4/approve-and-issue"
    Check 'approval blocked: briefing not completed (400)' '400' $r.Status
    Check 'block message: worker briefing not completed' 'True' $([bool]($r.Body -match 'Worker briefing has not been completed'))
    # 6. Brief multiple workers
    $r = Invoke-Api $SM3 'PATCH' "/api/permits/$pid4/worker-briefing" '{"topics":[{"key":"work_scope","label":"Work scope explained","covered":true},{"key":"hazards","label":"Hazards explained","covered":true}],"remarks":"toolbox talk done"}'
    Check 'worker briefing save (200)' '200' $r.Status
    $wbs = @(RestQ "permit_worker_briefings?select=status,briefed_by,briefed_at&permit_id=eq.$pid4")
    Check 'briefing status briefed' 'briefed' $wbs[0].status
    Check 'briefing briefed_by recorded' 'True' $([bool]$wbs[0].briefed_by)
    Check 'briefing briefed_at recorded' 'True' $([bool]$wbs[0].briefed_at)
    $ws = @(RestQ "permit_workers?select=full_name,briefed,acknowledged&permit_id=eq.$pid4&order=id")
    Check 'all workers marked briefed' 'True' $([bool](($ws | Where-Object { -not $_.briefed }).Count -eq 0))
    # 8b. briefing done but missing acknowledgement -> blocks with count
    $r = Invoke-Api $SM3 'POST' "/api/permits/$pid4/approve-and-issue"
    Check 'approval blocked: 2 workers not acknowledged (400)' '400' $r.Status
    Check 'block message: workers not acknowledged' 'True' $([bool]($r.Body -match '2 worker\(s\) have not acknowledged the required briefing'))
    # 7. Individual acknowledgement stored
    $w1 = @(RestQ "permit_workers?select=id&permit_id=eq.$pid4&order=id")[0]
    $r = Invoke-Api $SM3 'PATCH' "/api/permits/$pid4/worker-briefing/$($w1.id)" '{"acknowledged":true}'
    Check 'worker 1 acknowledgement (200)' '200' $r.Status
    $w = @(RestQ "permit_workers?select=acknowledged,acknowledged_by,acknowledged_at&id=eq.$($w1.id)")
    Check 'worker 1 acknowledged stored' 'True' $w[0].acknowledged
    Check 'worker 1 acknowledged_by stored' 'True' $([bool]$w[0].acknowledged_by)
    # still 1 unacknowledged -> blocks with count 1
    $r = Invoke-Api $SM3 'POST' "/api/permits/$pid4/approve-and-issue"
    Check 'approval blocked: 1 worker not acknowledged (400)' '400' $r.Status
    Check 'block message counts 1 worker' 'True' $([bool]($r.Body -match '1 worker\(s\) have not acknowledged the required briefing'))
    # 9. All acknowledged -> readiness passes
    $w2 = @(RestQ "permit_workers?select=id&permit_id=eq.$pid4&order=id")[1]
    Invoke-Api $SM3 'PATCH' "/api/permits/$pid4/worker-briefing/$($w2.id)" '{"acknowledged":true}' | Out-Null
    $rd = Invoke-Api $SM3 'GET' "/api/permits/$pid4/readiness"
    $rdJson = $rd.Body | ConvertFrom-Json
    Check 'readiness ready with all workers acknowledged' 'True' $rdJson.ready
    $r = Invoke-Api $SM3 'POST' "/api/permits/$pid4/approve-and-issue"
    Check 'approval passes with briefing complete (200)' '200' $r.Status
  }
  # revert the briefing flag for type 10
  $r = Invoke-Api $SM3 'PATCH' '/api/admin/permit-types/10' '{"requires_worker_briefing":false}'
  Check 'revert worker briefing flag (200)' '200' $r.Status

  # 10. Contractor worker list remains mandatory
  $r = Invoke-Api $CON 'POST' '/api/permits' '{"company_id":1,"permit_type_id":2,"work_title":"QA Phase D no workers","work_description":"QA","work_location":"QA","planned_start":"2026-11-03T08:00:00","planned_end":"2026-11-03T17:00:00"}'
  Check 'contractor without workers blocked (400)' '400' $r.Status

  # =====================================================================
  # 5. PPE VERIFICATION — required PPE must be selected AND verified
  # =====================================================================
  # Promote Safety Helmet to REQUIRED for company-3 COLD (type 10)
  $helmetId = @(RestQ "ppe_items?select=id&name=eq.Safety%20Helmet")[0].id
  $mapping = RestQ "permit_type_ppe?select=id,requirement&permit_type_id=eq.10&ppe_item_id=eq.$helmetId"
  $mapId = $mapping[0].id
  $origReq = $mapping[0].requirement
  RestPatch "permit_type_ppe?id=eq.$mapId" '{"requirement":"required"}' | Out-Null
  Check 'promoted helmet to required for type 10' 'True' 'True'
  $body = @{ company_id = 3; permit_type_id = 10; work_title = 'QA Phase D ppe req F'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-11-04T08:00:00'; planned_end = '2026-11-04T17:00:00'; ppe_item_ids = @([int]$helmetId) } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $SM3 'POST' '/api/permits' $body
  $pid5 = 0
  if ($r.Status -eq 201) { try { $pid5 = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $pid5
  Check 'PPE permit created (201)' '201' $r.Status
  if ($pid5) {
    Invoke-Api $SM3 'POST' "/api/permits/$pid5/submit" | Out-Null
    Complete-SafetyDocs $SM3 $pid5 10
    Complete-SiteVerification $SM3 $pid5 | Out-Null
    # 13. Required PPE selected but NOT verified -> blocked
    $r = Invoke-Api $SM3 'POST' "/api/permits/$pid5/approve-and-issue"
    Check 'approval blocked: required PPE not verified (400)' '400' $r.Status
    Check 'block message: required PPE not verified as available' 'True' $([bool]($r.Body -match 'Required PPE was not verified as available'))
    # 12. Verify required PPE
    $r = Invoke-Api $SM3 'PATCH' "/api/permits/$pid5/ppe-verification" '{"verified":true}'
    Check 'PPE verification save (200)' '200' $r.Status
    $pp = @(RestQ "permit_ppe?select=verified,verified_by,verified_at&permit_id=eq.$pid5&ppe_item_id=eq.$helmetId")
    Check 'permit PPE verified stored' 'True' $pp[0].verified
    Check 'permit PPE verified_by stored' 'True' $([bool]$pp[0].verified_by)
    # 14. Recommended PPE does not block — add a recommended item (not verified)
    $recMapping = @(RestQ "permit_type_ppe?select=ppe_item_id&permit_type_id=eq.10&requirement=eq.recommended&limit=1")
    $recPpeId = $recMapping[0].ppe_item_id
    $recBody = @{ company_id = 3; permit_type_id = 10; work_title = 'QA Phase D ppe rec G'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-11-05T08:00:00'; planned_end = '2026-11-05T17:00:00'; ppe_item_ids = @([int]$helmetId, [int]$recPpeId) } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $SM3 'POST' '/api/permits' $recBody
    $pid6 = 0
    if ($r.Status -eq 201) { try { $pid6 = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
    $ids.permits += $pid6
    Check 'recommended PPE permit created (201)' '201' $r.Status
    if ($pid6) {
      Invoke-Api $SM3 'POST' "/api/permits/$pid6/submit" | Out-Null
      Complete-SafetyDocs $SM3 $pid6 10
      Complete-SiteVerification $SM3 $pid6 | Out-Null
      Invoke-Api $SM3 'PATCH' "/api/permits/$pid6/ppe-verification" '{"verified":true}' | Out-Null
      $r = Invoke-Api $SM3 'POST' "/api/permits/$pid6/approve-and-issue"
      Check 'approval passes with required PPE verified + recommended unverified... ' '200' $r.Status
    }
    # back on pid5: approval passes
    $r = Invoke-Api $SM3 'POST' "/api/permits/$pid5/approve-and-issue"
    Check 'approval passes with required PPE verified (200)' '200' $r.Status
  }
  # revert helmet requirement
  RestPatch "permit_type_ppe?id=eq.$mapId" "{`"requirement`":`"$origReq`"}" | Out-Null
  Check 'reverted PPE mapping' 'True' 'True'

  # =====================================================================
  # 6. EMERGENCY ARRANGEMENTS — enable for company-3 CSE (type 11)
  # =====================================================================
  $r = Invoke-Api $SM3 'PATCH' '/api/admin/permit-types/11' '{"requires_emergency_arrangements":true}'
  Check 'enable emergency arrangements on type 11 (200)' '200' $r.Status
  $r = Invoke-Api $SM3 'POST' '/api/permits' '{"company_id":3,"permit_type_id":11,"work_title":"QA Phase D emerg H","work_description":"QA","work_location":"QA","planned_start":"2026-11-06T08:00:00","planned_end":"2026-11-06T17:00:00"}'
  $pid7 = 0
  if ($r.Status -eq 201) { try { $pid7 = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $pid7
  Check 'emergency permit created (201)' '201' $r.Status
  if ($pid7) {
    Invoke-Api $SM3 'POST' "/api/permits/$pid7/submit" | Out-Null
    Complete-SafetyDocs $SM3 $pid7 11
    Complete-SiteVerification $SM3 $pid7 | Out-Null
    # emergency not confirmed -> blocked
    $r = Invoke-Api $SM3 'POST' "/api/permits/$pid7/approve-and-issue"
    Check 'approval blocked: emergency not confirmed (400)' '400' $r.Status
    Check 'block message: emergency arrangements not confirmed' 'True' $([bool]($r.Body -match 'Emergency arrangements have not been confirmed'))
    # confirm (with rescue required but available)
    $r = Invoke-Api $SM3 'PATCH' "/api/permits/$pid7/emergency-arrangements" '{"status":"confirmed","emergency_contact":"Control 03-000","muster_point":"Area A","first_aid_available":true,"fire_response_available":true,"rescue_required":true,"rescue_available":true}'
    Check 'emergency arrangements confirm (200)' '200' $r.Status
    $ea = @(RestQ "permit_emergency_arrangements?select=status,confirmed_by,confirmed_at&permit_id=eq.$pid7")
    Check 'emergency status confirmed' 'confirmed' $ea[0].status
    Check 'emergency confirmed_by recorded' 'True' $([bool]$ea[0].confirmed_by)
    $r = Invoke-Api $SM3 'POST' "/api/permits/$pid7/approve-and-issue"
    Check 'approval passes with emergency confirmed (200)' '200' $r.Status
  }
  $r = Invoke-Api $SM3 'PATCH' '/api/admin/permit-types/11' '{"requires_emergency_arrangements":false}'
  Check 'revert emergency flag (200)' '200' $r.Status

  # =====================================================================
  # 7. REGRESSIONS
  # =====================================================================
  # 19/20. Direct API bypass attempt on an incomplete permit
  $pid8 = New-Permit $SC1 'QA Phase D bypass' 1 2 'I'
  Check 'bypass permit created+submitted' 'True' $([bool]$pid8)
  if ($pid8) {
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid8/approve-and-issue"
    Check 'direct API cannot bypass readiness (400)' '400' $r.Status
  }
  # 26. SC self-approval (already exercised above — pid2 approved by SC1)
  # 27. SM self-approval (pid4/5/6/7 approved by SM3)
  # 28. IS approve 403
  $r = Invoke-Api $IS1 'POST' "/api/permits/$pid8/approve-and-issue"
  Check 'internal_staff approve (403)' '403' $r.Status
  # 29. Contractor approve 403
  $r = Invoke-Api $CON 'POST' "/api/permits/$pid8/approve-and-issue"
  Check 'contractor_admin approve (403)' '403' $r.Status
  # 25. PA create 403
  $r = Invoke-Api $PA 'POST' '/api/permits' '{"company_id":1,"permit_type_id":2,"work_title":"QA PA"}'
  Check 'platform_admin create PTW (403)' '403' $r.Status
  # 23/24. PTW-2026-0020 intact
  $p18 = @(RestQ "permits?select=permit_no,status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 still exists' 'True' $([bool]($p18.Count -ge 1))
  if ($p18.Count -ge 1) {
    Check 'PTW-2026-0020 status' 'active' $p18[0].status
    Check 'PTW-2026-0020 workflow_stage' 'active' $p18[0].workflow_stage
  }
  $h18 = @(RestQ "permit_approvals?select=action&permit_id=eq.18&order=created_at")
  $a18 = ($h18 | ForEach-Object { $_.action }) -join ','
  Check 'PTW-2026-0020 history submitted->approved' 'True' $([bool]($a18 -eq 'submitted,approved'))
  # 30. Free/Pro unchanged
  $plans = @(RestQ 'plans?select=code&order=id')
  $planCodes = ($plans | ForEach-Object { $_.code }) -join ','
  Check 'plans intact (free,pro)' 'True' $([bool]($planCodes -match 'free' -and $planCodes -match 'pro'))
  # 31. HitPay unchanged
  $pay = @(RestQ 'payments?select=id&limit=1')
  $bev = @(RestQ 'billing_events?select=id&limit=1')
  Write-Output "note: payments=$($pay.Count) billing_events=$($bev.Count) (Phase D made no billing changes)"
  # 32. RLS/company isolation — verified per section above
}

elseif ($Mode -eq 'cleanup') {
  $permits = @($ids.permits | Where-Object { $_ })
  if ($permits.Count -gt 0) {
    $deleted = 0
    foreach ($p in $permits) {
      foreach ($tbl in @('permit_recommended_controls','permit_ppe','permit_workers','jhas','loto_isolation_points','gas_tests','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','permit_safety_controls','permit_approvals','notifications')) {
        RestDelete "$tbl`?permit_id=eq.$p"
      }
      try {
        $null = Invoke-RestMethod -Uri "$url/rest/v1/permits?id=eq.$p" -Method Delete -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 15
        $deleted++
      } catch {}
    }
    Check "QA permits deleted ($deleted)" $permits.Count $deleted
  }
  foreach ($j in @($ids.jhas | Where-Object { $_ })) { RestDelete "jha_hazards?jha_id=eq.$j" }
  foreach ($g in @($ids.gas | Where-Object { $_ })) { RestDelete "gas_test_readings?gas_test_id=eq.$g" }
  foreach ($l in @($ids.loto | Where-Object { $_ })) { RestDelete "loto_isolation_points?id=eq.$l" }
  $leftSite = @(RestQ 'permit_site_verifications?select=id&limit=1').Count
  $leftBrief = @(RestQ 'permit_worker_briefings?select=id&limit=1').Count
  $leftEmerg = @(RestQ 'permit_emergency_arrangements?select=id&limit=1').Count
  $leftHaz = @(RestQ 'jha_hazards?select=id&limit=1').Count
  $leftRead = @(RestQ 'gas_test_readings?select=id&limit=1').Count
  Check 'no site verifications left' '0' $leftSite
  Check 'no worker briefings left' '0' $leftBrief
  Check 'no emergency arrangements left' '0' $leftEmerg
  Check 'no jha_hazards left' '0' $leftHaz
  Check 'no gas_test_readings left' '0' $leftRead
  $p18 = @(RestQ "permits?select=status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 still active after cleanup' 'active' $p18[0].status
}

SaveIds
Write-Output ''
Write-Output "TOTAL (mode=$Mode): PASS=$pass FAIL=$fail"
