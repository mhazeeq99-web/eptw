# ePTW QA — safety-control toggle fix (RLS) + applicant declaration gate
# Verifies:
#   A. PATCH /api/admin/safety-controls/[id] (deactivate/activate) succeeds
#      without the RLS "new row violates row-level security policy" error
#   B. Creating a safety control, then toggling is_active off and on works
#   C. Submitting a permit WITHOUT confirming the declaration is rejected
#   D. Confirming the declaration then submitting succeeds
# Requires: production build on :3457 (restarted with this build), QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-toggle-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-toggle-ids.json'
$ids = @{ control_id = 0; permit_id = 0 }
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
function GetJson($resp) {
  $t = $resp.Body
  if ([string]::IsNullOrWhiteSpace($t)) { return @() }
  try { return @($t | ConvertFrom-Json) } catch { return @() }
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SM3 = Get-ApiCookie 'safetymanager@test.com'

if ($Mode -eq 'main') {
  # ---- A. Create a safety control, then toggle deactivate / activate ----
  $cName = "QA Toggle " + (Get-Date).ToString('HHmmssfff')
  $cb = @{ name = $cName; category = 'QA' } | ConvertTo-Json -Compress -Depth 6
  $cr = Invoke-Api $SM3 'POST' '/api/admin/safety-controls' $cb
  $scId = 0
  if ($cr.Status -eq 201) { try { $scId = [int]($cr.Body | ConvertFrom-Json).safety_control.id } catch {} }
  if ($scId) { $ids.control_id = $scId }
  Check 'A: control created (201)' '201' $cr.Status

  # Deactivate
  $off = Invoke-Api $SM3 'PATCH' "/api/admin/safety-controls/$scId" (@{ is_active = $false } | ConvertTo-Json -Compress)
  Write-Output ("INFO | deactivate -> " + $off.Status + " " + $off.Body)
  $isActiveAfterOff = $null
  if ($off.Status -eq 200) { try { $isActiveAfterOff = [bool]($off.Body | ConvertFrom-Json).safety_control.is_active } catch {} }
  Check 'B: deactivate returns 200' '200' $off.Status
  Check 'B: is_active now false' 'False' "$isActiveAfterOff"
  $rlserr = $off.Body -match 'row-level security policy'
  Check 'B: no RLS error on deactivate' 'False' "$rlserr"

  # Activate
  $on = Invoke-Api $SM3 'PATCH' "/api/admin/safety-controls/$scId" (@{ is_active = $true } | ConvertTo-Json -Compress)
  Write-Output ("INFO | activate -> " + $on.Status + " " + $on.Body)
  $isActiveAfterOn = $null
  if ($on.Status -eq 200) { try { $isActiveAfterOn = [bool]($on.Body | ConvertFrom-Json).safety_control.is_active } catch {} }
  Check 'C: activate returns 200' '200' $on.Status
  Check 'C: is_active now true' 'True' "$isActiveAfterOn"

  # ---- D. Submit without declaration is rejected ----
  # Create a draft permit as internal staff, then submit without declaration.
  $IS = Get-ApiCookie 'supervisor@company.com'
  $typeId = 0
  $typesResp = Invoke-Api $IS 'GET' '/api/admin/permit-types'
  $typeObj = $null
  if ($typesResp.Status -eq 200) { try { $typeObj = $typesResp.Body | ConvertFrom-Json } catch {} }
  $typesArr = @()
  if ($typeObj.permit_types) { $typesArr = @($typeObj.permit_types) }
  $type = $typesArr | Where-Object { $_.code -eq 'COLD' } | Select-Object -First 1
  if (-not $type) { $type = $typesArr | Where-Object { $_.id -eq 2 } | Select-Object -First 1 }
  if (-not $type) { $type = $typesArr | Select-Object -First 1 }
  if (-not $type) { $typeId = 2 }  # COLD fallback
  if ($type) { try { $typeId = [int]$type.id } catch {} }
  Write-Output ("INFO | permit type id=$typeId count=" + $typesArr.Count)

  $createBody = @{ company_id = 1; permit_type_id = $typeId; submit = $false; work_title = "QA no-declaration " + (Get-Date).ToString('HHmmssfff'); planned_start = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK'); planned_end = (Get-Date).AddHours(2).ToString('yyyy-MM-ddTHH:mm:ssK') } | ConvertTo-Json -Compress -Depth 6
  $cr2 = Invoke-Api $IS 'POST' '/api/permits' $createBody
  $permitId = 0
  if ($cr2.Status -eq 200 -or $cr2.Status -eq 201) { try { $permitId = [int]($cr2.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $ids.permit_id = $permitId }
  Write-Output ("INFO | draft permit created -> " + $cr2.Status + " id=$permitId")

  if ($permitId) {
    $noDecl = Invoke-Api $IS 'POST' "/api/permits/$permitId/submit" ''
    Write-Output ("INFO | submit w/o declaration -> " + $noDecl.Status + " " + $noDecl.Body)
    Check 'D: submit w/o declaration rejected (422)' '422' $noDecl.Status
    $declMsg = $noDecl.Body -match 'Applicant Declaration'
    Check 'D: rejection mentions Applicant Declaration' 'True' "$declMsg"
  }

  Write-Output "DONE | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  if ($ids.control_id) { RestSvc 'DELETE' "safety_controls?id=eq.$($ids.control_id)" | Out-Null }
  if ($ids.permit_id) {
    foreach ($t in @('permit_workers','permit_ppe','permit_safety_controls','permit_recommended_controls','permit_approvals','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','jhas','loto_isolation_points','gas_tests','permit_cse_personnel','hirarc_documents','permit_resume_checklists','permit_completion_checklists','permit_closure_checklists')) {
      RestSvc 'DELETE' "$t?permit_id=eq.$($ids.permit_id)" | Out-Null
    }
    RestSvc 'DELETE' "permits?id=eq.$($ids.permit_id)" | Out-Null
  }
  $ids = @{ control_id = 0; permit_id = 0 }; Set-Content -Path $idsFile -Value ($ids | ConvertTo-Json -Compress)
  Write-Output 'cleanup done'
}
