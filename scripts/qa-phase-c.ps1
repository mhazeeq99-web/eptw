# ePTW Phase C tests — structured JHA/HIRARC + LOTO energy/method + gas readings + gates
# Requires: production build on :3457, QA_PASSWORD env
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-phaseC-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-phaseC-ids.json'
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

function New-Permit([string]$cookie, [string]$title, [int]$companyId, [int]$typeId, [string]$suffix) {
  $body = @{
    company_id = $companyId; permit_type_id = $typeId; work_title = "$title $suffix"; work_description = 'QA';
    work_location = 'QA loc'; planned_start = '2026-10-01T08:00:00'; planned_end = '2026-10-01T17:00:00'
  } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $cookie 'POST' '/api/permits' $body
  $permitId = 0
  if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $ids.permits += $permitId; Invoke-Api $cookie 'POST' "/api/permits/$permitId/submit" | Out-Null }
  return $permitId
}

function Verify-RequiredControls([string]$cookie, [int]$permitId) {
  foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$permitId")) {
    if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $cookie 'PATCH' "/api/permits/$permitId/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
  }
}

if ($Mode -eq 'main') {
  # =====================================================================
  # 1. Structured JHA/HIRARC — COLD type 2 (company 1, JHA required)
  # =====================================================================
  $pid1 = New-Permit $SC1 'QA Phase C structured JHA' 1 2 'A'
  Check 'structured JHA permit created+submitted' 'True' $([bool]$pid1)
  if ($pid1) {
    Verify-RequiredControls $SC1 $pid1

    # approve before any JHA -> blocked with exact message
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid1/approve-and-issue"
    Check 'approval blocked without JHA (400)' '400' $r.Status
    Check 'block message: JHA/HIRARC not verified' 'True' $([bool]($r.Body -match 'Approval blocked: JHA/HIRARC has not been verified.'))

    # create structured JHA with 2 hazards
    $jhaBody = '{"title":"QA structured JHA","description":"QA desc","hazards":[' +
      '{"hazard":"Fire from hot work sparks","hazard_category":"Physical","consequence":"Burns / property damage","existing_controls":"Fire extinguisher on site","control_types":["Elimination","Administrative","PPE"],"likelihood":4,"severity":5,"additional_controls":"Hot work permit holder present","residual_likelihood":2,"residual_severity":2},' +
      '{"hazard":"Chemical exposure","hazard_category":"Chemical","consequence":"Inhalation hazard","existing_controls":"Local exhaust ventilation","control_types":["Engineering","PPE"],"likelihood":3,"severity":4,"additional_controls":"Respirator supplied","residual_likelihood":1,"residual_severity":2}' +
      ']}'
    $j = Invoke-Api $SC1 'POST' "/api/permits/$pid1/jha" $jhaBody
    $jhaId = 0
    if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
    $ids.jhas += $jhaId
    Check 'structured JHA create (201)' '201' $j.Status
    if ($jhaId) {
      $rows = @(RestQ "jha_hazards?select=hazard,hazard_category,likelihood,severity,risk_rating,residual_likelihood,residual_severity,residual_risk,control_types&jha_id=eq.$jhaId&order=sort_order")
      Check 'jha_hazards rows persisted (2)' '2' $rows.Count
      if ($rows.Count -ge 2) {
        Check 'hazard 1 category persisted' 'Physical' $rows[0].hazard_category
        Check 'hazard 1 risk_rating = L*S (20)' '20' $rows[0].risk_rating
        Check 'hazard 1 residual_risk (4)' '4' $rows[0].residual_risk
        Check 'hazard 2 risk_rating (12)' '12' $rows[1].risk_rating
        Check 'hazard 1 control_types stored' 'True' $([bool](($rows[0].control_types | ConvertTo-Json -Compress) -match 'Elimination'))
      }
      $st = @(RestQ "jhas?select=status&id=eq.$jhaId")
      Check 'JHA initial status' 'pending' $st[0].status

      # mark completed -> status completed
      $r = Invoke-Api $SC1 'POST' "/api/permits/$pid1/jha/$jhaId/complete"
      Check 'JHA mark completed (200)' '200' $r.Status
      $st = @(RestQ "jhas?select=status&id=eq.$jhaId")
      Check 'JHA status after complete' 'completed' $st[0].status

      # approve still blocked (completed != verified)
      $r = Invoke-Api $SC1 'POST' "/api/permits/$pid1/approve-and-issue"
      Check 'approval blocked: completed but not verified (400)' '400' $r.Status
      Check 'block message still JHA/HIRARC' 'True' $([bool]($r.Body -match 'Approval blocked: JHA/HIRARC has not been verified.'))

      # verify -> verified, then approve passes
      $r = Invoke-Api $SC1 'POST' "/api/permits/$pid1/jha/$jhaId/verify" '{"status":"verified"}'
      Check 'JHA verify (200)' '200' $r.Status
      $st = @(RestQ "jhas?select=status&id=eq.$jhaId")
      Check 'JHA status after verify' 'verified' $st[0].status
      $r = Invoke-Api $SC1 'POST' "/api/permits/$pid1/approve-and-issue"
      Check 'approval passes with verified JHA (200)' '200' $r.Status
      $pr = @(RestQ "permits?select=status,workflow_stage&id=eq.$pid1")
      Check 'permit active after approval' 'active' $pr[0].status
    }
  }

  # =====================================================================
  # 2. LOTO — CSE type 3 (company 1, JHA + LOTO + GAS required)
  # =====================================================================
  $pid2 = New-Permit $SC1 'QA Phase C loto' 1 3 'B'
  Check 'CSE permit created+submitted' 'True' $([bool]$pid2)
  if ($pid2) {
    Verify-RequiredControls $SC1 $pid2
    $j = Invoke-Api $SC1 'POST' "/api/permits/$pid2/jha" '{"title":"QA CSE JHA","hazards":[{"hazard":"Confined space atmosphere","hazard_category":"Chemical","likelihood":3,"severity":5,"residual_likelihood":2,"residual_severity":3}]}'
    $jhaId = 0; if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
    $ids.jhas += $jhaId
    if ($jhaId) {
      Invoke-Api $SC1 'POST' "/api/permits/$pid2/jha/$jhaId/complete" | Out-Null
      Invoke-Api $SC1 'POST' "/api/permits/$pid2/jha/$jhaId/verify" '{"status":"verified"}' | Out-Null
    }
    # no LOTO points yet -> blocked
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue"
    Check 'approval blocked: LOTO isolation points required (400)' '400' $r.Status
    Check 'block message: requires LOTO isolation points' 'True' $([bool]($r.Body -match 'Approval blocked: this permit type requires LOTO isolation points.'))

    # add 2 LOTO points with energy_type / isolation_method / remarks
    $l1 = Invoke-Api $SC1 'POST' "/api/permits/$pid2/loto" '{"description":"Isolate pump P-101","tag_number":"LOTO-001","isolation_point":"Pump suction valve","lock_number":"LK-101","energy_type":"Electrical","isolation_method":"Lockout / Tagout","remarks":"Double isolation required"}'
    $l1id = 0; if ($l1.Status -eq 201) { try { $l1id = [int]($l1.Body | ConvertFrom-Json).loto.id } catch {} }
    $ids.loto += $l1id
    Check 'LOTO point 1 create (201)' '201' $l1.Status
    $l2 = Invoke-Api $SC1 'POST' "/api/permits/$pid2/loto" '{"description":"Block steam line","tag_number":"LOTO-002","energy_type":"Thermal","isolation_method":"Blank flange","remarks":"Cool down before work"}'
    $l2id = 0; if ($l2.Status -eq 201) { try { $l2id = [int]($l2.Body | ConvertFrom-Json).loto.id } catch {} }
    $ids.loto += $l2id
    Check 'LOTO point 2 create (201)' '201' $l2.Status
    $lp = @(RestQ "loto_isolation_points?select=energy_type,isolation_method,remarks&permit_id=eq.$pid2&order=id")
    Check 'LOTO points persisted (2)' '2' $lp.Count
    if ($lp.Count -ge 2) {
      Check 'LOTO point 1 energy_type' 'Electrical' $lp[0].energy_type
      Check 'LOTO point 1 isolation_method' 'Lockout / Tagout' $lp[0].isolation_method
      Check 'LOTO point 2 energy_type' 'Thermal' $lp[1].energy_type
      Check 'LOTO point 1 remarks persisted' 'Double isolation required' $lp[0].remarks
    }

    # none verified -> blocked with count 2
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue"
    Check 'approval blocked: 2 LOTO unverified (400)' '400' $r.Status
    Check 'block message counts 2 LOTO points' 'True' $([bool]($r.Body -match 'Approval blocked: 2 LOTO isolation point\(s\) have not been verified.'))

    # verify 1 of 2 -> blocked with count 1
    if ($l1id) { Invoke-Api $SC1 'POST' "/api/permits/$pid2/loto/$l1id/verify" '{"status":"verified"}' | Out-Null }
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue"
    Check 'approval blocked: 1 LOTO unverified (400)' '400' $r.Status
    Check 'block message counts 1 LOTO point' 'True' $([bool]($r.Body -match 'Approval blocked: 1 LOTO isolation point\(s\) have not been verified.'))

    # verify both -> LOTO gate passes, gas gate now blocks
    if ($l2id) { Invoke-Api $SC1 'POST' "/api/permits/$pid2/loto/$l2id/verify" '{"status":"verified"}' | Out-Null }
    $r = Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue"
    Check 'approval blocked: gas testing not verified (400)' '400' $r.Status
    Check 'block message: gas testing not verified' 'True' $([bool]($r.Body -match 'Approval blocked: gas testing has not been verified.'))

    # add a FAIL gas test, verify -> blocked
    $g1 = Invoke-Api $SC1 'POST' "/api/permits/$pid2/gas-tests" '{"tested_at":"2026-10-01T08:00:00","instrument":"Gas Detector GD-001","instrument_id":"GD-001","calibration_status":"Valid","test_location":"Entry point","result":"FAIL","readings":[{"parameter":"O2","reading":18.0,"unit":"%","result":"PASS"},{"parameter":"LEL","reading":12,"unit":"%LEL","result":"CONDITIONAL"}],"remarks":"elevated LEL"}'
    $g1id = 0; if ($g1.Status -eq 201) { try { $g1id = [int]($g1.Body | ConvertFrom-Json).gas_test.id } catch {} }
    $ids.gas += $g1id
    Check 'gas test FAIL create (201)' '201' $g1.Status
    if ($g1id) {
      $g = @(RestQ "gas_tests?select=instrument,instrument_id,calibration_status,test_location,result,tester_id&id=eq.$g1id")
      Check 'gas instrument persisted' 'Gas Detector GD-001' $g[0].instrument
      Check 'gas instrument_id persisted' 'GD-001' $g[0].instrument_id
      Check 'gas calibration persisted' 'Valid' $g[0].calibration_status
      Check 'gas test_location persisted' 'Entry point' $g[0].test_location
      Check 'gas result persisted' 'FAIL' $g[0].result
      Check 'gas tester_id set' 'True' $([bool]$g[0].tester_id)
      $rd = @(RestQ "gas_test_readings?select=parameter,reading,unit,result&gas_test_id=eq.$g1id&order=sort_order")
      Check 'gas readings persisted (2)' '2' $rd.Count
      if ($rd.Count -ge 2) { Check 'gas reading 1 value' '18' ([double]$rd[0].reading) }
      Invoke-Api $SC1 'POST' "/api/permits/$pid2/gas-tests/$g1id/verify" '{"status":"verified"}' | Out-Null
      $gt = @(RestQ "gas_tests?select=status&id=eq.$g1id")
      Check 'gas FAIL test verified' 'verified' $gt[0].status
      $r = Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue"
      Check 'approval blocked: FAIL gas result (400)' '400' $r.Status
      Check 'block message: gas result not acceptable' 'True' $([bool]($r.Body -match 'Approval blocked: gas test result is not acceptable.'))
    }

    # add a later PASS gas test, verify -> approval passes
    $g2 = Invoke-Api $SC1 'POST' "/api/permits/$pid2/gas-tests" '{"tested_at":"2026-10-01T09:00:00","instrument":"Gas Detector GD-001","instrument_id":"GD-001","calibration_status":"Valid","test_location":"Entry point","result":"PASS","readings":[{"parameter":"O2","reading":20.9,"unit":"%","result":"PASS"},{"parameter":"LEL","reading":3,"unit":"%LEL","result":"PASS"},{"parameter":"H2S","reading":1,"unit":"ppm","result":"PASS"},{"parameter":"CO","reading":5,"unit":"ppm","result":"PASS"}]}'
    $g2id = 0; if ($g2.Status -eq 201) { try { $g2id = [int]($g2.Body | ConvertFrom-Json).gas_test.id } catch {} }
    $ids.gas += $g2id
    Check 'gas test PASS create (201)' '201' $g2.Status
    if ($g2id) {
      Invoke-Api $SC1 'POST' "/api/permits/$pid2/gas-tests/$g2id/verify" '{"status":"verified"}' | Out-Null
      $r = Invoke-Api $SC1 'POST' "/api/permits/$pid2/approve-and-issue"
      Check 'approval passes with PASS gas result (200)' '200' $r.Status
    }
  }

  # =====================================================================
  # 3. Legacy hazards_controls still accepted (backward compat)
  # =====================================================================
  $pid3 = New-Permit $SC1 'QA Phase C legacy jha' 1 2 'C'
  Check 'legacy permit created+submitted' 'True' $([bool]$pid3)
  if ($pid3) {
    $j = Invoke-Api $SC1 'POST' "/api/permits/$pid3/jha" '{"title":"QA legacy JHA","hazards_controls":[{"hazard":"Slip hazard","control":"Keep area dry"}]}'
    $jhaId = 0; if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
    $ids.jhas += $jhaId
    Check 'legacy hazards_controls JHA create (201)' '201' $j.Status
    if ($jhaId) {
      $rows = @(RestQ "jha_hazards?select=hazard,existing_controls&jha_id=eq.$jhaId")
      Check 'legacy JHA backfilled into jha_hazards (1)' '1' $rows.Count
      if ($rows.Count -ge 1) {
        Check 'legacy hazard text' 'Slip hazard' $rows[0].hazard
        Check 'legacy control -> existing_controls' 'Keep area dry' $rows[0].existing_controls
      }
    }
  }

  # =====================================================================
  # 4. Company isolation for jha_hazards / loto / gas (company 3)
  # =====================================================================
  $pid4 = New-Permit $SM3 'QA Phase C iso' 3 11 'D'
  Check 'company-3 CSE permit created+submitted' 'True' $([bool]$pid4)
  if ($pid4) {
    Verify-RequiredControls $SM3 $pid4
    $j = Invoke-Api $SM3 'POST' "/api/permits/$pid4/jha" '{"title":"QA iso JHA","hazards":[{"hazard":"Iso hazard","likelihood":2,"severity":3}]}'
    $jhaId = 0; if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
    $ids.jhas += $jhaId
    if ($jhaId) { Invoke-Api $SM3 'POST' "/api/permits/$pid4/jha/$jhaId/complete" | Out-Null; Invoke-Api $SM3 'POST' "/api/permits/$pid4/jha/$jhaId/verify" '{"status":"verified"}' | Out-Null }
    $l = Invoke-Api $SM3 'POST' "/api/permits/$pid4/loto" '{"description":"Iso point","energy_type":"Electrical","isolation_method":"Lockout"}'
    $lotoId = 0; if ($l.Status -eq 201) { try { $lotoId = [int]($l.Body | ConvertFrom-Json).loto.id } catch {} }
    $ids.loto += $lotoId
    $g = Invoke-Api $SM3 'POST' "/api/permits/$pid4/gas-tests" '{"instrument":"Iso GD","result":"PASS","readings":[{"parameter":"O2","reading":20.9,"unit":"%"}]}'
    $gasId = 0; if ($g.Status -eq 201) { try { $gasId = [int]($g.Body | ConvertFrom-Json).gas_test.id } catch {} }
    $ids.gas += $gasId

    if ($jhaId) {
      $isRows = @(RestQUser "jha_hazards?select=id&jha_id=eq.$jhaId" $isTok)
      Check 'company-1 user cannot see company-3 jha_hazards (0)' '0' $isRows.Count
      $smRows = @(RestQUser "jha_hazards?select=id&jha_id=eq.$jhaId" $smTok)
      Check 'company-3 user sees own jha_hazards (1)' '1' $smRows.Count
    }
    if ($lotoId) {
      $isRows = @(RestQUser "loto_isolation_points?select=id&permit_id=eq.$pid4" $isTok)
      Check 'company-1 user cannot see company-3 loto (0)' '0' $isRows.Count
      $smRows = @(RestQUser "loto_isolation_points?select=id&permit_id=eq.$pid4" $smTok)
      Check 'company-3 user sees own loto (1)' '1' $smRows.Count
    }
    if ($gasId) {
      $isRows = @(RestQUser "gas_tests?select=id&permit_id=eq.$pid4" $isTok)
      Check 'company-1 user cannot see company-3 gas_tests (0)' '0' $isRows.Count
      $smRows = @(RestQUser "gas_tests?select=id&permit_id=eq.$pid4" $smTok)
      Check 'company-3 user sees own gas_tests (1)' '1' $smRows.Count
      $isRows = @(RestQUser "gas_test_readings?select=id&gas_test_id=eq.$gasId" $isTok)
      Check 'company-1 user cannot see company-3 gas readings (0)' '0' $isRows.Count
      $smRows = @(RestQUser "gas_test_readings?select=id&gas_test_id=eq.$gasId" $smTok)
      Check 'company-3 user sees own gas readings (1)' '1' $smRows.Count
    }
  }

  # =====================================================================
  # 5. Regressions — roles, audit history, PTW-2026-0020, Free/Pro, HitPay
  # =====================================================================
  $r = Invoke-Api $PA 'POST' '/api/permits' '{"company_id":1,"permit_type_id":2,"work_title":"QA PA"}'
  Check 'platform_admin create PTW (403)' '403' $r.Status
  $r = Invoke-Api $IS1 'POST' "/api/permits/$pid1/approve-and-issue"
  Check 'internal_staff approve (403)' '403' $r.Status
  $r = Invoke-Api $CON 'POST' "/api/permits/$pid1/approve-and-issue"
  Check 'contractor_admin approve (403)' '403' $r.Status

  # audit history on the approved structured-JHA permit
  $hist = @(RestQ "permit_approvals?select=action&permit_id=eq.$pid1&order=created_at")
  $actions = ($hist | ForEach-Object { $_.action }) -join ','
  Check 'audit history has submitted+approved+issued' 'True' $([bool]($actions -match 'submitted' -and $actions -match 'approved' -and $actions -match 'issued'))

  # PTW-2026-0020 (id 18) intact
  $p18 = @(RestQ "permits?select=permit_no,status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 still exists' 'True' $([bool]($p18.Count -ge 1))
  if ($p18.Count -ge 1) {
    Check 'PTW-2026-0020 status' 'active' $p18[0].status
    Check 'PTW-2026-0020 workflow_stage' 'active' $p18[0].workflow_stage
  }
  $h18 = @(RestQ "permit_approvals?select=action&permit_id=eq.18&order=created_at")
  $a18 = ($h18 | ForEach-Object { $_.action }) -join ','
  Check 'PTW-2026-0020 history submitted->approved' 'True' $([bool]($a18 -match 'submitted' -and $a18 -match 'approved'))

  # Free/Pro + HitPay untouched
  $plans = @(RestQ 'plans?select=code&order=id')
  $planCodes = ($plans | ForEach-Object { $_.code }) -join ','
  Check 'plans table intact (free,pro)' 'True' $([bool]($planCodes -match 'free' -and $planCodes -match 'pro'))
  $subs = @(RestQ 'company_subscriptions?select=id&limit=1')
  $pay = @(RestQ 'payments?select=id&limit=1')
  $bev = @(RestQ 'billing_events?select=id&limit=1')
  Write-Output "note: company_subscriptions=$($subs.Count) payments=$($pay.Count) billing_events=$($bev.Count) (Phase C made no billing changes)"
}

elseif ($Mode -eq 'cleanup') {
  $permits = @($ids.permits | Where-Object { $_ })
  if ($permits.Count -gt 0) {
    $deleted = 0
    foreach ($p in $permits) {
      foreach ($tbl in @('permit_recommended_controls','permit_ppe','permit_workers','jhas','loto_isolation_points','gas_tests','permit_safety_controls','permit_approvals','notifications')) {
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
  $leftJha = @(RestQ 'jhas?select=id&limit=1').Count
  $leftHaz = @(RestQ 'jha_hazards?select=id&limit=1').Count
  $leftLoto = @(RestQ 'loto_isolation_points?select=id&limit=1').Count
  $leftGas = @(RestQ 'gas_tests?select=id&limit=1').Count
  $leftRead = @(RestQ 'gas_test_readings?select=id&limit=1').Count
  Check 'no jhas left' '0' $leftJha
  Check 'no jha_hazards left' '0' $leftHaz
  Check 'no loto left' '0' $leftLoto
  Check 'no gas_tests left' '0' $leftGas
  Check 'no gas_test_readings left' '0' $leftRead
  $p18 = @(RestQ "permits?select=status,workflow_stage&id=eq.18")
  Check 'PTW-2026-0020 still active after cleanup' 'active' $p18[0].status
}

SaveIds
Write-Output ''
Write-Output "TOTAL (mode=$Mode): PASS=$pass FAIL=$fail"
