# ePTW QA â€” Worker briefing is part of the safety approval gate whenever the
# permit lists workers (previously gated only by requires_worker_briefing, which
# was false everywhere so briefing never blocked approval). Also verifies the
# "Mark Briefing Complete" action accepts a PARTIAL topic checklist.
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-briefing-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-briefing-ids.json'
$ids = @{ permits = @(); jhas = @() }
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
  $curlArgs = @('-s','-o',$respFile,'-w','%{http_code}','-X',$method,"$base$path",'-H',"Cookie: $cookie")
  if ($jsonBody) { [IO.File]::WriteAllText($bodyFile, $jsonBody); $curlArgs += @('-H','Content-Type: application/json','--data-binary',"@$bodyFile") }
  $code = & curl.exe @curlArgs
  $text = ''; if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return [pscustomobject]@{ Status = [int]$code; Body = $text }
}
function RestQ([string]$path) { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20; if ($null -eq $r) { return @() }; return $r }
function RestDelete([string]$path) { try { $null = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Method Delete -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 15 } catch {} }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SM3 = Get-ApiCookie 'safetymanager@test.com'   # company 3 safety manager
$typeId = 10                                     # company 3 COLD

if ($Mode -eq 'main') {
  # ---------------- 1. Contractor-style permit with 2 workers (company 3) ---
  $decl = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss') + 'Z'
  $createBody = @{
    company_id = 3; permit_type_id = $typeId
    work_title = 'QA briefing gate ' + (Get-Date).ToString('HHmmssfff')
    work_description = 'QA'; work_location = 'QA'
    planned_start = '2026-09-15T08:00:00'; planned_end = '2026-09-15T17:00:00'
    workers = @(
      @{ full_name = 'Brief Worker A'; id_number = '880101-01-1001'; nationality = 'Malaysian'; induction_completed = $true },
      @{ full_name = 'Brief Worker B'; id_number = '880102-01-1002'; nationality = 'Malaysian'; induction_completed = $true }
    )
    declaration_confirmed_at = $decl
  } | ConvertTo-Json -Compress -Depth 8
  $cr = Invoke-Api $SM3 'POST' '/api/permits' $createBody
  $permitId = 0
  if ($cr.Status -eq 201) { try { $permitId = [int]($cr.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $script:ids.permits += $permitId }
  Check 'permit with 2 workers created (201)' '201' $cr.Status
  if (-not $permitId) { Write-Output 'FATAL: no permit'; exit 1 }
  $srSubmit = Invoke-Api $SM3 'POST' "/api/permits/$permitId/submit"
  Check 'permit submitted (200)' '200' $srSubmit.Status

  # ---------------- 2. Complete JHA + site verification (everything but briefing)
  $j = Invoke-Api $SM3 'POST' "/api/permits/$permitId/jha" '{"title":"QA JHA","hazards":[{"hazard":"QA hazard","likelihood":2,"severity":3}]}'
  $jhaId = 0; if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
  if ($jhaId) { $script:ids.jhas += $jhaId }
  Check 'JHA created (201)' '201' $j.Status
  if ($jhaId) {
    Invoke-Api $SM3 'POST' "/api/permits/$permitId/jha/$jhaId/complete" | Out-Null
    $vj = Invoke-Api $SM3 'POST' "/api/permits/$permitId/jha/$jhaId/verify" '{"status":"verified"}'
    Check 'JHA verified (200)' '200' $vj.Status
  }
  $template = @(RestQ "permit_type_site_checklist?select=item_key,is_required&permit_type_id=eq.$typeId")
  $items = @(); foreach ($t in $template) { $items += @{ key = $t.item_key; status = 'ok' } }
  $svBody = @{ status = 'verified'; checklist = $items; remarks = 'QA site verification' } | ConvertTo-Json -Compress -Depth 6
  $sv = Invoke-Api $SM3 'PATCH' "/api/permits/$permitId/site-verification" $svBody
  Check 'site verification (200)' '200' $sv.Status

  # Required safety controls must be verified so BRIEFING is the first blocker.
  foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$permitId")) {
    if ($c.is_required -and $c.status -eq 'pending') {
      $vc = Invoke-Api $SM3 'PATCH' "/api/permits/$permitId/safety-controls/$($c.id)/verify" '{"remarks":"ok"}'
      if ($vc.Status -ne 200) { Write-Output "WARN | verify control $($c.id) -> $($vc.Status)" }
    }
  }
  $pendingControls = @(RestQ "permit_safety_controls?select=id&permit_id=eq.$permitId&is_required=eq.true&status=eq.pending")
  Check 'no required controls left pending' '0' $pendingControls.Count

  # ---------------- 3. Approval BLOCKED by briefing (the core change) --------
  $app1 = Invoke-Api $SM3 'POST' "/api/permits/$permitId/approve-and-issue"
  Check 'approval blocked: briefing required (400)' '400' $app1.Status
  Check 'block message: worker briefing not completed' 'True' ([bool]($app1.Body -match 'Worker briefing has not been completed'))
  $rd1 = Invoke-Api $SM3 'GET' "/api/permits/$permitId/readiness"
  $rd1Json = $rd1.Body | ConvertFrom-Json
  $briefItem = @($rd1Json.items | Where-Object { $_.key -eq 'worker_briefing' })
  Check 'readiness marks briefing required=true' 'True' ([bool]($briefItem.Count -ge 1 -and $briefItem[0].required -eq $true))
  Check 'readiness briefing incomplete' 'incomplete' $briefItem[0].status

  # ---------------- 4. Mark briefing complete with PARTIAL topics ------------
  # Only 2 of the applicable topics covered -> must still be accepted (200).
  $partialBody = '{"topics":[{"key":"work_scope","label":"Work scope explained","covered":true},{"key":"hazards","label":"Hazards explained","covered":true}],"remarks":"partial coverage accepted"}'
  $wb = Invoke-Api $SM3 'PATCH' "/api/permits/$permitId/worker-briefing" $partialBody
  Check 'briefing saved with partial topics (200)' '200' $wb.Status
  $wbs = @(RestQ "permit_worker_briefings?select=status&permit_id=eq.$permitId")
  Check 'briefing status briefed' 'briefed' $wbs[0].status

  # ---------------- 5. Still blocked until workers acknowledge --------------
  $app2 = Invoke-Api $SM3 'POST' "/api/permits/$permitId/approve-and-issue"
  Check 'approval blocked: acknowledgements missing (400)' '400' $app2.Status
  Check 'block message: workers not acknowledged' 'True' ([bool]($app2.Body -match 'have not acknowledged the required briefing'))

  # ---------------- 6. Acknowledge both workers -> approval passes -----------
  foreach ($w in @(RestQ "permit_workers?select=id&permit_id=eq.$permitId&order=id")) {
    $aw = Invoke-Api $SM3 'PATCH' "/api/permits/$permitId/worker-briefing/$($w.id)" '{"acknowledged":true}'
    if ($aw.Status -ne 200) { Write-Output "WARN | ack worker $($w.id) -> $($aw.Status)" }
  }
  $rd2 = Invoke-Api $SM3 'GET' "/api/permits/$permitId/readiness"
  $rd2Json = $rd2.Body | ConvertFrom-Json
  Check 'readiness ready after briefing+ack (partial topics ok)' 'True' $rd2Json.ready
  $app3 = Invoke-Api $SM3 'POST' "/api/permits/$permitId/approve-and-issue"
  Check 'approval passes with briefing complete (200)' '200' $app3.Status

  SaveIds
  Write-Output "TOTAL | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  foreach ($pid_ in $ids.permits) {
    foreach ($j in $ids.jhas) { RestDelete "jha_hazards?jha_id=eq.$j" | Out-Null }
    RestDelete "jhas?permit_id=eq.$pid_" | Out-Null
    foreach ($tbl in @('permit_resume_checklists','permit_completion_checklists','permit_closure_checklists','permit_recommended_controls','permit_ppe','permit_workers','loto_isolation_points','gas_tests','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','permit_safety_controls','permit_approvals','notifications')) {
      RestDelete "$tbl?permit_id=eq.$pid_" | Out-Null
    }
    RestDelete "permits?id=eq.$pid_" | Out-Null
  }
  $ids = @{ permits = @(); jhas = @() }; SaveIds
  Write-Output 'cleanup done'
}

