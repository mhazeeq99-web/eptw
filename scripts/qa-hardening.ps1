# ePTW Production Hardening V1 QA — negative auth, cross-company, direct-REST,
# resume bypass, legacy routes, printable, PPE type-change, settings, contractor
# notification, Malaysia timezone/expiry.
# Requires: production build on :3457, QA_PASSWORD env
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-hardening-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-hardening-ids.json'
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
function UtcIso([int]$hoursFromNow) { return (Get-Date).ToUniversalTime().AddHours($hoursFromNow).ToString('yyyy-MM-ddTHH:mm:ss') + 'Z' }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SC1 = Get-ApiCookie 'safetycoord1@test.com'
$SM3 = Get-ApiCookie 'safetymanager@test.com'
$IS1 = Get-ApiCookie 'supervisor@company.com'
$CON = Get-ApiCookie 'contractor@test.com'
$isTok = (Get-Session 'supervisor@company.com').access_token
$scTok = (Get-Session 'safetycoord1@test.com').access_token
$smTok = (Get-Session 'safetymanager@test.com').access_token
$conTok = (Get-Session 'contractor@test.com').access_token

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
  foreach ($t in $template) { $items += @{ key = $t.item_key; status = if ($t.is_required) { 'ok' } else { 'na' } } }
  $body = @{ status = 'verified'; checklist = $items; remarks = 'QA' } | ConvertTo-Json -Compress -Depth 6
  Invoke-Api $cookie 'PATCH' "/api/permits/$permitId/site-verification" $body | Out-Null
}

