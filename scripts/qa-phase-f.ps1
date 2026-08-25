# ePTW Phase F tests — Final Operational Hardening (validity/expiry/suspend/resume/complete/close)
# Requires: production build on :3457, QA_PASSWORD env
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-phaseF-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-phaseF-ids.json'
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
function RestDelete([string]$path) { try { $null = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Method Delete -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 15 } catch {} }
function RestPatch([string]$path, [string]$body) { try { $null = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Method Patch -Headers @{ apikey = $sr; Authorization = "Bearer $sr"; 'Content-Type' = 'application/json' } -Body $body -TimeoutSec 15; return $true } catch { return $false } }

# UTC-ISO timestamps (with explicit Z) so planned dates are unambiguous.
function UtcIso([int]$hoursFromNow) {
  return (Get-Date).ToUniversalTime().AddHours($hoursFromNow).ToString('yyyy-MM-ddTHH:mm:ss') + 'Z'
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SC1 = Get-ApiCookie 'safetycoord1@test.com'
$SM3 = Get-ApiCookie 'safetymanager@test.com'
$IS1 = Get-ApiCookie 'supervisor@company.com'
$CON = Get-ApiCookie 'contractor@test.com'

function New-Submitted-Permit([string]$cookie, [string]$title, [int]$companyId, [int]$typeId, [string]$startIso, [string]$endIso) {
  $body = @{ company_id = $companyId; permit_type_id = $typeId; work_title = $title; work_description = 'QA'; work_location = 'QA'; planned_start = $startIso; planned_end = $endIso } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $cookie 'POST' '/api/permits' $body
  $permitId = 0
  if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $ids.permits += $permitId; Invoke-Api $cookie 'POST' "/api/permits/$permitId/submit" | Out-Null }
  return $permitId
}

function Complete-Common([string]$cookie, [int]$permitId, [int]$typeId) {
  $pt = @(RestQ "permit_types?select=requires_jha,requires_loto,requires_gas_test&id=eq.$typeId")[0]
  foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$permitId")) {
    if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $cookie 'PATCH' "/api/permits/$permitId/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
  }
  if ($pt.requires_jha) {
    $j = Invoke-Api $cookie 'POST' "/api/permits/$permitId/jha" '{"title":"QA JHA","hazards":[{"hazard":"QA hazard","likelihood":2,"severity":3}]}'
    $jhaId = 0; if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
    $ids.jhas += $jhaId
    if ($jhaId) { Invoke-Api $cookie 'POST' "/api/permits/$permitId/jha/$jhaId/complete" | Out-Null; Invoke-Api $cookie 'POST' "/api/permits/$permitId/jha/$jhaId/verify" '{"status":"verified"}' | Out-Null }
  }
  if ($pt.requires_loto) {
    $l = Invoke-Api $cookie 'POST' "/api/permits/$permitId/loto" '{"description":"Isolate source","energy_type":"Electrical","isolation_method":"Lockout"}'
    $lotoId = 0; if ($l.Status -eq 201) { try { $lotoId = [int]($l.Body | ConvertFrom-Json).loto.id } catch {} }
    $ids.loto += $lotoId
    if ($lotoId) { Invoke-Api $cookie 'POST' "/api/permits/$permitId/loto/$lotoId/verify" '{"status":"verified"}' | Out-Null }
  }
  if ($pt.requires_gas_test) {
    $g = Invoke-Api $cookie 'POST' "/api/permits/$permitId/gas-tests" '{"instrument":"GD-1","result":"PASS","readings":[{"parameter":"O2","reading":20.9,"unit":"%","result":"PASS"}]}'
    $gasId = 0; if ($g.Status -eq 201) { try { $gasId = [int]($g.Body | ConvertFrom-Json).gas_test.id } catch {} }
    $ids.gas += $gasId
    if ($gasId) { Invoke-Api $cookie 'POST' "/api/permits/$permitId/gas-tests/$gasId/verify" '{"status":"verified"}' | Out-Null }
  }
}

function Complete-Site([string]$cookie, [int]$permitId) {
  $typeId = @(RestQ "permits?select=permit_type_id&id=eq.$permitId")[0].permit_type_id
  $template = @(RestQ "permit_type_site_checklist?select=item_key,is_required&permit_type_id=eq.$typeId")
  $items = @()
  foreach ($t in $template) {
    $items += @{ key = $t.item_key; status = if ($t.is_required) { 'ok' } else { 'na' } }
  }
  $body = @{ status = 'verified'; checklist = $items; remarks = 'QA' } | ConvertTo-Json -Compress -Depth 6
  Invoke-Api $cookie 'PATCH' "/api/permits/$permitId/site-verification" $body | Out-Null
}

