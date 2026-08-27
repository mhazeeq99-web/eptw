# ePTW QA — safety verifier can add a safety control to a permit
# Verifies:
#   A. SM/SC can GET the addable catalogue for a permit
#   B. SM/SC can POST to add a control (201), which becomes required+pending
#   C. Non-verifier (internal staff) cannot add a control (403)
#   D. Adding the same control twice is rejected (400)
#   E. The added control can then be verified (pending -> verified)
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-addctrl-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-addctrl-ids.json'
$ids = @{ permit_id = 0; psc_id = 0; sc_id = 0 }
if (Test-Path $idsFile) { try { $ids = Get-Content $idsFile -Raw | ConvertFrom-Json } catch {} }
$pass = 0; $fail = 0
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

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SC = Get-ApiCookie 'safetycoord1@test.com'   # company 1
$IS = Get-ApiCookie 'supervisor@company.com'  # company 1 internal staff

if ($Mode -eq 'main') {
  # Create a draft permit (COLD, type id=2) for company 1 as internal staff.
  $createBody = @{ company_id = 1; permit_type_id = 2; submit = $false; work_title = "QA addctrl " + (Get-Date).ToString('HHmmssfff'); planned_start = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK'); planned_end = (Get-Date).AddHours(2).ToString('yyyy-MM-ddTHH:mm:ssK') } | ConvertTo-Json -Compress -Depth 6
  $cr = Invoke-Api $IS 'POST' '/api/permits' $createBody
  $permitId = 0
  if ($cr.Status -eq 201 -or $cr.Status -eq 200) { try { $permitId = [int]($cr.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $ids.permit_id = $permitId }
  Write-Output ("INFO | draft permit created -> " + $cr.Status + " id=$permitId")
  if (-not $permitId) { Write-Output 'FATAL: no permit'; exit 1 }

  # A. SC can GET the catalogue
  $cat = Invoke-Api $SC 'GET' "/api/permits/$permitId/safety-controls"
  $catCount = 0
  if ($cat.Status -eq 200) { try { $catCount = @(($cat.Body | ConvertFrom-Json).safety_controls).Count } catch {} }
  Check 'A: GET catalogue (200)' '200' $cat.Status
  Write-Output ("INFO | catalogue count=$catCount")
  Check 'A: catalogue non-empty' 'True' ($catCount -gt 0)

  # pick a control to add (first available)
  $scId = 0
  if ($catCount -gt 0) { try { $scId = [int](($cat.Body | ConvertFrom-Json).safety_controls[0].id) } catch {} }
  $ids.sc_id = $scId
  Write-Output ("INFO | add safety_control_id=$scId")

  # B. SC can add the control (201)
  $add = Invoke-Api $SC 'POST' "/api/permits/$permitId/safety-controls" (@{ safety_control_id = $scId } | ConvertTo-Json -Compress)
  Write-Output ("INFO | add -> " + $add.Status + " " + $add.Body)
  $pscId = 0
  if ($add.Status -eq 201) { try { $pscId = [int]($add.Body | ConvertFrom-Json).permit_safety_control.id } catch {} }
  $ids.psc_id = $pscId
  Check 'B: add control (201)' '201' $add.Status
  $isRequired = $false
  if ($add.Status -eq 201) { try { $isRequired = [bool]($add.Body | ConvertFrom-Json).permit_safety_control.is_required } catch {} }
  Check 'B: added control is required' 'True' "$isRequired"
  $isPending = $false
  if ($add.Status -eq 201) { try { $isPending = (($add.Body | ConvertFrom-Json).permit_safety_control.status -eq 'pending') } catch {} }
  Check 'B: added control status pending' 'True' "$isPending"

  # C. internal staff cannot add (403)
  $addIS = Invoke-Api $IS 'POST' "/api/permits/$permitId/safety-controls" (@{ safety_control_id = $scId } | ConvertTo-Json -Compress)
  Check 'C: internal staff add rejected (403)' '403' $addIS.Status

  # D. adding same control twice is rejected (400)
  $dup = Invoke-Api $SC 'POST' "/api/permits/$permitId/safety-controls" (@{ safety_control_id = $scId } | ConvertTo-Json -Compress)
  Check 'D: duplicate add rejected (400)' '400' $dup.Status

  # E. SC can verify the added control (pending -> verified)
  if ($pscId) {
    $ver = Invoke-Api $SC 'PATCH' "/api/permits/$permitId/safety-controls/$pscId/verify" '{}'
    Write-Output ("INFO | verify -> " + $ver.Status + " " + $ver.Body)
    Check 'E: verify added control (200)' '200' $ver.Status
    $verStatus = ''
    if ($ver.Status -eq 200) { try { $verStatus = [string]($ver.Body | ConvertFrom-Json).safety_control.status } catch {} }
    Check 'E: added control now verified' 'verified' $verStatus
  }

  Write-Output "DONE | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  if ($ids.permit_id) {
    foreach ($t in @('permit_workers','permit_ppe','permit_safety_controls','permit_recommended_controls','permit_approvals','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','jhas','loto_isolation_points','gas_tests','permit_cse_personnel','hirarc_documents','permit_resume_checklists','permit_completion_checklists','permit_closure_checklists')) {
      RestSvc 'DELETE' "$t?permit_id=eq.$($ids.permit_id)" | Out-Null
    }
    RestSvc 'DELETE' "permits?id=eq.$($ids.permit_id)" | Out-Null
  }
  $ids = @{ permit_id = 0; psc_id = 0; sc_id = 0 }; Set-Content -Path $idsFile -Value ($ids | ConvertTo-Json -Compress)
  Write-Output 'cleanup done'
}
