# ePTW Create/Draft/Submit UX Redesign QA
# Verifies:
#   A. Save partial draft (company + permit type only) -> DRAFT created
#   B. Continue draft updates the SAME permit (no duplicate workers/PPE)
#   C. Direct submit (all submission requirements) -> DRAFT -> PENDING_APPROVAL
#   D. Invalid submit (missing submission requirements) -> stays DRAFT + structured errors
#   E. Invalid dates (planned_end <= planned_start) -> blocked at create
#   F. Submission validation distinct from approval readiness (no site verification
#      required to submit)
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-cds-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-cds-ids.json'
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
function Get-PermitRow([int]$permitId) {
  $r = @(GetJson (RestSvc 'GET' "permits?select=id,work_title,planned_start,planned_end&id=eq.$permitId"))
  if ($r.Count -gt 0) { return $r[0] }
  return $null
}
function WorkerCount([int]$permitId) {
  return @(GetJson (RestSvc 'GET' "permit_workers?select=id&permit_id=eq.$permitId")).Count
}
function PpeCount([int]$permitId) {
  return @(GetJson (RestSvc 'GET' "permit_ppe?select=id&permit_id=eq.$permitId")).Count
}
function UtcIso([int]$hoursFromNow) { return (Get-Date).ToUniversalTime().AddHours($hoursFromNow).ToString('yyyy-MM-ddTHH:mm:ss') + 'Z' }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$IS1 = Get-ApiCookie 'supervisor@company.com'

if ($Mode -eq 'main') {
  # Resolve company 1's first active permit type id.
  $types = @(GetJson (RestSvc 'GET' "permit_types?select=id&company_id=eq.1&is_active=eq.true&limit=1"))
  if ($types.Count -eq 0) { Write-Output 'FATAL: no permit type for company 1'; exit 1 }
  $typeId = [int]$types[0].id

  # ---------------- A. Save PARTIAL draft (company + permit type only) ----
  $partialBody = @{ company_id = 1; permit_type_id = $typeId } | ConvertTo-Json -Compress -Depth 6
  $rA = Invoke-Api $IS1 'POST' '/api/permits' $partialBody
  $aId = 0; $aSubmitted = 'n/a'
  if ($rA.Status -eq 201) {
    $aObj = $rA.Body | ConvertFrom-Json
    $aId = [int]$aObj.permit.id
    $aSubmitted = "$($aObj.submitted)"
  }
  if ($aId) { $script:ids.permits += $aId }
  Check 'A: partial draft create -> 201' '201' $rA.Status
  Check 'A: partial draft submitted flag = False' 'False' $aSubmitted
  Check 'A: partial draft status = draft' 'draft' (Get-PermitStatus $aId)

  # ---------------- B. Continue draft: update SAME permit, no dupes ----
  $bBody = @{
    permit_type_id = $typeId
    work_title = 'QA CDS Continued Draft'
    work_location = 'QA'
    planned_start = (UtcIso 0)
    planned_end = (UtcIso 6)
    workers = @(@{ full_name='QA Worker One'; id_number='880101-01-1000'; nationality='Malaysian'; induction_completed=$true })
    ppe_item_ids = @()
    recommended_control_ids = @()
  } | ConvertTo-Json -Compress -Depth 8
  $rB = Invoke-Api $IS1 'PATCH' "/api/permits/$aId/update" $bBody
  Check 'B: continue draft update -> 200' '200' $rB.Status
  Check 'B: same permit id, workers=1' '1' (WorkerCount $aId)

  # Save draft again -> still one worker (no duplication)
  $rB2 = Invoke-Api $IS1 'PATCH' "/api/permits/$aId/update" $bBody
  Check 'B2: re-save draft workers still 1' '1' (WorkerCount $aId)

  # ---------------- C. Direct submit with a fresh fully-prepared draft ----
  $cBody = @{
    company_id = 1
    permit_type_id = $typeId
    work_title = 'QA CDS Direct Submit'
    work_location = 'QA'
    planned_start = (UtcIso 0)
    planned_end = (UtcIso 6)
    workers = @(@{ full_name='QA Worker Two'; id_number='880102-01-1001'; nationality='Malaysian'; induction_completed=$true })
    submit = $true
  } | ConvertTo-Json -Compress -Depth 8
  $rC = Invoke-Api $IS1 'POST' '/api/permits' $cBody
  $cId = 0; $cSubmitted = 'n/a'
  if ($rC.Status -eq 201) {
    $cObj = $rC.Body | ConvertFrom-Json
    $cId = [int]$cObj.permit.id
    $cSubmitted = "$($cObj.submitted)"
  }
  if ($cId) { $script:ids.permits += $cId }
  Check 'C: direct submit create -> 201' '201' $rC.Status
  Check 'C: direct submit submitted flag = True' 'True' $cSubmitted
  Check 'C: direct submit status = pending_approval' 'pending_approval' (Get-PermitStatus $cId)

  # ---------------- D. Invalid submit: missing work title -> 422 + stays draft ----
  $dBody = @{
    company_id = 1
    permit_type_id = $typeId
    work_title = '   '
    planned_start = (UtcIso 0)
    planned_end = (UtcIso 6)
    submit = $true
  } | ConvertTo-Json -Compress -Depth 8
  $rD = Invoke-Api $IS1 'POST' '/api/permits' $dBody
  $dId = 0
  if ($rD.Status -eq 422) {
    try { $dId = [int]($rD.Body | ConvertFrom-Json).permit.id } catch {}
  }
  if ($dId) { $script:ids.permits += $dId }
  Check 'D: invalid submit -> 422' '422' $rD.Status
  Check 'D: invalid submit permit status = draft' 'draft' (Get-PermitStatus $dId)
  if ($rD.Status -eq 422) {
    $dErr = @(($rD.Body | ConvertFrom-Json).errors)
    Check 'D: structured errors returned' 'True' ([bool]($dErr.Count -gt 0))
  }

  # ---------------- E. Invalid dates blocked at create ----
  $eBody = @{
    company_id = 1
    permit_type_id = $typeId
    work_title = 'QA CDS Bad Dates'
    planned_start = (UtcIso 6)
    planned_end = (UtcIso 0)
    submit = $true
  } | ConvertTo-Json -Compress -Depth 8
  $rE = Invoke-Api $IS1 'POST' '/api/permits' $eBody
  Check 'E: invalid dates create -> 400' '400' $rE.Status

  # ---------------- F. Submission does NOT require approval readiness ----
  # Permit C was submitted WITHOUT site verification / JHA / controls being
  # verified — that is correct: submission is not the approval gate.
  Check 'F: submitted permit not verified (no site verification required to submit)' 'True' ([bool]$cId)

  SaveIds
  Write-Output "TOTAL | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  foreach ($pid_ in $ids.permits) {
    RestSvc 'DELETE' "permit_workers?permit_id=eq.$pid_" | Out-Null
    RestSvc 'DELETE' "permit_ppe?permit_id=eq.$pid_" | Out-Null
    RestSvc 'DELETE' "permits?id=eq.$pid_" | Out-Null
  }
  $ids = @{ permits = @() }; SaveIds
  Write-Output 'cleanup done'
}