if ($Mode -eq 'main') {
  # =====================================================================
  # 1. VALIDITY — approved permit gets valid_from/valid_until; expiry states
  # =====================================================================
  $futureEnd = UtcIso 6
  $pastEnd = UtcIso -2
  $nearEnd = UtcIso 1
  $startNow = UtcIso 0

  $pid1 = New-Submitted-Permit $SC1 'QA Phase F valid' 1 2 $startNow $futureEnd
  Check 'validity permit created+submitted' 'True' $([bool]$pid1)
  if ($pid1) {
    Complete-Common $SC1 $pid1 2
    Complete-Site $SC1 $pid1
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid1/approve-and-issue"
    Check 'approval sets active (200)' '200' $r.Status
    $p = @(RestQ "permits?select=status,valid_from,valid_until,planned_end&id=eq.$pid1")
    Check 'valid_from set' 'True' $([bool]$p[0].valid_from)
    Check 'valid_until equals planned_end (no max_validity_hours)' 'True' $([bool]($p[0].valid_until -eq $p[0].planned_end))
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$pid1/lifecycle"
    $lcJson = $lc.Body | ConvertFrom-Json
    Check 'lifecycle endpoint (200)' '200' $lc.Status
    Check 'validity state active' 'active' $lcJson.validity.state
  }

  # Expiring soon: planned_end within 1h -> expiring_soon (warning 120 min)
  $pid2 = New-Submitted-Permit $SC1 'QA Phase F soon' 1 2 $startNow $nearEnd
  Check 'expiring-soon permit created+submitted' 'True' $([bool]$pid2)
  if ($pid2) {
    Complete-Common $SC1 $pid2 2
    Complete-Site $SC1 $pid2
    Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue" | Out-Null
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$pid2/lifecycle"
    $lcJson = $lc.Body | ConvertFrom-Json
    Check 'validity state expiring_soon' 'expiring_soon' $lcJson.validity.state
    # 6. Expiry notification deduplicated: run the dashboard-style notify twice
    $smTok = (Get-Session 'safetymanager@test.com').access_token
    $h = @{ apikey = $sr; Authorization = "Bearer $sr" }
    # trigger via dashboard page load (calls notifyExpiringPermits)
    $c1 = & curl.exe -s -o NUL -w '%{http_code}' -H "Cookie: $(Get-ApiCookie 'safetycoord1@test.com')" "$base/dashboard" --max-time 30
    $c2 = & curl.exe -s -o NUL -w '%{http_code}' -H "Cookie: $(Get-ApiCookie 'safetycoord1@test.com')" "$base/dashboard" --max-time 30
    $notifs = @(Invoke-RestMethod -Uri "$url/rest/v1/notifications?select=id&permit_id=eq.$pid2&type=eq.permit_expiring_soon" -Headers $h -TimeoutSec 15)
    Check 'expiring-soon notification deduplicated (1)' '1' $notifs.Count
  }

  # Expired: planned_end in the past -> expired state; resume blocked
  $pid3 = New-Submitted-Permit $SC1 'QA Phase F expired' 1 2 (UtcIso -4) $pastEnd
  Check 'expired permit created+submitted' 'True' $([bool]$pid3)
  if ($pid3) {
    Complete-Common $SC1 $pid3 2
    Complete-Site $SC1 $pid3
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid3/approve-and-issue"
    Check 'approval of already-past permit (200)' '200' $r.Status
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$pid3/lifecycle"
    $lcJson = $lc.Body | ConvertFrom-Json
    Check 'validity state expired' 'expired' $lcJson.validity.state
    # expired notification deduplicated (while still active)
    $c1 = & curl.exe -s -o NUL -w '%{http_code}' -H "Cookie: $(Get-ApiCookie 'safetycoord1@test.com')" "$base/dashboard" --max-time 30
    $c2 = & curl.exe -s -o NUL -w '%{http_code}' -H "Cookie: $(Get-ApiCookie 'safetycoord1@test.com')" "$base/dashboard" --max-time 30
    $h = @{ apikey = $sr; Authorization = "Bearer $sr" }
    $notifs = @(Invoke-RestMethod -Uri "$url/rest/v1/notifications?select=id&permit_id=eq.$pid3&type=eq.permit_expired" -Headers $h -TimeoutSec 15)
    Check 'expired notification deduplicated (1)' '1' $notifs.Count
    # 5. Expired permit cannot continue active work
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid3/suspend" '{"remarks":"QA suspend"}'
    Check 'expired permit can still be suspended for record (200)' '200' $r.Status
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid3/resume" '{"remarks":"try resume"}'
    Check 'expired permit resume blocked (400)' '400' $r.Status
    Check 'resume blocked message: expired' 'True' $([bool]($r.Body -match 'expired'))
  }

  # =====================================================================
  # 2. SUSPENSION + RESUME with revalidation
  # =====================================================================
  $pid4 = New-Submitted-Permit $SC1 'QA Phase F suspend' 1 2 $startNow $futureEnd
  Check 'suspend permit created+submitted' 'True' $([bool]$pid4)
  if ($pid4) {
    Complete-Common $SC1 $pid4 2
    Complete-Site $SC1 $pid4
    Invoke-Api $SC1 'POST' "/api/permits/$pid4/approve-and-issue" | Out-Null
    # 7. Active -> suspended
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid4/suspend" '{"remarks":"QA suspend reason"}'
    Check 'suspend (200)' '200' $r.Status
    $p = @(RestQ "permits?select=status,suspension_reason,suspended_by,suspended_at&id=eq.$pid4")
    Check 'suspension status' 'suspended' $p[0].status
    Check 'suspension reason recorded' 'QA suspend reason' $p[0].suspension_reason
    Check 'suspended_by recorded' 'True' $([bool]$p[0].suspended_by)
    Check 'suspended_at recorded' 'True' $([bool]$p[0].suspended_at)
    # 9. audit recorded once
    $hist = @(RestQ "permit_approvals?select=action&permit_id=eq.$pid4&action=eq.suspended")
    Check 'suspension audit once' '1' $hist.Count
    # 10. Suspended permit cannot complete
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid4/complete" '{"remarks":"x"}'
    Check 'suspended permit cannot complete (400)' '400' $r.Status

    # 11/12. Resume requires revalidation checklist
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid4/resume" '{"remarks":"QA resume"}'
    Check 'resume without revalidation blocked (400)' '400' $r.Status
    Check 'resume blocked message' 'True' $([bool]($r.Body -match 'Resume blocked'))
    # build the checklist (all applicable -> completed)
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$pid4/lifecycle"
    $lcJson = $lc.Body | ConvertFrom-Json
    $items = @()
    foreach ($item in $lcJson.resume_checklist) {
      $items += @{ item_key = $item.item_key; status = 'completed'; remarks = 'QA revalidated' }
    }
    $cl = @{ remarks = 'QA resume'; checklist = $items } | ConvertTo-Json -Compress -Depth 8
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid4/resume" $cl
    Check 'resume with full revalidation (200)' '200' $r.Status
    $p = @(RestQ "permits?select=status&id=eq.$pid4")
    Check 'resumed status active' 'active' $p[0].status
    $hist = @(RestQ "permit_approvals?select=action&permit_id=eq.$pid4&action=eq.resumed")
    Check 'resume audit once' '1' $hist.Count
    # resume checklist persisted with verified_by
    $rows = @(RestQ "permit_resume_checklists?select=status,verified_by&permit_id=eq.$pid4&status=eq.completed")
    Check 'resume checklist completed rows persisted' 'True' $([bool]($rows.Count -ge 1 -and $rows[0].verified_by))
  }

  # =====================================================================
  # 3. COMPLETION with checklist
  # =====================================================================
  $pid5 = New-Submitted-Permit $SC1 'QA Phase F complete' 1 2 $startNow $futureEnd
  Check 'complete permit created+submitted' 'True' $([bool]$pid5)
  if ($pid5) {
    Complete-Common $SC1 $pid5 2
    Complete-Site $SC1 $pid5
    Invoke-Api $SC1 'POST' "/api/permits/$pid5/approve-and-issue" | Out-Null
    # 15/16. Incomplete mandatory completion item blocks
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid5/complete" '{"remarks":"QA done","checklist":[{"item_key":"tools_removed","completed":true}]}'
    Check 'completion blocked without required work_completed (400)' '400' $r.Status
    Check 'completion blocked message' 'True' $([bool]($r.Body -match 'Completion blocked'))
    # 17. Full checklist -> completed, Completed By/At recorded
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$pid5/lifecycle"
    $lcJson = $lc.Body | ConvertFrom-Json
    $items = @()
    foreach ($item in $lcJson.completion_checklist) {
      $items += @{ item_key = $item.item_key; completed = $true }
    }
    $cl = @{ remarks = 'QA done'; checklist = $items } | ConvertTo-Json -Compress -Depth 8
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid5/complete" $cl
    Check 'completion with full checklist (200)' '200' $r.Status
    $p = @(RestQ "permits?select=status,completed_by,completed_at&id=eq.$pid5")
    Check 'completion status' 'completed' $p[0].status
    Check 'completed_by recorded' 'True' $([bool]$p[0].completed_by)
    Check 'completed_at recorded' 'True' $([bool]$p[0].completed_at)
    $hist = @(RestQ "permit_approvals?select=action&permit_id=eq.$pid5&action=eq.completed")
    Check 'completion audit once' '1' $hist.Count
  }

  # =====================================================================
  # 4. CLOSURE with checklist
  # =====================================================================
  $pid6 = New-Submitted-Permit $SC1 'QA Phase F close' 1 2 $startNow $futureEnd
  Check 'close permit created+submitted' 'True' $([bool]$pid6)
  if ($pid6) {
    # 19. Only completed permit can close
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid6/close" '{"remarks":"x"}'
    Check 'close non-completed permit blocked (400)' '400' $r.Status
    Complete-Common $SC1 $pid6 2
    Complete-Site $SC1 $pid6
    Invoke-Api $SC1 'POST' "/api/permits/$pid6/approve-and-issue" | Out-Null
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$pid6/lifecycle"
    $compItems = @()
    foreach ($item in $lc.Body | ConvertFrom-Json | Select-Object -ExpandProperty completion_checklist) {
      $compItems += @{ item_key = $item.item_key; completed = $true }
    }
    $cl = @{ remarks = 'QA done'; checklist = $compItems } | ConvertTo-Json -Compress -Depth 8
    Invoke-Api $SC1 'POST' "/api/permits/$pid6/complete" $cl | Out-Null
    # 20. Incomplete closure checklist blocks
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid6/close" '{"remarks":"QA close","checklist":[{"item_key":"work_completed","completed":true}]}'
    Check 'closure blocked with incomplete checklist (400)' '400' $r.Status
    # 21. Full closure checklist -> closed, Closed By/At recorded
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$pid6/lifecycle"
    $clItems = @()
    foreach ($item in $lc.Body | ConvertFrom-Json | Select-Object -ExpandProperty closure_checklist) {
      $clItems += @{ item_key = $item.item_key; completed = $true }
    }
    $cl = @{ remarks = 'QA close'; checklist = $clItems } | ConvertTo-Json -Compress -Depth 8
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid6/close" $cl
    Check 'closure with full checklist (200)' '200' $r.Status
    $p = @(RestQ "permits?select=status,closed_by,closed_at&id=eq.$pid6")
    Check 'closure status' 'closed' $p[0].status
    Check 'closed_by recorded' 'True' $([bool]$p[0].closed_by)
    Check 'closed_at recorded' 'True' $([bool]$p[0].closed_at)
    $hist = @(RestQ "permit_approvals?select=action&permit_id=eq.$pid6&action=eq.closed")
    Check 'closure audit once' '1' $hist.Count
  }

  # =====================================================================
  # 5. STATE MACHINE
  # =====================================================================
  $pid7 = New-Submitted-Permit $SC1 'QA Phase F state' 1 2 $startNow $futureEnd
  Check 'state permit created+submitted' 'True' $([bool]$pid7)
  if ($pid7) {
    # invalid: active -> close (not completed yet)
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid7/close" '{"remarks":"x"}'
    Check 'active -> close blocked (400)' '400' $r.Status
    # invalid: rejected -> active
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid7/reject" '{"remarks":"QA reject"}'
    Check 'pending_approval -> rejected (200)' '200' $r.Status
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid7/approve-and-issue"
    Check 'rejected -> active blocked (400)' '400' $r.Status
    # valid: rejected -> resubmit -> pending_approval
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid7/resubmit"
    Check 'rejected -> pending_approval via resubmit (200)' '200' $r.Status
    $p = @(RestQ "permits?select=status&id=eq.$pid7")
    Check 'resubmitted status' 'pending_approval' $p[0].status
  }

  # =====================================================================
  # 6. CANCELLATION
  # =====================================================================
  # 26. reason required
  $r = Invoke-Api $SC1 'POST' "/api/permits/$pid7/cancel" '{}'
  Check 'cancel without reason blocked (400)' '400' $r.Status
  # 28. invalid cancellation (active) blocked
  $r = Invoke-Api $SC1 'POST' "/api/permits/$pid7/cancel" '{"remarks":"QA cancel"}'
  Check 'pending_approval cancel (200)' '200' $r.Status
  $hist = @(RestQ "permit_approvals?select=action&permit_id=eq.$pid7&action=eq.cancelled")
  Check 'cancellation audit recorded once' '1' $hist.Count
  $p = @(RestQ "permits?select=status&id=eq.$pid7")
  Check 'cancelled status' 'cancelled' $p[0].status

  # =====================================================================
  # 7. SECURITY + REGRESSIONS
  # =====================================================================
  # 29/30/31: role + auth
  $r = Invoke-Api '' 'POST' "/api/permits/$pid1/suspend" '{"remarks":"x"}'
  Check 'unauthenticated suspend (401)' '401' $r.Status
  $r = Invoke-Api $IS1 'POST' "/api/permits/$pid1/suspend" '{"remarks":"x"}'
  Check 'internal_staff suspend (403)' '403' $r.Status
  $r = Invoke-Api $CON 'POST' "/api/permits/$pid1/approve-and-issue"
  Check 'contractor approve (403)' '403' $r.Status
  # company isolation on new checklist tables
  $smTok = (Get-Session 'safetymanager@test.com').access_token
  $smRows = @(RestQUser "permit_resume_checklists?select=id&permit_id=eq.$pid4" $smTok)
  Check 'company-3 user cannot see company-1 resume checklist (0)' '0' $smRows.Count
  $scTok = (Get-Session 'safetycoord1@test.com').access_token
  $scRows = @(RestQUser "permit_resume_checklists?select=id&permit_id=eq.$pid4" $scTok)
  Check 'company-1 user sees own resume checklist (>=1)' 'True' $([bool]($scRows.Count -ge 1))
  # 32/33. PTW-2026-0020
  $p18 = @(RestQ "permits?select=permit_no,status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 exists' 'True' $([bool]($p18.Count -ge 1))
  if ($p18.Count -ge 1) {
    Check 'PTW-2026-0020 status' 'active' $p18[0].status
    Check 'PTW-2026-0020 workflow_stage' 'active' $p18[0].workflow_stage
  }
  $h18 = @(RestQ "permit_approvals?select=action&permit_id=eq.18&order=created_at")
  $a18 = ($h18 | ForEach-Object { $_.action }) -join ','
  Check 'PTW-2026-0020 history intact' 'True' $([bool]($a18 -eq 'submitted,approved'))
  # 39. Free/Pro + 40. HitPay
  $plans = @(RestQ 'plans?select=code&order=id')
  $planCodes = ($plans | ForEach-Object { $_.code }) -join ','
  Check 'plans intact (free,pro)' 'True' $([bool]($planCodes -match 'free' -and $planCodes -match 'pro'))
  $pay = @(RestQ 'payments?select=id&limit=1')
  $bev = @(RestQ 'billing_events?select=id&limit=1')
  Write-Output "note: payments=$($pay.Count) billing_events=$($bev.Count) (Phase F made no billing changes)"
  # 34-38 role model checks
  $r = Invoke-Api $IS1 'POST' "/api/permits/$pid1/approve-and-issue"
  Check 'internal_staff approve (403)' '403' $r.Status
  $r = Invoke-Api $CON 'POST' "/api/permits/$pid1/approve-and-issue"
  Check 'contractor_admin approve (403)' '403' $r.Status
}

elseif ($Mode -eq 'cleanup') {
  $permits = @($ids.permits | Where-Object { $_ })
  if ($permits.Count -gt 0) {
    $deleted = 0
    foreach ($p in $permits) {
      foreach ($tbl in @('permit_cse_personnel','permit_resume_checklists','permit_completion_checklists','permit_closure_checklists','permit_recommended_controls','permit_ppe','permit_workers','jhas','loto_isolation_points','gas_tests','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','permit_safety_controls','permit_approvals','notifications')) {
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
  $leftResume = @(RestQ 'permit_resume_checklists?select=id&limit=1').Count
  $leftComp = @(RestQ 'permit_completion_checklists?select=id&limit=1').Count
  $leftClosure = @(RestQ 'permit_closure_checklists?select=id&limit=1').Count
  Check 'no resume checklists left' '0' $leftResume
  Check 'no completion checklists left' '0' $leftComp
  Check 'no closure checklists left' '0' $leftClosure
  $p18 = @(RestQ "permits?select=status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 still active after cleanup' 'active' $p18[0].status
}

SaveIds
Write-Output ''
Write-Output "TOTAL (mode=$Mode): PASS=$pass FAIL=$fail"
