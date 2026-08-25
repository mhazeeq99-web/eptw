# ePTW Production Release Blocker QA — DIRECT database/API access (not UI).
# Verifies BLOCKER 1 (perform_permit_transition role gate) and BLOCKER 2
# (verifier-write guard on JHA/LOTO/gas/PPE/workers) at the Supabase/PostgREST
# layer, not merely in the Next.js UI.
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-blocker-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-blocker-ids.json'
$ids = @{ permits = @() }
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
function Rest([string]$tok, [string]$method, [string]$path, [string]$body = '') {
  $bf = Join-Path $tmp "b-$([guid]::NewGuid().ToString('N')).json"; $rf = Join-Path $tmp "r-$([guid]::NewGuid().ToString('N')).txt"
  $a = @('-s','-o',$rf,'-w','%{http_code}','-X',$method,"$url/rest/v1/$path",'-H',"apikey: $sr",'-H',"Authorization: Bearer $tok",'-H','Content-Type: application/json')
  if ($body) { [IO.File]::WriteAllText($bf, $body); $a += @('--data-binary',"@$bf") }
  $code = & curl.exe @a; $t = ''; if (Test-Path $rf) { $t = [IO.File]::ReadAllText($rf) }
  return [pscustomobject]@{ Status = [int]$code; Body = $t }
}
function RestSvc([string]$method, [string]$path, [string]$body = '') {
  $bf = Join-Path $tmp "s-$([guid]::NewGuid().ToString('N')).json"; $rf = Join-Path $tmp "r-$([guid]::NewGuid().ToString('N')).txt"
  $a = @('-s','-o',$rf,'-w','%{http_code}','-X',$method,"$url/rest/v1/$path",'-H',"apikey: $sr",'-H',"Authorization: Bearer $sr",'-H','Content-Type: application/json','-H','Prefer: return=representation')
  if ($body) { [IO.File]::WriteAllText($bf, $body); $a += @('--data-binary',"@$bf") }
  $code = & curl.exe @a; $t = ''; if (Test-Path $rf) { $t = [IO.File]::ReadAllText($rf) }
  return [pscustomobject]@{ Status = [int]$code; Body = $t }
}
function GetJson($resp) {
  $t = $resp.Body
  if ([string]::IsNullOrWhiteSpace($t)) { return @() }
  try { return @($t | ConvertFrom-Json) } catch { return @() }
}
function Get-PermitStatus([int]$permitId) {
  $r = @(GetJson (RestSvc 'GET' "permits?select=status&id=eq.$permitId"))
  if ($r.Count -gt 0) { return [string]$r[0].status }
  return ''
}
function UtcIso([int]$hoursFromNow) { return (Get-Date).ToUniversalTime().AddHours($hoursFromNow).ToString('yyyy-MM-ddTHH:mm:ss') + 'Z' }
function IsDenied([pscustomobject]$r) { return ($r.Status -ge 400) }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$IS1 = Get-ApiCookie 'supervisor@company.com'
$SC1 = Get-ApiCookie 'safetycoord1@test.com'
$SM3 = Get-ApiCookie 'safetymanager@test.com'
$isTok = (Get-Session 'supervisor@company.com').access_token
$scTok = (Get-Session 'safetycoord1@test.com').access_token
$smTok = (Get-Session 'safetymanager@test.com').access_token
$conTok = (Get-Session 'contractor@test.com').access_token
$isUserId = '4e0b8019-8b3d-49cb-8e00-76605728b045'

