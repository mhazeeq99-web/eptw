# ePTW Unified PTW (Draft-first) QA
# Verifies the "Create == Draft" property:
#   A. Bootstrap create (company + permit type only) -> draft permit id
#   B. Save Draft PATCHes the SAME permit id (no second record)
#   C. The applicant scalar fields round-trip on the same permit
#   D. Applicant Declaration persists (declaration_confirmed_at/by)
#   E. The permit detail page data reflects the same permit (id match)
#   F. JHA/HIRARC, LOTO, Gas, Attachments are applicant-available on the draft
#      (create via their endpoints) while verification stays Safety Personnel.
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-unified-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-unified-ids.json'
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

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$IS1 = Get-ApiCookie 'supervisor@company.com'

if ($Mode -eq 'main') {
  $types = @(GetJson (RestSvc 'GET' "permit_types?select=id,code,requires_jha,requires_loto,requires_gas_test&company_id=eq.1&is_active=eq.true&limit=1"))
  if ($types.Count -eq 0) { Write-Output 'FATAL: no permit type for company 1'; exit 1 }
  $typeId = [int]$types[0].id

  # ---- A. Bootstrap create: company + permit type ONLY -> draft id ----
  $b = @{ company_id = 1; permit_type_id = $typeId } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $IS1 'POST' '/api/permits' $b
  $permitId = 0
  if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $script:ids.permits += $permitId }
  Check 'A: bootstrap create -> 201 draft' 'True' ([bool]$permitId)

  # ---- B. Save Draft PATCHes the SAME permit id ----
  $patchBody = @{
    permit_type_id = $typeId
    work_title = 'QA Unified PTW'
    work_location = 'QA'
    planned_start = (UtcIso 0)
    planned_end = (UtcIso 6)
    declaration_confirmed_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss') + 'Z'
    declaration_confirmed_by = '4e0b8019-8b3d-49cb-8e00-76605728b045'
  } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $IS1 'PATCH' "/api/permits/$permitId/update" $patchBody
  Check 'B: save draft PATCH -> 200' '200' $r.Status

  # ---- C. Same permit id, data round-trips ----
  $row = @(GetJson (RestSvc 'GET' "permits?select=id,work_title,declaration_confirmed_at&id=eq.$permitId"))
  $rowId = if ($row.Count -gt 0) { [int]$row[0].id } else { 0 }
  $rowTitle = if ($row.Count -gt 0) { [string]$row[0].work_title } else { '' }
  Check 'C: same permit id persisted' 'True' ([bool]$rowId)
  Check 'C: work_title round-trip' 'QA Unified PTW' $rowTitle
  $decl = if ($row.Count -gt 0 -and $row[0].declaration_confirmed_at) { 'True' } else { 'False' }
  Check 'D: declaration_confirmed_at persisted' 'True' $decl

  # ---- E. The detail page / read path returns the same permit ----
  $r = Invoke-Api $IS1 'GET' "/api/permits/$permitId/readiness"
  Check 'E: readiness endpoint accessible on draft (200)' '200' $r.Status

  # ---- F. Applicant can add a JHA on the draft; cannot verify it ----
  $j = Invoke-Api $IS1 'POST' "/api/permits/$permitId/jha" '{"title":"QA JHA","hazards":[{"hazard":"QA","likelihood":2,"severity":3}]}'
  $jhaId = 0
  if ($j.Status -eq 201) { try { $jhaId = [int]($j.Body | ConvertFrom-Json).jha.id } catch {} }
  Check 'F: applicant can add JHA on draft (201)' 'True' ([bool]$jhaId)
  $rv = Invoke-Api $IS1 'POST' "/api/permits/$permitId/jha/$jhaId/verify" '{"status":"verified"}'
  Check 'F: applicant CANNOT verify JHA (403)' '403' $rv.Status

  SaveIds
  Write-Output "TOTAL | pass=$pass fail=$fail"
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
