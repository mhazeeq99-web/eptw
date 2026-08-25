# ePTW Phase E tests — Specialised Permit Requirements (HOT/CSE/WAH/ELEC)
# Requires: production build on :3457, QA_PASSWORD env
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-phaseE-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-phaseE-ids.json'
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

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SC1 = Get-ApiCookie 'safetycoord1@test.com'
$SM3 = Get-ApiCookie 'safetymanager@test.com'
$IS1 = Get-ApiCookie 'supervisor@company.com'
$CON = Get-ApiCookie 'contractor@test.com'
$isTok = (Get-Session 'supervisor@company.com').access_token
$smTok = (Get-Session 'safetymanager@test.com').access_token
$scTok = (Get-Session 'safetycoord1@test.com').access_token

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
  # 1. HOT WORK — fields persist + fire-watch/combustible/spark work
  # =====================================================================
  $hotBody = @{ company_id = 1; permit_type_id = 1; work_title = 'QA Phase E hot'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-12-01T08:00:00'; planned_end = '2026-12-01T17:00:00'; special_details = @{ hot_work_type = @('Welding'); hot_work_area = 'Tank farm'; combustibles_present = $true; combustible_materials = 'Oil residue'; nearby_openings_drains = $false; spark_containment_required = $true; fire_watch_required = $true; fire_watch_person = 'Ali'; fire_extinguisher_available = $true; area_preparation = @('Combustible materials removed','Area inspected') } } | ConvertTo-Json -Compress -Depth 8
  $r = Invoke-Api $SC1 'POST' '/api/permits' $hotBody
  $hotPid = 0
  if ($r.Status -eq 201) { try { $hotPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $hotPid
  Check 'HOT permit created with specialised fields (201)' '201' $r.Status
  if ($hotPid) {
    $p = @(RestQ "permits?select=special_details&id=eq.$hotPid")
    $sd = $p[0].special_details
    Check 'HOT hot_work_type persisted' 'True' $([bool](($sd.hot_work_type -join ',') -match 'Welding'))
    Check 'HOT hot_work_area persisted' 'Tank farm' $sd.hot_work_area
    Check 'HOT fire_watch_required persisted' 'True' "$($sd.fire_watch_required)"
    Check 'HOT fire_watch_person persisted' 'Ali' $sd.fire_watch_person
    Check 'HOT spark_containment_required persisted' 'True' "$($sd.spark_containment_required)"
    Check 'HOT area_preparation persisted' 'True' $([bool](($sd.area_preparation -join ',') -match 'Area inspected'))
    # readiness blocks without specialised details being complete? They ARE complete; common gates still apply
    Invoke-Api $SC1 'POST' "/api/permits/$hotPid/submit" | Out-Null
    Complete-Common $SC1 $hotPid 1
    Complete-Site $SC1 $hotPid
    $r = Invoke-Api $SC1 'POST' "/api/permits/$hotPid/approve-and-issue"
    Check 'HOT approval with completed details + gates (200)' '200' $r.Status
  }

  # HOT: incomplete specialised details -> blocked
  $hotBody2 = @{ company_id = 1; permit_type_id = 1; work_title = 'QA Phase E hot2'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-12-02T08:00:00'; planned_end = '2026-12-02T17:00:00' } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $SC1 'POST' '/api/permits' $hotBody2
  $hot2Pid = 0
  if ($r.Status -eq 201) { try { $hot2Pid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $hot2Pid
  if ($hot2Pid) {
    Invoke-Api $SC1 'POST' "/api/permits/$hot2Pid/submit" | Out-Null
    Complete-Common $SC1 $hot2Pid 1
    Complete-Site $SC1 $hot2Pid
    $r = Invoke-Api $SC1 'POST' "/api/permits/$hot2Pid/approve-and-issue"
    Check 'HOT approval blocked without specialised details (400)' '400' $r.Status
    Check 'block message: Hot Work details not completed' 'True' $([bool]($r.Body -match 'Hot Work details have not been completed'))
  }

  # =====================================================================
  # 2. CSE — details + personnel + validation + readiness
  # =====================================================================
  # Create CSE with 3 workers + details
  $cseBody = @{ company_id = 1; permit_type_id = 3; work_title = 'QA Phase E cse'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-12-03T08:00:00'; planned_end = '2026-12-03T17:00:00'; workers = @(@{ full_name = 'Sup One'; id_number = 'S-01' }, @{ full_name = 'Standby Two'; id_number = 'S-02' }, @{ full_name = 'Entrant Three'; id_number = 'S-03' }); special_details = @{ confined_space_name = 'Tank T-101'; confined_space_id = 'T-101'; entry_purpose = 'Inspection'; entry_point = 'Top manhole'; access_egress_method = 'Fixed ladder'; entry_depth = '3 m'; ventilation_method = 'Forced air'; continuous_ventilation = 'Yes' }; cse_personnel = @(@{ worker_index = 0; responsibility = 'entry_supervisor' }, @{ worker_index = 1; responsibility = 'standby_attendant' }, @{ worker_index = 2; responsibility = 'authorised_entrant' }) } | ConvertTo-Json -Compress -Depth 10
  $r = Invoke-Api $SC1 'POST' '/api/permits' $cseBody
  $csePid = 0
  if ($r.Status -eq 201) { try { $csePid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $csePid
  Check 'CSE permit created with details + personnel (201)' '201' $r.Status
  if ($csePid) {
    $p = @(RestQ "permits?select=special_details&id=eq.$csePid")
    $sd = $p[0].special_details
    Check 'CSE confined_space_name persisted' 'Tank T-101' $sd.confined_space_name
    Check 'CSE ventilation_method persisted' 'Forced air' $sd.ventilation_method
    $personnel = @(RestQ "permit_cse_personnel?select=worker_id,responsibility&permit_id=eq.$csePid&order=id")
    Check 'CSE personnel persisted (3)' '3' $personnel.Count
    $resp = ($personnel | ForEach-Object { $_.responsibility }) -join ','
    Check 'CSE responsibilities stored' 'True' $([bool]($resp -match 'entry_supervisor' -and $resp -match 'standby_attendant' -and $resp -match 'authorised_entrant'))

    # invalid worker reference -> rejected (worker not on permit)
    $badAssign = '{"assignments":[{"worker_id":999999,"responsibility":"entry_supervisor"}]}'
    $r = Invoke-Api $SC1 'PATCH' "/api/permits/$csePid/cse-personnel" $badAssign
    Check 'CSE invalid worker reference rejected (400)' '400' $r.Status

    # duplicate responsibility per worker -> rejected
    $dupAssign = '{"assignments":[{"worker_id":1,"responsibility":"entry_supervisor"},{"worker_id":1,"responsibility":"entry_supervisor"}]}'
    $r = Invoke-Api $SC1 'PATCH' "/api/permits/$csePid/cse-personnel" $dupAssign
    Check 'CSE duplicate assignment rejected (400)' '400' $r.Status

    # separation of duty (company policy default on) -> supervisor cannot also be standby
    $sepAssign = '{"assignments":[{"worker_id":1,"responsibility":"entry_supervisor"},{"worker_id":1,"responsibility":"standby_attendant"}]}'
    $r = Invoke-Api $SC1 'PATCH' "/api/permits/$csePid/cse-personnel" $sepAssign
    Check 'CSE separation of duties rejected (400)' '400' $r.Status

    # approval blocked when personnel not assigned (wipe first)
    $wipe = '{"assignments":[]}'
    Invoke-Api $SC1 'PATCH' "/api/permits/$csePid/cse-personnel" $wipe | Out-Null
    Invoke-Api $SC1 'POST' "/api/permits/$csePid/submit" | Out-Null
    Complete-Common $SC1 $csePid 3
    Complete-Site $SC1 $csePid
    $r = Invoke-Api $SC1 'POST' "/api/permits/$csePid/approve-and-issue"
    Check 'CSE approval blocked: supervisor not assigned (400)' '400' $r.Status
    Check 'block message: Entry Supervisor not assigned' 'True' $([bool]($r.Body -match 'Confined Space Entry Supervisor has not been assigned'))
    # readiness shows missing specialised requirements
    $rd = Invoke-Api $SC1 'GET' "/api/permits/$csePid/readiness"
    $rdJson = $rd.Body | ConvertFrom-Json
    Check 'CSE readiness ready=false without personnel' 'False' $rdJson.ready
    Check 'CSE readiness lists cse items' 'True' $([bool](@($rdJson.items | Where-Object { $_.key -like 'cse_*' }).Count -ge 3))
    # restore personnel via worker ids
    $w = @(RestQ "permit_workers?select=id&permit_id=eq.$csePid&order=id")
    $restore = @{ assignments = @(@{ worker_id = [int]$w[0].id; responsibility = 'entry_supervisor' }, @{ worker_id = [int]$w[1].id; responsibility = 'standby_attendant' }, @{ worker_id = [int]$w[2].id; responsibility = 'authorised_entrant' }) } | ConvertTo-Json -Compress -Depth 8
    $r = Invoke-Api $SC1 'PATCH' "/api/permits/$csePid/cse-personnel" $restore
    Check 'CSE personnel restored (200)' '200' $r.Status
    $r = Invoke-Api $SC1 'POST' "/api/permits/$csePid/approve-and-issue"
    Check 'CSE approval passes with personnel + gates (200)' '200' $r.Status
  }

  # =====================================================================
  # 3. WAH — fields persist + readiness
  # =====================================================================
  $wahBody = @{ company_id = 1; permit_type_id = 5; work_title = 'QA Phase E wah'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-12-04T08:00:00'; planned_end = '2026-12-04T17:00:00'; special_details = @{ work_height = '6 m'; work_location = 'Warehouse roof'; access_method = @('Scaffold','Ladder'); work_position = 'Standing on platform'; falling_object_risk = $true; dropped_object_controls = 'Tool lanyards'; rescue_arrangement_required = $true } } | ConvertTo-Json -Compress -Depth 8
  $r = Invoke-Api $SC1 'POST' '/api/permits' $wahBody
  $wahPid = 0
  if ($r.Status -eq 201) { try { $wahPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $wahPid
  Check 'WAH permit created with specialised fields (201)' '201' $r.Status
  if ($wahPid) {
    $sd = @(RestQ "permits?select=special_details&id=eq.$wahPid")[0].special_details
    Check 'WAH work_height persisted' '6 m' $sd.work_height
    Check 'WAH access_method persisted' 'True' $([bool](($sd.access_method -join ',') -match 'Scaffold'))
    Check 'WAH rescue_arrangement_required persisted' 'True' "$($sd.rescue_arrangement_required)"
    Invoke-Api $SC1 'POST' "/api/permits/$wahPid/submit" | Out-Null
    Complete-Common $SC1 $wahPid 5
    Complete-Site $SC1 $wahPid
    $r = Invoke-Api $SC1 'POST' "/api/permits/$wahPid/approve-and-issue"
    Check 'WAH approval with completed details + gates (200)' '200' $r.Status
  }

  # =====================================================================
  # 4. ELEC — fields persist + LOTO/PPE integration + readiness
  # =====================================================================
  $elecBody = @{ company_id = 1; permit_type_id = 4; work_title = 'QA Phase E elec'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-12-05T08:00:00'; planned_end = '2026-12-05T17:00:00'; special_details = @{ equipment_circuit = 'MCC-2 feeder'; equipment_id = 'MCC-2-F3'; voltage = '415 V'; work_type = @('Maintenance','Testing'); electrical_isolation_required = $true; test_verification_completed = 'Yes' } } | ConvertTo-Json -Compress -Depth 8
  $r = Invoke-Api $SC1 'POST' '/api/permits' $elecBody
  $elecPid = 0
  if ($r.Status -eq 201) { try { $elecPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $elecPid
  Check 'ELEC permit created with specialised fields (201)' '201' $r.Status
  if ($elecPid) {
    $sd = @(RestQ "permits?select=special_details&id=eq.$elecPid")[0].special_details
    Check 'ELEC equipment_circuit persisted' 'MCC-2 feeder' $sd.equipment_circuit
    Check 'ELEC voltage persisted' '415 V' $sd.voltage
    Check 'ELEC test_verification_completed persisted' 'Yes' $sd.test_verification_completed
    Invoke-Api $SC1 'POST' "/api/permits/$elecPid/submit" | Out-Null
    Complete-Common $SC1 $elecPid 4
    Complete-Site $SC1 $elecPid
    $r = Invoke-Api $SC1 'POST' "/api/permits/$elecPid/approve-and-issue"
    Check 'ELEC approval with completed details + gates (200)' '200' $r.Status
  }

  # =====================================================================
  # 5. DYNAMIC / SECURITY / APPROVAL
  # =====================================================================
  # COLD: no specialised section, irrelevant fields not submitted -> fields dropped
  $coldBody = @{ company_id = 1; permit_type_id = 2; work_title = 'QA Phase E cold'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-12-06T08:00:00'; planned_end = '2026-12-06T17:00:00'; special_details = @{ hot_work_type = @('Welding'); confined_space_name = 'X' } } | ConvertTo-Json -Compress -Depth 8
  $r = Invoke-Api $SC1 'POST' '/api/permits' $coldBody
  $coldPid = 0
  if ($r.Status -eq 201) { try { $coldPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $coldPid
  Check 'COLD permit created (201)' '201' $r.Status
  if ($coldPid) {
    $sd = @(RestQ "permits?select=special_details&id=eq.$coldPid")[0].special_details
    Check 'COLD irrelevant specialised fields dropped' 'True' $([bool](-not $sd.PSObject.Properties['hot_work_type'] -and -not $sd.PSObject.Properties['confined_space_name']))
    Invoke-Api $SC1 'POST' "/api/permits/$coldPid/submit" | Out-Null
    Complete-Common $SC1 $coldPid 2
    Complete-Site $SC1 $coldPid
    $r = Invoke-Api $SC1 'POST' "/api/permits/$coldPid/approve-and-issue"
    Check 'COLD approval unaffected by specialised layer (200)' '200' $r.Status
  }

  # Company isolation: company-3 user cannot see company-1 CSE personnel
  if ($csePid) {
    $isRows = @(RestQUser "permit_cse_personnel?select=id&permit_id=eq.$csePid" $smTok)
    Check 'company-3 user cannot see company-1 CSE personnel (0)' '0' $isRows.Count
    $scRows = @(RestQUser "permit_cse_personnel?select=id&permit_id=eq.$csePid" $scTok)
    Check 'company-1 user sees own CSE personnel (3)' '3' $scRows.Count
  }
  # Contractor isolation: contractor cannot PATCH company-1 CSE personnel
  # (403 role/access denial or 404 RLS-hide are both correct isolation).
  if ($csePid) {
    $r = Invoke-Api $CON 'PATCH' "/api/permits/$csePid/cse-personnel" '{"assignments":[]}'
    Check 'contractor cannot modify company-1 CSE personnel (403/404)' 'True' $([bool]($r.Status -in @(403, 404)))
  }

  # Direct API cannot bypass specialised readiness (HOT without details, done above; also CSE personnel)
  if ($csePid) {
    $r = Invoke-Api $IS1 'POST' "/api/permits/$csePid/approve-and-issue"
    Check 'internal_staff approve CSE (403)' '403' $r.Status
  }

  # =====================================================================
  # 6. REGRESSIONS
  # =====================================================================
  $p18 = @(RestQ "permits?select=permit_no,status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 still exists' 'True' $([bool]($p18.Count -ge 1))
  if ($p18.Count -ge 1) {
    Check 'PTW-2026-0020 status' 'active' $p18[0].status
    Check 'PTW-2026-0020 workflow_stage' 'active' $p18[0].workflow_stage
  }
  $h18 = @(RestQ "permit_approvals?select=action&permit_id=eq.18&order=created_at")
  $a18 = ($h18 | ForEach-Object { $_.action }) -join ','
  Check 'PTW-2026-0020 history submitted->approved' 'True' $([bool]($a18 -eq 'submitted,approved'))
  $plans = @(RestQ 'plans?select=code&order=id')
  $planCodes = ($plans | ForEach-Object { $_.code }) -join ','
  Check 'plans intact (free,pro)' 'True' $([bool]($planCodes -match 'free' -and $planCodes -match 'pro'))
  $pay = @(RestQ 'payments?select=id&limit=1')
  $bev = @(RestQ 'billing_events?select=id&limit=1')
  Write-Output "note: payments=$($pay.Count) billing_events=$($bev.Count) (Phase E made no billing changes)"
  $subs = @(RestQ 'company_subscriptions?select=id&limit=1')
  Write-Output "note: company_subscriptions=$($subs.Count) (Phase E made no entitlement changes)"
}

elseif ($Mode -eq 'cleanup') {
  $permits = @($ids.permits | Where-Object { $_ })
  if ($permits.Count -gt 0) {
    $deleted = 0
    foreach ($p in $permits) {
      foreach ($tbl in @('permit_cse_personnel','permit_recommended_controls','permit_ppe','permit_workers','jhas','loto_isolation_points','gas_tests','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','permit_safety_controls','permit_approvals','notifications')) {
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
  $leftCse = @(RestQ 'permit_cse_personnel?select=id&limit=1').Count
  $leftSite = @(RestQ 'permit_site_verifications?select=id&limit=1').Count
  $leftHaz = @(RestQ 'jha_hazards?select=id&limit=1').Count
  $leftRead = @(RestQ 'gas_test_readings?select=id&limit=1').Count
  Check 'no CSE personnel left' '0' $leftCse
  Check 'no site verifications left' '0' $leftSite
  Check 'no jha_hazards left' '0' $leftHaz
  Check 'no gas_test_readings left' '0' $leftRead
  $p18 = @(RestQ "permits?select=status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 still active after cleanup' 'active' $p18[0].status
}

SaveIds
Write-Output ''
Write-Output "TOTAL (mode=$Mode): PASS=$pass FAIL=$fail"
