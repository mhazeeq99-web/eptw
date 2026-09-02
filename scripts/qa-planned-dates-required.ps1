# ePTW QA — planned start/end are REQUIRED before a permit can be submitted.
# Fix: previously planned dates were optional at submission time.
# Verifies:
#   A. Draft WITHOUT planned dates still saves (201, draft) — drafts may be partial.
#   B. Submit that draft -> 422 with planned_start + planned_end errors; stays draft.
#   C. Direct create-with-submit without dates -> 422 + permit stays draft.
#   D. After PATCHing valid dates (plus other submission fields) -> submit succeeds.
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-pdr-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-pdr-ids.json'
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
function Get-PermitStatus([int]$permitId) {
  $r = @(GetJson (RestSvc 'GET' "permits?select=status&id=eq.$permitId"))
  if ($r.Count -gt 0) { return [string]$r[0].status }
  return ''
}
function UtcIso([int]$hoursFromNow) { return (Get-Date).ToUniversalTime().AddHours($hoursFromNow).ToString('yyyy-MM-ddTHH:mm:ss') + 'Z' }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

# Company 3 internal staff (can create + submit internal permits).
$IS = Get-ApiCookie 'worksup@test.com'
# Company 3 non-specialised permit type (COLD = id 10 per company 3 seed).
$typeId = 10

if ($Mode -eq 'main') {
  # ---------------- A. Draft WITHOUT planned dates still saves --------------
  $aBody = @{
    company_id = 3
    permit_type_id = $typeId
    work_title = 'QA PDR no dates ' + (Get-Date).ToString('HHmmssfff')
    work_description = 'QA'
    work_location = 'QA'
    submit = $false
  } | ConvertTo-Json -Compress -Depth 6
  $rA = Invoke-Api $IS 'POST' '/api/permits' $aBody
  $aId = 0
  if ($rA.Status -eq 201) { try { $aId = [int]($rA.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($aId) { $script:ids.permits += $aId }
  Check 'A: draft without planned dates -> 201' '201' $rA.Status
  Check 'A: draft status = draft' 'draft' (Get-PermitStatus $aId)
  if (-not $aId) { Write-Output 'FATAL: no draft permit'; exit 1 }

  # ---------------- B. Submit draft w/o dates -> 422 + stays draft ---------
  $rB = Invoke-Api $IS 'POST' "/api/permits/$aId/submit"
  Check 'B: submit without dates -> 422' '422' $rB.Status
  Check 'B: permit stays draft' 'draft' (Get-PermitStatus $aId)
  $bMsgs = @()
  if ($rB.Status -eq 422) {
    $bMsgs = @(($rB.Body | ConvertFrom-Json).errors | ForEach-Object { "$($_.field):$($_.message)" })
    Write-Output ("INFO | B errors -> " + ($bMsgs -join ' | '))
  }
  Check 'B: planned_start error present' 'True' ([bool]($bMsgs | Where-Object { $_ -like 'planned_start:*' }))
  Check 'B: planned_end error present' 'True' ([bool]($bMsgs | Where-Object { $_ -like 'planned_end:*' }))

  # ---------------- C. Create-with-submit without dates -> 422 -------------
  $cBody = @{
    company_id = 3
    permit_type_id = $typeId
    work_title = 'QA PDR direct no dates ' + (Get-Date).ToString('HHmmssfff')
    work_description = 'QA'
    work_location = 'QA'
    submit = $true
  } | ConvertTo-Json -Compress -Depth 6
  $rC = Invoke-Api $IS 'POST' '/api/permits' $cBody
  $cId = 0
  if ($rC.Status -eq 422) { try { $cId = [int]($rC.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($cId) { $script:ids.permits += $cId }
  Check 'C: direct submit without dates -> 422' '422' $rC.Status
  if ($cId) { Check 'C: created-but-unsubmitted permit stays draft' 'draft' (Get-PermitStatus $cId) }

  # ---------------- D. Valid dates -> submit succeeds -----------------------
  $decl = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss') + 'Z'
  $dBody = @{
    permit_type_id = $typeId
    work_title = 'QA PDR with dates ' + (Get-Date).ToString('HHmmssfff')
    work_description = 'QA'
    work_location = 'QA'
    planned_start = (UtcIso 1)
    planned_end = (UtcIso 7)
    declaration_confirmed_at = $decl
  } | ConvertTo-Json -Compress -Depth 6
  $rD1 = Invoke-Api $IS 'PATCH' "/api/permits/$aId/update" $dBody
  Check 'D: PATCH dates -> 200' '200' $rD1.Status
  $rD2 = Invoke-Api $IS 'POST' "/api/permits/$aId/submit"
  Check 'D: submit with dates -> 200' '200' $rD2.Status
  if ($rD2.Status -eq 200) { Check 'D: permit status = pending_approval' 'pending_approval' (Get-PermitStatus $aId) }
  else { Write-Output ("INFO | D submit body -> " + $rD2.Body) }

  SaveIds
  Write-Output "TOTAL | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  foreach ($pid_ in $ids.permits) {
    RestSvc 'DELETE' "permit_workers?permit_id=eq.$pid_" | Out-Null
    RestSvc 'DELETE' "permit_safety_controls?permit_id=eq.$pid_" | Out-Null
    RestSvc 'DELETE' "permit_ppe?permit_id=eq.$pid_" | Out-Null
    RestSvc 'DELETE' "permit_approvals?permit_id=eq.$pid_" | Out-Null
    RestSvc 'DELETE' "permits?id=eq.$pid_" | Out-Null
  }
  $ids = @{ permits = @() }; SaveIds
  Write-Output 'cleanup done'
}
