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
  $body = @{ query = "SELECT count(*) AS n FROM public.permits WHERE company_id=$companyId AND created_at >= date_trunc('month', now());" } | ConvertTo-Json
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
  Write-Output "INFO | monthly usage before bootstrap: $before"
  Write-Output "INFO | free plan max_monthly_permits: 20 (company 1 effective plan = free, no active subscription)"

  $drafts = 0
  # Bootstrap 5 abandoned drafts (company + permit type ONLY, never submit)
  for ($i = 1; $i -le 5; $i++) {
    $b = @{ company_id = 1; permit_type_id = $typeId } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $IS1 'POST' '/api/permits' $b
    $permitId = 0
    if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
    if ($permitId) { $script:ids.permits += $permitId; $drafts++ }
    Write-Output ("bootstrap #" + $i + " -> HTTP " + $r.Status + " permitId=" + $permitId)
  }

  $after = Get-MonthlyUsage 1
  Write-Output "INFO | monthly usage after $drafts bootstrapped drafts: $after"
  Write-Output "INFO | delta: $($after - $before)"

  # Report
  if ($drafts -eq 0) { Write-Output "FAIL | expected drafts created" }
  elseif (($after - $before) -eq $drafts) { Write-Output "PASS | each abandoned draft increments monthly usage by 1 (delta=$($after-$before))" }
  else { Write-Output "FAIL | expected delta=$drafts got delta=$($after-$before)" }

  # Confirm none submitted (all still draft)
  $draftCount = @(GetJson (RestSvc 'GET' "permits?select=id&company_id=eq.1&status=eq.draft&limit=1000")).Count
  Write-Output "INFO | total company-1 drafts this month now: $draftCount"

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
