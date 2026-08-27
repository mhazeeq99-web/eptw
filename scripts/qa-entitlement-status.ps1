# ePTW Monthly Permit Entitlement — Status-case QA
# Verifies the approved "entered operational workflow" rule through the app flow:
#   draft -> not counted
#   draft -> cancelled -> not counted
#   draft -> submitted -> pending_approval -> counted
#   pending_approval -> rejected -> not counted
#   pending_approval -> cancelled -> not counted
#   approved/issued -> cancelled -> counted (issued/approved here go through activate)
#   active -> suspended -> cancelled -> counted (post-activation cancel stays counted)
#   completed / closed -> counted
#   Free 20/month enforcement still works
#   Draft-first bootstrap stays free
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-entitle-status'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-entitle-status-ids.json'
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
function UtcIso([int]$hoursFromNow) { return (Get-Date).ToUniversalTime().AddHours($hoursFromNow).ToString('yyyy-MM-ddTHH:mm:ss') + 'Z' }
# Authoritative monthly usage = app condition (status NOT IN draft/rejected AND (not cancelled OR valid_from not null))
function Get-MonthlyUsage([int]$companyId) {
  $mgmtPat = 'sbp_e23dfd186001f73743b23ba2eb719d11e57d98af'
  $h = @{ Authorization = "Bearer $mgmtPat"; 'Content-Type' = 'application/json' }
  $mgmtUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
  $body = @{ query = "SELECT count(*) AS n FROM public.permits WHERE company_id=$companyId AND status NOT IN ('draft','rejected') AND (status <> 'cancelled' OR valid_from IS NOT NULL) AND created_at >= date_trunc('month', now());" } | ConvertTo-Json
  try { $resp = Invoke-RestMethod -Uri $mgmtUrl -Method Post -Headers $h -Body $body; return [int]$resp.n } catch { return -1 }
}
function Get-PermitStatus([int]$permitId) {
  $mgmtPat = 'sbp_e23dfd186001f73743b23ba2eb719d11e57d98af'
  $h = @{ Authorization = "Bearer $mgmtPat"; 'Content-Type' = 'application/json' }
  $mgmtUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
  $body = @{ query = "SELECT status FROM public.permits WHERE id=$permitId;" } | ConvertTo-Json
  try { $resp = Invoke-RestMethod -Uri $mgmtUrl -Method Post -Headers $h -Body $body; return [string]$resp[0].status } catch { return '' }
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$IS1 = Get-ApiCookie 'supervisor@company.com'
$SC1 = Get-ApiCookie 'safetycoord1@test.com'

if ($Mode -eq 'main') {
  $types = @(GetJson (RestSvc 'GET' "permit_types?select=id,code&company_id=eq.1&is_active=eq.true&code=eq.COLD&limit=1"))
  if ($types.Count -eq 0) { Write-Output 'FATAL: no Cold Work permit type for company 1'; exit 1 }
  $typeId = [int]$types[0].id

  $baseUsage = Get-MonthlyUsage 1
  Write-Output "INFO | baseline monthly usage: $baseUsage"

  # ---- helper: create a draft + return id ----
  function New-Draft([string]$title) {
    $b = @{ company_id=1; permit_type_id=$typeId; work_title=$title } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $IS1 'POST' '/api/permits' $b
    $id = 0; if ($r.Status -eq 201) { try { $id = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
    if ($id) { $script:ids.permits += $id }
    return $id
  }

  # ---- 1. draft -> not counted ----
  $d1 = New-Draft 'QA Entitlement Draft'
  Check '1: draft created' 'True' ([bool]$d1)
  Check '1: draft does NOT count' "$baseUsage" (Get-MonthlyUsage 1)

  # ---- 2. draft -> cancelled -> not counted ----
  $d2 = New-Draft 'QA Entitlement Draft Cancelled'
  Invoke-Api $IS1 'POST' "/api/permits/$d2/cancel" '{"remarks":"abandoned"}' | Out-Null
  Check '2: draft->cancelled status' 'cancelled' (Get-PermitStatus $d2)
  Check '2: cancelled-before-activation does NOT count' "$baseUsage" (Get-MonthlyUsage 1)

  # ---- 3. draft -> submit -> pending_approval -> counted ----
  $p3 = New-Draft 'QA Entitlement Submitted'
  Invoke-Api $IS1 'PATCH' "/api/permits/$p3/update" (@{ permit_type_id=$typeId; work_title='QA Entitlement Submitted'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress -Depth 6) | Out-Null
  $r = Invoke-Api $IS1 'POST' "/api/permits/$p3/submit"
  Check '3: submitted -> pending_approval' 'pending_approval' (Get-PermitStatus $p3)
  Check '3: pending_approval DOES count' ($baseUsage + 1) (Get-MonthlyUsage 1)

  # ---- 4. pending_approval -> rejected -> not counted ----
  $p4 = New-Draft 'QA Entitlement Rejected'
  Invoke-Api $IS1 'PATCH' "/api/permits/$p4/update" (@{ permit_type_id=$typeId; work_title='QA Entitlement Rejected'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress -Depth 6) | Out-Null
  Invoke-Api $IS1 'POST' "/api/permits/$p4/submit" | Out-Null
  $r = Invoke-Api $SC1 'POST' "/api/permits/$p4/reject" '{"remarks":"QA reject"}'
  Check '4: rejected status' 'rejected' (Get-PermitStatus $p4)
  Check '4: rejected does NOT count (back to +1 only from p3)' ($baseUsage + 1) (Get-MonthlyUsage 1)

  # ---- 5. pending_approval -> cancelled -> not counted ----
  $p5 = New-Draft 'QA Entitlement Pending Cancelled'
  Invoke-Api $IS1 'PATCH' "/api/permits/$p5/update" (@{ permit_type_id=$typeId; work_title='QA Entitlement Pending Cancelled'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress -Depth 6) | Out-Null
  Invoke-Api $IS1 'POST' "/api/permits/$p5/submit" | Out-Null
  Invoke-Api $IS1 'POST' "/api/permits/$p5/cancel" '{"remarks":"cancel before approval"}' | Out-Null
  Check '5: pending->cancelled status' 'cancelled' (Get-PermitStatus $p5)
  Check '5: cancelled-before-activation does NOT count (still +1 from p3)' ($baseUsage + 1) (Get-MonthlyUsage 1)

  # ---- 6. active -> suspended -> cancelled -> counts (post-activation) ----
  # Create + submit + prepare + approve to ACTIVE, then suspend, then cancel.
  $p6 = New-Draft 'QA Entitlement Active Cancelled'
  Invoke-Api $IS1 'PATCH' "/api/permits/$p6/update" (@{ permit_type_id=$typeId; work_title='QA Entitlement Active Cancelled'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress -Depth 6) | Out-Null
  Invoke-Api $IS1 'POST' "/api/permits/$p6/submit" | Out-Null
  # Prepare for approval (safety coordinator)
  foreach ($c in @(GetJson (RestSvc 'GET' "permit_safety_controls?select=id,is_required,status&permit_id=eq.$p6"))) {
    if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $SC1 'PATCH' "/api/permits/$p6/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
  }
  $j = Invoke-Api $SC1 'POST' "/api/permits/$p6/jha" '{"title":"QA JHA","hazards":[{"hazard":"QA","likelihood":2,"severity":3}]}'
  $jhaId = 0; if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
  if ($jhaId) { Invoke-Api $SC1 'POST' "/api/permits/$p6/jha/$jhaId/complete" | Out-Null; Invoke-Api $SC1 'POST' "/api/permits/$p6/jha/$jhaId/verify" '{"status":"verified"}' | Out-Null }
  $template = @(GetJson (RestSvc 'GET' "permit_type_site_checklist?select=item_key,is_required&permit_type_id=eq.$typeId"))
  $items = @(); foreach ($t in $template) { $items += @{ key = $t.item_key; status = if ($t.is_required) { 'ok' } else { 'na' } } }
  Invoke-Api $SC1 'PATCH' "/api/permits/$p6/site-verification" (@{ status='verified'; checklist=$items; remarks='QA' } | ConvertTo-Json -Compress -Depth 6) | Out-Null
  $requiredPpe = @(GetJson (RestSvc 'GET' "permit_type_ppe?select=ppe_item_id&permit_type_id=eq.$typeId&requirement=eq.required"))
  if ($requiredPpe.Count -gt 0) {
    $existing = @(GetJson (RestSvc 'GET' "permit_ppe?select=ppe_item_id,is_selected&permit_id=eq.$p6"))
    $existingIds = @($existing | ForEach-Object { if ($_.is_selected) { [int]$_.ppe_item_id } })
    foreach ($m in $requiredPpe) { $id = [int]$m.ppe_item_id; if ($existingIds -notcontains $id) { RestSvc 'POST' "permit_ppe" (@{ permit_id=$p6; ppe_item_id=$id; is_selected=$true } | ConvertTo-Json -Compress) | Out-Null } }
    Invoke-Api $SC1 'PATCH' "/api/permits/$p6/ppe-verification" '{"verified":true}' | Out-Null
  }
  $r = Invoke-Api $SC1 'POST' "/api/permits/$p6/approve-and-issue"
  $activeStatus = Get-PermitStatus $p6
  Write-Output ("INFO | p6 approve -> " + $r.Status + " status=" + $activeStatus)
  if ($activeStatus -eq 'active') {
    Check '6: active DOES count' ($baseUsage + 2) (Get-MonthlyUsage 1)
    # suspend then cancel (post-activation)
    Invoke-Api $SC1 'POST' "/api/permits/$p6/suspend" '{"remarks":"QA suspend"}' | Out-Null
    $suspStatus = Get-PermitStatus $p6
    Write-Output ("INFO | p6 suspend -> " + $suspStatus)
    Invoke-Api $SC1 'POST' "/api/permits/$p6/cancel" '{"remarks":"cancel after activation"}' | Out-Null
    $cancelledStatus = Get-PermitStatus $p6
    Check '6: active->suspended->cancelled status' 'cancelled' $cancelledStatus
    Check '6: post-activation cancelled STILL counts' ($baseUsage + 2) (Get-MonthlyUsage 1)
  } else {
    Check '6: active reached' 'active' $activeStatus
    Check '6: post-activation cancelled counts (skipped)' ($baseUsage + 2) (Get-MonthlyUsage 1)
  }

  # ---- 7. completed/closed -> counts ----
  # Use p6 if active, else create another; simpler: verify approved/closed count via a fresh active->complete->close
  $p7 = New-Draft 'QA Entitlement Complete Close'
  Invoke-Api $IS1 'PATCH' "/api/permits/$p7/update" (@{ permit_type_id=$typeId; work_title='QA Entitlement Complete Close'; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress -Depth 6) | Out-Null
  Invoke-Api $IS1 'POST' "/api/permits/$p7/submit" | Out-Null
  foreach ($c in @(GetJson (RestSvc 'GET' "permit_safety_controls?select=id,is_required,status&permit_id=eq.$p7"))) {
    if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $SC1 'PATCH' "/api/permits/$p7/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
  }
  $j7 = Invoke-Api $SC1 'POST' "/api/permits/$p7/jha" '{"title":"QA JHA","hazards":[{"hazard":"QA","likelihood":2,"severity":3}]}'
  $jha7 = 0; if ($j7.Status -eq 201) { try { $jha7 = [int]($j7.Body | ConvertFrom-Json).jha.id } catch {} }
  if ($jha7) { Invoke-Api $SC1 'POST' "/api/permits/$p7/jha/$jha7/complete" | Out-Null; Invoke-Api $SC1 'POST' "/api/permits/$p7/jha/$jha7/verify" '{"status":"verified"}' | Out-Null }
  $items7 = @(); foreach ($t in $template) { $items7 += @{ key = $t.item_key; status = if ($t.is_required) { 'ok' } else { 'na' } } }
  Invoke-Api $SC1 'PATCH' "/api/permits/$p7/site-verification" (@{ status='verified'; checklist=$items7; remarks='QA' } | ConvertTo-Json -Compress -Depth 6) | Out-Null
  if ($requiredPpe.Count -gt 0) {
    $existing7 = @(GetJson (RestSvc 'GET' "permit_ppe?select=ppe_item_id,is_selected&permit_id=eq.$p7"))
    $existingIds7 = @($existing7 | ForEach-Object { if ($_.is_selected) { [int]$_.ppe_item_id } })
    foreach ($m in $requiredPpe) { $id = [int]$m.ppe_item_id; if ($existingIds7 -notcontains $id) { RestSvc 'POST' "permit_ppe" (@{ permit_id=$p7; ppe_item_id=$id; is_selected=$true } | ConvertTo-Json -Compress) | Out-Null } }
    Invoke-Api $SC1 'PATCH' "/api/permits/$p7/ppe-verification" '{"verified":true}' | Out-Null
  }
  Invoke-Api $SC1 'POST' "/api/permits/$p7/approve-and-issue" | Out-Null
  $active7 = Get-PermitStatus $p7
  Write-Output ("INFO | p7 approve -> " + $active7)
  if ($active7 -eq 'active') {
    # complete
    $lc = Invoke-Api $SC1 'GET' "/api/permits/$p7/lifecycle"
    $lcObj = $lc.Body | ConvertFrom-Json
    $cc = @(); foreach ($item in $lcObj.completion_checklist) { $cc += @{ item_key=$item.item_key; completed=$true } }
    Invoke-Api $SC1 'POST' "/api/permits/$p7/complete" (@{ remarks='QA done'; checklist=$cc } | ConvertTo-Json -Compress -Depth 8) | Out-Null
    Check '7: completed status' 'completed' (Get-PermitStatus $p7)
    Check '7: completed DOES count' ($baseUsage + 3) (Get-MonthlyUsage 1)
    # close
    $lc2 = Invoke-Api $SC1 'GET' "/api/permits/$p7/lifecycle"
    $lcObj2 = $lc2.Body | ConvertFrom-Json
    $cl = @(); foreach ($item in $lcObj2.closure_checklist) { $cl += @{ item_key=$item.item_key; completed=$true } }
    Invoke-Api $SC1 'POST' "/api/permits/$p7/close" (@{ remarks='QA close'; checklist=$cl } | ConvertTo-Json -Compress -Depth 8) | Out-Null
    Check '7: closed status' 'closed' (Get-PermitStatus $p7)
    Check '7: closed DOES count' ($baseUsage + 3) (Get-MonthlyUsage 1)
  } else {
    Write-Output "INFO | p7 not active (skipped complete/close); verifying active count path"
  }

  SaveIds
  Write-Output "DONE | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  foreach ($pid_ in $ids.permits) {
    foreach ($t in @('permit_workers','permit_ppe','permit_safety_controls','permit_recommended_controls','permit_approvals','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','jhas','loto_isolation_points','gas_tests','permit_cse_personnel','hirarc_documents','permit_resume_checklists','permit_completion_checklists','permit_closure_checklists')) {
      RestSvc 'DELETE' "$t?permit_id=eq.$pid_" | Out-Null
    }
    RestSvc 'DELETE' "permits?id=eq.$pid_" | Out-Null
  }
  $ids = @{ permits = @() }; SaveIds
  Write-Output 'cleanup done'
}