function Create-Permit([string]$cookie, [int]$companyId, [int]$typeId, [string]$title) {
  $bodyObj = @{ company_id=$companyId; permit_type_id=$typeId; work_title=$title; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) }
  $r = Invoke-Api $cookie 'POST' '/api/permits' ($bodyObj | ConvertTo-Json -Compress -Depth 6)
  $newId = 0; if ($r.Status -eq 201) { try { $newId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($newId) { $script:ids.permits += $newId }
  return [pscustomobject]@{ Status = $r.Status; Id = $newId }
}

function Prepare-ForApproval([string]$vcookie, [int]$permitId, [int]$typeId) {
  foreach ($c in @(GetJson (RestSvc 'GET' "permit_safety_controls?select=id,is_required,status&permit_id=eq.$permitId"))) {
    if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $vcookie 'PATCH' "/api/permits/$permitId/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
  }
  $j = Invoke-Api $vcookie 'POST' "/api/permits/$permitId/jha" '{"title":"QA JHA","hazards":[{"hazard":"QA hazard","likelihood":2,"severity":3}]}'
  $jhaId = 0; if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
  if ($jhaId) { Invoke-Api $vcookie 'POST' "/api/permits/$permitId/jha/$jhaId/complete" | Out-Null; Invoke-Api $vcookie 'POST' "/api/permits/$permitId/jha/$jhaId/verify" '{"status":"verified"}' | Out-Null }
  $template = @(GetJson (RestSvc 'GET' "permit_type_site_checklist?select=item_key,is_required&permit_type_id=eq.$typeId"))
  $items = @(); foreach ($t in $template) { $items += @{ key = $t.item_key; status = if ($t.is_required) { 'ok' } else { 'na' } } }
  Invoke-Api $vcookie 'PATCH' "/api/permits/$permitId/site-verification" (@{ status='verified'; checklist=$items; remarks='QA' } | ConvertTo-Json -Compress -Depth 6) | Out-Null
  $requiredPpe = @(GetJson (RestSvc 'GET' "permit_type_ppe?select=ppe_item_id&permit_type_id=eq.$typeId&requirement=eq.required"))
  if ($requiredPpe.Count -gt 0) {
    $existing = @(GetJson (RestSvc 'GET' "permit_ppe?select=ppe_item_id,is_selected&permit_id=eq.$permitId"))
    $existingIds = @($existing | ForEach-Object { if ($_.is_selected) { [int]$_.ppe_item_id } })
    foreach ($m in $requiredPpe) {
      $id = [int]$m.ppe_item_id
      if ($existingIds -notcontains $id) { RestSvc 'POST' "permit_ppe" (@{ permit_id=$permitId; ppe_item_id=$id; is_selected=$true } | ConvertTo-Json -Compress) | Out-Null }
    }
    Invoke-Api $vcookie 'PATCH' "/api/permits/$permitId/ppe-verification" '{"verified":true}' | Out-Null
  }
}

# Build a full checklist body for resume/complete/close from the lifecycle endpoint.
function Get-ChecklistBody([string]$cookie, [int]$permitId, [string]$listKey, [string]$remarks) {
  $lc = Invoke-Api $cookie 'GET' "/api/permits/$permitId/lifecycle"
  $lcObj = $lc.Body | ConvertFrom-Json
  $items = @()
  foreach ($item in $lcObj.$listKey) {
    $items += @{ item_key = $item.item_key; completed = $true; status = 'completed' }
  }
  return @{ remarks = $remarks; checklist = $items } | ConvertTo-Json -Compress -Depth 8
}

$billingStart = @(GetJson (RestSvc 'GET' "billing_events?select=id&limit=1000")).Count

if ($Mode -eq 'main') {
  $p1 = Create-Permit $IS1 1 2 'QA Blocker P1'
  Invoke-Api $IS1 'POST' "/api/permits/$($p1.Id)/submit" | Out-Null
  Check 'P1 submitted -> pending_approval' 'pending_approval' (Get-PermitStatus $p1.Id)

  $rpcBody = '{"p_permit_id":' + $p1.Id + ',"p_expected_status":"pending_approval","p_new_status":"active","p_fields":{"workflow_stage":"active"}}'
  $r = Rest $isTok 'POST' "rpc/perform_permit_transition" $rpcBody
  Check 'A: IS direct RPC activate -> denied' 'True' (IsDenied $r)
  Check 'A: permit still pending_approval after IS RPC' 'pending_approval' (Get-PermitStatus $p1.Id)

  $r = Rest $conTok 'POST' "rpc/perform_permit_transition" $rpcBody
  Check 'B: contractor direct RPC activate -> denied' 'True' (IsDenied $r)
  Check 'B: permit unchanged after contractor RPC' 'pending_approval' (Get-PermitStatus $p1.Id)

  $r = Rest $smTok 'POST' "rpc/perform_permit_transition" $rpcBody
  Check 'K: cross-company SM direct RPC activate -> denied' 'True' (IsDenied $r)
  Check 'K: permit unchanged after cross-company RPC' 'pending_approval' (Get-PermitStatus $p1.Id)

  # E/F/G/H: rows are created via service-role (so they exist and are
  # accessible), then a NON-verifier attempts the direct verification UPDATE.
  # IS (company 1) CAN access an internal permit, so the trigger is the guard.
  $jh = RestSvc 'POST' "jhas" (@{ permit_id=$p1.Id; title='QA direct JHA'; status='pending'; created_by=$isUserId } | ConvertTo-Json -Compress)
  $jhaId = 0; $jrow = @(GetJson $jh); if ($jrow.Count -gt 0) { $jhaId = [int]$jrow[0].id }
  $u = Rest $isTok 'PATCH' "jhas?id=eq.$jhaId" '{"status":"verified"}'
  Check 'E: IS direct JHA verified UPDATE denied' 'True' (IsDenied $u)

  $lo = RestSvc 'POST' "loto_isolation_points" (@{ permit_id=$p1.Id; description='QA LOTO'; status='pending'; created_by=$isUserId } | ConvertTo-Json -Compress)
  $lotoId = 0; $lrow = @(GetJson $lo); if ($lrow.Count -gt 0) { $lotoId = [int]$lrow[0].id }
  $u = Rest $isTok 'PATCH' "loto_isolation_points?id=eq.$lotoId" '{"status":"verified"}'
  Check 'G: IS direct LOTO verified UPDATE denied' 'True' (IsDenied $u)

  $ga = RestSvc 'POST' "gas_tests" (@{ permit_id=$p1.Id; instrument='GD-1'; result='PASS'; status='pending'; o2=20.9; tester_id=$isUserId } | ConvertTo-Json -Compress)
  $gasId = 0; $grow = @(GetJson $ga); if ($grow.Count -gt 0) { $gasId = [int]$grow[0].id }
  $u = Rest $isTok 'PATCH' "gas_tests?id=eq.$gasId" '{"status":"verified"}'
  Check 'H: IS direct gas verified UPDATE denied' 'True' (IsDenied $u)

  # F: contractor must not self-certify on a permit it CAN access (contractor
  # permit). Create a contractor permit, submit, add a JHA, contractor verifies.
  $CONfresh = Get-ApiCookie 'contractor@test.com'
  $pc = Invoke-Api $CONfresh 'POST' '/api/permits' (@{ company_id=1; permit_type_id=2; work_title='QA Blocker F'; work_description='QA'; work_location='QA'; planned_start=(UtcIso 0); planned_end=(UtcIso 6); worker_name='QA Worker'; worker_id='990101-01-0001'; staff_reference_name='QA Staff' } | ConvertTo-Json -Compress -Depth 6)
  $pconId = 0; if ($pc.Status -eq 201) { try { $pconId = [int]($pc.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($pconId) { $script:ids.permits += $pconId }
  if ($pconId) {
    Invoke-Api $CONfresh 'POST' "/api/permits/$pconId/submit" | Out-Null
    $cj = RestSvc 'POST' "jhas" (@{ permit_id=$pconId; title='QA contractor JHA'; status='pending'; created_by=$isUserId } | ConvertTo-Json -Compress)
    $cjId = 0; $cjrow = @(GetJson $cj); if ($cjrow.Count -gt 0) { $cjId = [int]$cjrow[0].id }
    $u = Rest $conTok 'PATCH' "jhas?id=eq.$cjId" '{"status":"verified"}'
    Check 'F: contractor direct JHA verified UPDATE denied' 'True' (IsDenied $u)
    # also verify the contractor still cannot force the permit to ACTIVE via RPC
    $crpc = '{"p_permit_id":' + $pconId + ',"p_expected_status":"pending_approval","p_new_status":"active","p_fields":{"workflow_stage":"active"}}'
    $rr = Rest $conTok 'POST' "rpc/perform_permit_transition" $crpc
    Check 'F: contractor direct RPC activate contractor permit denied' 'True' (IsDenied $rr)
  } else { Check 'F: contractor direct JHA verified UPDATE denied' 'True' 'no-contractor-permit' }

  # I: PPE
  $ppeItem = @(GetJson (RestSvc 'GET' "ppe_items?select=id&limit=1"))[0]
  $ppeId = if ($ppeItem) { [int]$ppeItem.id } else { 1 }
  $r = Rest $isTok 'POST' "permit_ppe" (@{ permit_id=$p1.Id; ppe_item_id=$ppeId; is_selected=$true; verified=$true } | ConvertTo-Json -Compress)
  Check 'I: IS direct PPE verified INSERT denied' 'True' (IsDenied $r)
  $r = Rest $isTok 'POST' "permit_ppe" (@{ permit_id=$p1.Id; ppe_item_id=$ppeId; is_selected=$true } | ConvertTo-Json -Compress)
  Check 'I: IS normal unverified PPE INSERT allowed' 'True' (-not (IsDenied $r))

  # J: workers
  $r = Rest $isTok 'POST' "permit_workers" (@{ permit_id=$p1.Id; full_name='QA Worker'; acknowledged=$true } | ConvertTo-Json -Compress)
  Check 'J: IS direct worker acknowledged INSERT denied' 'True' (IsDenied $r)
  $r = Rest $isTok 'POST' "permit_workers" (@{ permit_id=$p1.Id; full_name='QA Worker Normal' } | ConvertTo-Json -Compress)
  Check 'J: IS normal unacknowledged worker INSERT allowed' 'True' (-not (IsDenied $r))

  # L: readiness still required
  $pL = Create-Permit $IS1 1 2 'QA Blocker L'
  Invoke-Api $IS1 'POST' "/api/permits/$($pL.Id)/submit" | Out-Null
  $r = Invoke-Api $SC1 'POST' "/api/permits/$($pL.Id)/approve-and-issue"
  Check 'L: approve non-ready permit blocked (400)' '400' $r.Status

  # C: SC legitimate approval
  $pC = Create-Permit $IS1 1 2 'QA Blocker C'
  Invoke-Api $IS1 'POST' "/api/permits/$($pC.Id)/submit" | Out-Null
  Prepare-ForApproval $SC1 $pC.Id 2
  $r = Invoke-Api $SC1 'POST' "/api/permits/$($pC.Id)/approve-and-issue"
  Check 'C: SC legitimate approve-and-issue (200)' '200' $r.Status
  Check 'C: SC-approved permit active' 'active' (Get-PermitStatus $pC.Id)

  # D: SM self-approval
  $pD = Create-Permit $SM3 3 10 'QA Blocker D'
  Invoke-Api $SM3 'POST' "/api/permits/$($pD.Id)/submit" | Out-Null
  Prepare-ForApproval $SM3 $pD.Id 10
  $r = Invoke-Api $SM3 'POST' "/api/permits/$($pD.Id)/approve-and-issue"
  Check 'D: SM self-approve (200)' '200' $r.Status
  Check 'D: SM self-approved permit active' 'active' (Get-PermitStatus $pD.Id)

  # M: lifecycle on the active permit (C)
  $r = Invoke-Api $SC1 'POST' "/api/permits/$($pC.Id)/suspend" '{"remarks":"QA suspend"}'
  Check 'M: suspend active -> suspended (200)' '200' $r.Status
  Check 'M: status suspended' 'suspended' (Get-PermitStatus $pC.Id)
  $cl = Get-ChecklistBody $SC1 $pC.Id 'resume_checklist' 'QA resume'
  $r = Invoke-Api $SC1 'POST' "/api/permits/$($pC.Id)/resume" $cl
  Check 'M: resume -> active (200)' '200' $r.Status
  $cc = Get-ChecklistBody $SC1 $pC.Id 'completion_checklist' 'QA done'
  $r = Invoke-Api $SC1 'POST' "/api/permits/$($pC.Id)/complete" $cc
  Check 'M: complete -> completed (200)' '200' $r.Status
  $clc = Get-ChecklistBody $SC1 $pC.Id 'closure_checklist' 'QA close'
  $r = Invoke-Api $SC1 'POST' "/api/permits/$($pC.Id)/close" $clc
  Check 'M: close -> closed (200)' '200' $r.Status
  Check 'M: final status closed' 'closed' (Get-PermitStatus $pC.Id)

  # M2: reject + resubmit + cancel
  $pR = Create-Permit $IS1 1 2 'QA Blocker R'
  Invoke-Api $IS1 'POST' "/api/permits/$($pR.Id)/submit" | Out-Null
  $r = Invoke-Api $SC1 'POST' "/api/permits/$($pR.Id)/reject" '{"remarks":"QA reject"}'
  Check 'M: reject pending -> rejected (200)' '200' $r.Status
  $r = Invoke-Api $IS1 'POST' "/api/permits/$($pR.Id)/resubmit"
  Check 'M: resubmit rejected -> pending (200)' '200' $r.Status
  $r = Invoke-Api $IS1 'POST' "/api/permits/$($pR.Id)/cancel" '{"remarks":"QA cancel"}'
  Check 'M: cancel (200)' '200' $r.Status

  # N: PTW-2026-0020
  $q = @(GetJson (RestSvc 'GET' "permits?select=status,workflow_stage&permit_no=eq.PTW-2026-0020"))[0]
  Check 'N: PTW-2026-0020 active' 'active' $q.status
  Check 'N: PTW-2026-0020 workflow_stage active' 'active' $q.workflow_stage

  # O: entitlements unchanged (query each plan separately for reliability)
  $frow = @(GetJson (RestSvc 'GET' "plans?select=max_monthly_permits,max_active_permits&code=eq.free"))
  $prow = @(GetJson (RestSvc 'GET' "plans?select=max_monthly_permits,max_active_permits&code=eq.pro"))
  $fm = if ($frow.Count -gt 0 -and $null -ne $frow[0].max_monthly_permits) { [string]$frow[0].max_monthly_permits } else { '' }
  $fa = if ($frow.Count -gt 0 -and $null -ne $frow[0].max_active_permits) { [string]$frow[0].max_active_permits } else { '' }
  $pm = if ($prow.Count -gt 0 -and $null -ne $prow[0].max_monthly_permits) { [string]$prow[0].max_monthly_permits } else { 'null' }
  $pa = if ($prow.Count -gt 0 -and $null -ne $prow[0].max_active_permits) { [string]$prow[0].max_active_permits } else { 'null' }
  Check 'O: Free 20 monthly / 10 active' '20/10' ("$fm/$fa")
  Check 'O: Pro unlimited (null/null)' 'null/null' ("$pm/$pa")

  # P: billing untouched by this test run
  $billingEnd = @(GetJson (RestSvc 'GET' "billing_events?select=id&limit=1000")).Count
  Check 'P: billing_events count unchanged by blocker tests' "$billingStart" "$billingEnd"

  SaveIds
  Write-Output "TOTAL (mode=main): PASS=$pass FAIL=$fail"
}

if ($Mode -eq 'cleanup') {
  $permits = @(GetJson (RestSvc 'GET' "permits?select=id&work_title=like.*QA%20Blocker*"))
  foreach ($p in $permits) {
    $pid3 = [int]$p.id
    foreach ($t in @('permit_resume_checklists','permit_completion_checklists','permit_closure_checklists','permit_approvals','permit_workers','permit_ppe','permit_cse_personnel','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','permit_safety_controls','jhas','loto_isolation_points','gas_tests','notifications')) {
      RestSvc 'DELETE' "$t`?permit_id=eq.$pid3" | Out-Null
    }
    RestSvc 'DELETE' "permits?id=eq.$pid3" | Out-Null
  }
  $residue = @(GetJson (RestSvc 'GET' "permits?select=id&work_title=like.*QA%20Blocker*")).Count
  Check 'cleanup: 0 QA Blocker permits remain' '0' $residue
  $ptw = @(GetJson (RestSvc 'GET' "permits?select=status&permit_no=eq.PTW-2026-0020"))[0]
  Check 'cleanup: PTW-2026-0020 still active' 'active' $ptw.status
  $orphanJhas = @(GetJson (RestSvc 'GET' "jhas?select=id,permit_id")) | Where-Object { @(GetJson (RestSvc 'GET' "permits?select=id&id=eq.$($_.permit_id)")).Count -eq 0 }
  Check 'cleanup: 0 orphan jhas' '0' $orphanJhas.Count
  Write-Output "TOTAL (mode=cleanup): PASS=$pass FAIL=$fail"
}