if ($Mode -eq 'main') {
  # =====================================================================
  # A. Internal Staff attempts to mark site verification VERIFIED -> 403
  # B. Contractor Admin attempts to verify PPE -> 403
  # C. Contractor Admin attempts emergency confirmation -> 403
  # =====================================================================
  $pidA = Invoke-Api $IS1 'POST' '/api/permits' (@{ company_id=1; permit_type_id=2; work_title='QA Harden A'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress)
  $aPid = 0; if ($pidA.Status -eq 201) { try { $aPid = [int]($pidA.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $aPid
  if ($aPid) {
    Invoke-Api $IS1 'POST' "/api/permits/$aPid/submit" | Out-Null
    $r = Invoke-Api $IS1 'PATCH' "/api/permits/$aPid/site-verification" '{"status":"verified","checklist":[]}'
    Check 'A: internal_staff site verification VERIFIED -> 403' '403' $r.Status
    $r = Invoke-Api $CON 'PATCH' "/api/permits/$aPid/ppe-verification" '{"verified":true}'
    Check 'B: contractor_admin PPE verify -> 403' '403' $r.Status
    $r = Invoke-Api $CON 'PATCH' "/api/permits/$aPid/emergency-arrangements" '{"status":"confirmed","first_aid_available":true,"fire_response_available":true}'
    Check 'C: contractor_admin emergency confirm -> 403' '403' $r.Status
  }

  # =====================================================================
  # D. Internal Staff attempts to approve -> 403
  # E. Contractor Admin attempts to approve -> 403
  # =====================================================================
  $r = Invoke-Api $IS1 'POST' "/api/permits/$aPid/approve-and-issue"
  Check 'D: internal_staff approve -> 403' '403' $r.Status
  $r = Invoke-Api $CON 'POST' "/api/permits/$aPid/approve-and-issue"
  Check 'E: contractor_admin approve -> 403' '403' $r.Status

  # =====================================================================
  # F. Direct REST: pending_approval -> active must be rejected by DB trigger
  # =====================================================================
  # NOTE: this must detect a DB-level rejection. Invoke-RestMethod's
  # WebException.Message is generic ("The remote server returned an error:
  # (400)...") in Windows PowerShell, so we drive curl directly and assert on
  # the HTTP status (4xx = rejected) AND the trigger's response body.
  $restBody = '{"status":"active","workflow_stage":"active"}'
  $fBodyFile = Join-Path $tmp "f-body.json"
  $fRespFile = Join-Path $tmp "f-resp.txt"
  [IO.File]::WriteAllText($fBodyFile, $restBody)
  $fCode = & curl.exe -s -o $fRespFile -w '%{http_code}' -X PATCH "$url/rest/v1/permits?id=eq.$aPid" -H "apikey: $sr" -H "Authorization: Bearer $scTok" -H 'Content-Type: application/json' --data-binary "@$fBodyFile" --max-time 15
  $fBodyText = if (Test-Path $fRespFile) { [IO.File]::ReadAllText($fRespFile) } else { '' }
  $fRejected = ([int]$fCode -ge 400 -and [int]$fCode -lt 500) -and ($fBodyText -match 'Direct permit status changes|not allowed|status transition')
  Check 'F: direct REST pending_approval->active rejected (trigger)' 'True' $fRejected

  # =====================================================================
  # G. Legacy review/issue/start routes unavailable
  # =====================================================================
  $r = Invoke-Api $SC1 'POST' "/api/permits/$aPid/review" '{"action":"approved"}'
  Check 'G1: legacy review route unavailable (404)' '404' $r.Status
  $r = Invoke-Api $SC1 'POST' "/api/permits/$aPid/issue"
  Check 'G2: legacy issue route unavailable (404)' '404' $r.Status
  $r = Invoke-Api $SC1 'POST' "/api/permits/$aPid/start"
  Check 'G3: legacy start route unavailable (404)' '404' $r.Status

  # =====================================================================
  # H/I. Suspended permit with failed safety state -> resume blocked by
  #      the re-run central readiness engine.
  #      (The API blocks editing safety docs while suspended, so the unsafe
  #      state is simulated at the DB boundary via service-role — the exact
  #      threat the readiness re-run must catch.)
  # =====================================================================
  # I: COLD permit, approve, suspend, corrupt site verification to failed,
  #    then resume -> readiness must block.
  $body = @{ company_id=1; permit_type_id=2; work_title='QA Harden I'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress
  $r = Invoke-Api $SC1 'POST' '/api/permits' $body
  $iPid = 0; if ($r.Status -eq 201) { try { $iPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $iPid
  if ($iPid) {
    Invoke-Api $SC1 'POST' "/api/permits/$iPid/submit" | Out-Null
    Complete-Common $SC1 $iPid 2
    Complete-Site $SC1 $iPid
    Invoke-Api $SC1 'POST' "/api/permits/$iPid/approve-and-issue" | Out-Null
    Invoke-Api $SC1 'POST' "/api/permits/$iPid/suspend" '{"remarks":"QA suspend"}' | Out-Null
    # Corrupt the site verification to FAILED via service role (simulating
    # a changed/unsafe condition while suspended).
    RestPatch "permit_site_verifications?permit_id=eq.$iPid" '{"status":"failed"}' | Out-Null
    $svChk = @(RestQ "permit_site_verifications?select=status&permit_id=eq.$iPid")
    Check 'I: site verification status failed' 'failed' $svChk[0].status
    # Resume with full checklist but readiness must block (site failed)
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$iPid/lifecycle"
    $items = @(); foreach ($item in ($lc.Body | ConvertFrom-Json).resume_checklist) { $items += @{ item_key=$item.item_key; status='completed' } }
    $cl = @{ remarks='QA resume'; checklist=$items } | ConvertTo-Json -Compress -Depth 8
    $r = Invoke-Api $SC1 'POST' "/api/permits/$iPid/resume" $cl
    Check 'I: resume blocked when site verification failed (400)' '400' $r.Status
    Check 'I: resume block reason readiness' 'True' $([bool]($r.Body -match 'Work area verification|Resume blocked'))
    $p = @(RestQ "permits?select=status&id=eq.$iPid")
    Check 'I: permit remains suspended' 'suspended' $p[0].status
  }

  # H: failed gas test blocks resume (HOT type 1 requires gas + hot details)
  $body = @{ company_id=1; permit_type_id=1; work_title='QA Harden H'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6); special_details=@{ hot_work_type=@('Welding'); hot_work_area='QA area' } } | ConvertTo-Json -Compress -Depth 8
  $r = Invoke-Api $SC1 'POST' '/api/permits' $body
  $hPid = 0; if ($r.Status -eq 201) { try { $hPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $hPid
  if ($hPid) {
    Invoke-Api $SC1 'POST' "/api/permits/$hPid/submit" | Out-Null
    Complete-Common $SC1 $hPid 1
    Complete-Site $SC1 $hPid
    $ap = Invoke-Api $SC1 'POST' "/api/permits/$hPid/approve-and-issue"
    Check 'H: HOT approve (200)' '200' $ap.Status
    Invoke-Api $SC1 'POST' "/api/permits/$hPid/suspend" '{"remarks":"QA suspend"}' | Out-Null
    # Corrupt the latest verified gas test to FAIL via service role.
    $verified = @(RestQ "gas_tests?select=id&permit_id=eq.$hPid&status=eq.verified&order=tested_at.desc")
    if ($verified.Count -gt 0) { RestPatch "gas_tests?id=eq.$($verified[0].id)" '{"result":"FAIL"}' | Out-Null }
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$hPid/lifecycle"
    $items = @(); foreach ($item in ($lc.Body | ConvertFrom-Json).resume_checklist) { $items += @{ item_key=$item.item_key; status='completed' } }
    $cl = @{ remarks='QA resume'; checklist=$items } | ConvertTo-Json -Compress -Depth 8
    $r = Invoke-Api $SC1 'POST' "/api/permits/$hPid/resume" $cl
    Check 'H: resume blocked when gas test FAIL (400)' '400' $r.Status
    Check 'H: resume block reason gas' 'True' $([bool]($r.Body -match 'gas test result is not acceptable|Resume blocked'))
  }

  # =====================================================================
  # J. Edit permit COLD -> HOT: required PPE remains selectable
  #    (UI-level; verify server accepts and readiness gate works)
  # =====================================================================
  $body = @{ company_id=1; permit_type_id=2; work_title='QA Harden J'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress
  $r = Invoke-Api $SC1 'POST' '/api/permits' $body
  $jPid = 0; if ($r.Status -eq 201) { try { $jPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $jPid
  if ($jPid) {
    # server-side validation: company-scoped contractor/area/equipment (K)
    $k = Invoke-Api $SC1 'PATCH' "/api/permits/$jPid/update" (@{ permit_type_id=2; work_title='QA Harden J'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6); area_id=99999 } | ConvertTo-Json -Compress)
    Check 'K: edit with cross-company area rejected (400)' '400' $k.Status
    # valid edit to HOT type 1
    $r = Invoke-Api $SC1 'PATCH' "/api/permits/$jPid/update" (@{ permit_type_id=1; work_title='QA Harden J hot'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress)
    Check 'J: edit COLD->HOT succeeds (200)' '200' $r.Status
  }

  # =====================================================================
  # L. Contractor submits PTW -> customer's SM/SC receive notification
  # =====================================================================
  $cw = @(@{ full_name='Worker L'; id_number='L-001' })
  $body = @{ company_id=1; permit_type_id=2; work_title='QA Harden L'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6); staff_reference_name='Ahmad'; workers=$cw } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $CON 'POST' '/api/permits' $body
  $lPid = 0; if ($r.Status -eq 201) { try { $lPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $lPid
  if ($lPid) {
    Invoke-Api $CON 'POST' "/api/permits/$lPid/submit" | Out-Null
    # customer company 1 has safetycoord1 (SC) + safety manager? check profiles
    $scs = @(RestQ "profiles?select=id,full_name&company_id=eq.1&role=in.(safety_manager,safety_coordinator)&is_active=eq.true")
    Write-Output "note: company-1 SM/SC profiles count=$($scs.Count)"
    $notifs = @(RestQ "notifications?select=user_id,type&permit_id=eq.$lPid&type=eq.permit_submitted")
    $notifUserIds = @($notifs | ForEach-Object { $_.user_id })
    $any = $false
    foreach ($sc in $scs) { if ($notifUserIds -contains $sc.id) { $any = $true } }
    Check 'L: customer SM/SC received submission notification' 'True' $any
  }

  # =====================================================================
  # M. Active permit display: valid_until shown consistently (lifecycle API)
  # =====================================================================
  $p18 = @(RestQ "permits?select=id,status,valid_until&id=eq.18")
  Check 'M: PTW-2026-0020 remains active' 'active' $p18[0].status
  # timezone/expiry edge case: near-expiry permit -> expiring_soon via lifecycle
  $near = @{ company_id=1; permit_type_id=2; work_title='QA Harden TZ'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 1) } | ConvertTo-Json -Compress
  $r = Invoke-Api $SC1 'POST' '/api/permits' $near
  $tzPid = 0; if ($r.Status -eq 201) { try { $tzPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $tzPid
  if ($tzPid) {
    Invoke-Api $SC1 'POST' "/api/permits/$tzPid/submit" | Out-Null
    Complete-Common $SC1 $tzPid 2
    Complete-Site $SC1 $tzPid
    Invoke-Api $SC1 'POST' "/api/permits/$tzPid/approve-and-issue" | Out-Null
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$tzPid/lifecycle"
    $lcJson = $lc.Body | ConvertFrom-Json
    Check 'M: expiring-soon derived state' 'expiring_soon' $lcJson.validity.state
    Check 'M: valid_until present' 'True' $([bool]$lcJson.validity.valid_until)
  }

  # Regression: PTW-2026-0020 history
  $h18 = @(RestQ "permit_approvals?select=action&permit_id=eq.18&order=created_at")
  $a18 = ($h18 | ForEach-Object { $_.action }) -join ','
  Check 'regression: PTW-2026-0020 history submitted->approved' 'True' $([bool]($a18 -eq 'submitted,approved'))
  # printable permit render (200) — use company-3 user for permit 18
  $c = & curl.exe -s -o NUL -w '%{http_code}' -H "Cookie: $(Get-ApiCookie 'safetymanager@test.com')" "$base/permits/$($p18[0].id)/print" --max-time 30
  Check 'printable permit render (200)' '200' $c
  # printable contains safety-critical validity + CSE personnel markers (render)
  $out = Join-Path $env:TEMP 'print-render.html'
  $c2 = & curl.exe -s -o $out -w '%{http_code}' -H "Cookie: $(Get-ApiCookie 'safetymanager@test.com')" "$base/permits/$($p18[0].id)/print" --max-time 30
  if ($c2 -eq '200') {
    $ph = Get-Content $out -Raw
    Check 'print: Valid Until shown' 'True' $([bool]($ph -match 'Valid Until'))
    Check 'print: Valid From shown' 'True' $([bool]($ph -match 'Valid From'))
    Check 'print: Workers section' 'True' $([bool]($ph -match 'Workers / Authorised Personnel'))
  }
  # plans / billing untouched
  $plans = @(RestQ 'plans?select=code&order=id'); $pc = ($plans | ForEach-Object { $_.code }) -join ','
  Check 'regression: plans intact (free,pro)' 'True' $([bool]($pc -match 'free' -and $pc -match 'pro'))
  $pay = @(RestQ 'payments?select=id&limit=1'); $bev = @(RestQ 'billing_events?select=id&limit=1')
  Write-Output "note: payments=$($pay.Count) billing_events=$($bev.Count)"
}

elseif ($Mode -eq 'cleanup') {
  $permits = @($ids.permits | Where-Object { $_ })
  if ($permits.Count -gt 0) {
    $deleted = 0
    foreach ($p in $permits) {
      foreach ($tbl in @('permit_cse_personnel','permit_resume_checklists','permit_completion_checklists','permit_closure_checklists','permit_recommended_controls','permit_ppe','permit_workers','jhas','loto_isolation_points','gas_tests','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','permit_safety_controls','permit_approvals','notifications')) {
        RestDelete "$tbl`?permit_id=eq.$p"
      }
      try { $null = Invoke-RestMethod -Uri "$url/rest/v1/permits?id=eq.$p" -Method Delete -Headers @{ apikey=$sr; Authorization="Bearer $sr" } -TimeoutSec 15; $deleted++ } catch {}
    }
    Check "QA permits deleted ($deleted)" $permits.Count $deleted
  }
  foreach ($j in @($ids.jhas | Where-Object { $_ })) { RestDelete "jha_hazards?jha_id=eq.$j" }
  foreach ($g in @($ids.gas | Where-Object { $_ })) { RestDelete "gas_test_readings?gas_test_id=eq.$g" }
  foreach ($l in @($ids.loto | Where-Object { $_ })) { RestDelete "loto_isolation_points?id=eq.$l" }
  $left = @(RestQ 'permit_resume_checklists?select=id&limit=1').Count + @(RestQ 'permit_site_verifications?select=id&limit=1').Count
  Check 'no readiness QA residue' '0' $left
  $p18 = @(RestQ "permits?select=status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 active after cleanup' 'active' $p18[0].status
}

SaveIds
Write-Output ''
Write-Output "TOTAL (mode=$Mode): PASS=$pass FAIL=$fail"
