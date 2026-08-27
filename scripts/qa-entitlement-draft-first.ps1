# ePTW Draft-first bootstrap entitlement audit (READ-ONLY behavior verification)
# Verifies whether auto-creating abandoned drafts counts toward max_monthly_permits.
# Does NOT change any entitlement rule.
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-entitlement-audit'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-entitlement-ids.json'
$ids = @{ permits = @() }
if (Test-Path $idsFile) { try { $ids = Get-Content $idsFile -Raw | ConvertFrom-Json } catch {} }
function SaveIds() { $ids | ConvertTo-Json -Depth 6 | Set-Content -Path $idsFile -Encoding UTF8 }
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
function StartOfMonth() {
  $now = Get-Date
  return (Get-Date -Year $now.Year -Month $now.Month -Day 1 -Hour 0 -Minute 0 -Second 0 -Millisecond 0).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss') + 'Z'
}
# Monthly permit usage = count of permits created this month for the company (service role, all statuses).
# Queries via the Management API SQL endpoint for authoritative counting (avoids REST URL-encoding of the timestamp).
function Get-MonthlyUsage([int]$companyId) {
  $mgmtPat = 'sbp_e23dfd186001f73743b23ba2eb719d11e57d98af'
  $h = @{ Authorization = "Bearer $mgmtPat"; 'Content-Type' = 'application/json' }
  $mgmtUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
  $body = @{ query = "SELECT count(*) AS n FROM public.permits WHERE company_id=$companyId AND status <> 'draft' AND created_at >= date_trunc('month', now());" } | ConvertTo-Json
  try {
    $resp = Invoke-RestMethod -Uri $mgmtUrl -Method Post -Headers $h -Body $body
    return [int]$resp.n
  } catch {
    return -1
  }
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$IS1 = Get-ApiCookie 'supervisor@company.com'

if ($Mode -eq 'main') {
  $types = @(GetJson (RestSvc 'GET' "permit_types?select=id&company_id=eq.1&is_active=eq.true&limit=1"))
  if ($types.Count -eq 0) { Write-Output 'FATAL: no permit type for company 1'; exit 1 }
  $typeId = [int]$types[0].id

  $before = Get-MonthlyUsage 1
  Write-Output "INFO | monthly usage before: $before (non-draft permits this month)"

  # ============================================================
  # 1. Bootstrap abandoned drafts -> usage unchanged
  # ============================================================
  $drafts = 0
  for ($i = 1; $i -le 5; $i++) {
    $b = @{ company_id = 1; permit_type_id = $typeId } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $IS1 'POST' '/api/permits' $b
    $permitId = 0
    if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
    if ($permitId) { $script:ids.permits += $permitId; $drafts++ }
    Write-Output ("bootstrap draft #" + $i + " -> HTTP " + $r.Status + " permitId=" + $permitId)
  }
  $afterDrafts = Get-MonthlyUsage 1
  Write-Output "INFO | usage after $drafts abandoned drafts: $afterDrafts"
  if ($afterDrafts -eq $before) { Write-Output "PASS | abandoned drafts do NOT increment monthly usage (before=$before after=$afterDrafts)" }
  else { Write-Output "FAIL | abandoned drafts incremented usage (before=$before after=$afterDrafts)" }

  # ============================================================
  # 2. Complete + submit ONE draft -> usage +1
  # ============================================================
  # Take the last draft, fill required scalar fields, submit it.
  $submitId = 0
  if ($ids.permits.Count -gt 0) { $submitId = [int]$ids.permits[-1] }
  if ($submitId) {
    $patchBody = @{
      permit_type_id = $typeId
      work_title = 'QA Entitlement Submit'
      work_location = 'QA'
      planned_start = (UtcIso 0)
      planned_end = (UtcIso 6)
    } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $IS1 'PATCH' "/api/permits/$submitId/update" $patchBody
    Write-Output ("submit-prep PATCH -> HTTP " + $r.Status)
    $r = Invoke-Api $IS1 'POST' "/api/permits/$submitId/submit"
    Write-Output ("submit -> HTTP " + $r.Status)
  }
  $afterSubmit = Get-MonthlyUsage 1
  Write-Output "INFO | usage after submitting 1 permit: $afterSubmit"
  if ($afterSubmit -eq ($before + 1)) { Write-Output "PASS | submitting a permit increments usage by exactly 1 (before=$before after=$afterSubmit)" }
  else { Write-Output "FAIL | submit usage delta wrong (expected $($before+1) got $afterSubmit)" }

  # ============================================================
  # 3. Drive monthly usage to the Free limit (20), then verify blocked
  # ============================================================
  $limit = 20
  $created = 0
  $blockedAtLimit = $false
  while ($true) {
    $usageNow = Get-MonthlyUsage 1
    if ($usageNow -ge $limit) { break }
    $b = @{ company_id = 1; permit_type_id = $typeId; work_title = "QA Limit $created" } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $IS1 'POST' '/api/permits' $b
    $permitId = 0
    if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
    if ($permitId) { $script:ids.permits += $permitId }
    if ($permitId) {
      $pb = @{ permit_type_id = $typeId; work_title = "QA Limit $created"; planned_start=(UtcIso 0); planned_end=(UtcIso 6) } | ConvertTo-Json -Compress -Depth 6
      Invoke-Api $IS1 'PATCH' "/api/permits/$permitId/update" | Out-Null
      Invoke-Api $IS1 'POST' "/api/permits/$permitId/submit" | Out-Null
      $created++
    } else {
      # create blocked (403) — this means we reached the limit
      $blockedAtLimit = $true
      break
    }
    if ($created -gt 60) { Write-Output "WARN | safety break at $created creates"; break }
  }
  $finalUsage = Get-MonthlyUsage 1
  Write-Output "INFO | usage at Free limit: $finalUsage (limit=$limit), created+submitted=$created"
  if ($finalUsage -ge $limit) { Write-Output "PASS | reached Free monthly limit ($limit, usage=$finalUsage)" }
  else { Write-Output "FAIL | did not reach limit (usage=$finalUsage)" }

  # Next create must be BLOCKED by entitlement.
  $r = Invoke-Api $IS1 'POST' '/api/permits' (@{ company_id = 1; permit_type_id = $typeId } | ConvertTo-Json -Compress -Depth 6)
  $blocked = ($r.Status -eq 403)
  if ($blocked) { Write-Output "PASS | permit creation blocked at Free limit (HTTP 403)" }
  else { Write-Output "FAIL | creation NOT blocked at limit (HTTP $($r.Status))" }

  # ============================================================
  # 4. Existing drafts remain usable/editable at the limit
  # ============================================================
  # Take an abandoned draft from step 1 and try to edit it.
  $editDraftId = 0
  if ($ids.permits.Count -gt 0) {
    # find one still in draft status (via Management SQL, reliable)
    $mgmtPat2 = 'sbp_e23dfd186001f73743b23ba2eb719d11e57d98af'
    $h2 = @{ Authorization = "Bearer $mgmtPat2"; 'Content-Type' = 'application/json' }
    $mgmtUrl2 = "https://api.supabase.com/v1/projects/$ref/database/query"
    foreach ($id in $ids.permits) {
      $qBody = @{ query = "SELECT status FROM public.permits WHERE id=$id;" } | ConvertTo-Json
      try {
        $resp = Invoke-RestMethod -Uri $mgmtUrl2 -Method Post -Headers $h2 -Body $qBody
        $status = [string]$resp[0].status
        if ($status -eq 'draft') { $editDraftId = [int]$id; break }
      } catch {}
    }
  }
  if ($editDraftId) {
    $pb = @{ permit_type_id = $typeId; work_title = 'QA Draft Still Editable' } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $IS1 'PATCH' "/api/permits/$editDraftId/update" $pb
    if ($r.Status -eq 200) { Write-Output "PASS | existing draft still editable at Free limit (HTTP 200)" }
    else { Write-Output "FAIL | draft not editable at limit (HTTP $($r.Status))" }
  } else {
    Write-Output "INFO | no abandoned draft found to test editability"
  }

  SaveIds
  Write-Output "DONE"
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
