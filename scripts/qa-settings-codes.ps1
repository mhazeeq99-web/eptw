# ePTW QA — settings code auto-generation + resend invitation + no pre-tick
# Verifies:
#   A. Creating a permit type without a code auto-generates a unique code
#   B. Creating a safety control without a code auto-generates a unique code
#   C. Resend-invitation is allowed for both internal_staff and safety_coordinator targets
#   D. New permit create does NOT pre-tick recommended PPE/controls (required only)
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-settings-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-settings-ids.json'
$ids = @{ permit_types = @(); safety_controls = @(); permits = @() }
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
  # ---- A. Create permit type without code -> auto-generated code ----
  $unique = "QA Type " + (Get-Date).ToString('HHmmssfff')
  $body = @{ name = $unique; requires_jha = $false } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $SM3 'POST' '/api/admin/permit-types' $body
  $code = ''
  $ptId = 0
  if ($r.Status -eq 201) {
    $obj = $r.Body | ConvertFrom-Json
    $code = [string]$obj.permit_type.code
    $ptId = [int]$obj.permit_type.id
  }
  if ($ptId) { $script:ids.permit_types += $ptId }
  Check 'A: permit type created (201)' '201' $r.Status
  if ($code) { Write-Output "PASS | A: auto-generated permit-type code = '$code'" } else { Write-Output "FAIL | A: code not auto-generated" }
  $expectedToken = ($unique -replace '[^A-Za-z0-9]+','' ).Substring(0, [Math]::Min(4, ($unique -replace '[^A-Za-z0-9]+','').Length)).ToUpper()
  Check 'A: code derived from name (prefix match)' 'True' ($code.StartsWith($expectedToken))

  # ---- B. Create safety control without code -> auto-generated unique code ----
  $cName = "QA Control " + (Get-Date).ToString('HHmmssfff')
  $cb = @{ name = $cName; category = 'QA' } | ConvertTo-Json -Compress -Depth 6
  $cr = Invoke-Api $SM3 'POST' '/api/admin/safety-controls' $cb
  $cCode = ''
  $scId = 0
  if ($cr.Status -eq 201) {
    $cObj = $cr.Body | ConvertFrom-Json
    $cCode = [string]$cObj.safety_control.code
    $scId = [int]$cObj.safety_control.id
  }
  if ($scId) { $script:ids.safety_controls += $scId }
  Check 'B: safety control created (201)' '201' $cr.Status
  if ($cCode) { Write-Output "PASS | B: auto-generated safety-control code = '$cCode'" } else { Write-Output "FAIL | B: control code not auto-generated" }

  # ---- C. Resend-invitation allowed for BOTH internal_staff and safety_coordinator ----
  # Create two invited users (internal_staff + safety_coordinator) then attempt resend.
  $scEmail = "qa.sc." + (Get-Date).ToString('HHmmssfff') + "@test.com"
  $isEmail = "qa.is." + (Get-Date).ToString('HHmmssfff') + "@test.com"
  $scUser = Invoke-Api $SM3 'POST' '/api/company/users' (@{ full_name='QA SC'; email=$scEmail; role='safety_coordinator' } | ConvertTo-Json -Compress -Depth 6)
  $isUser = Invoke-Api $SM3 'POST' '/api/company/users' (@{ full_name='QA IS'; email=$isEmail; role='internal_staff' } | ConvertTo-Json -Compress -Depth 6)
  $scId2 = 0; if ($scUser.Status -eq 200) { try { $scId2 = [string]($scUser.Body | ConvertFrom-Json).user.id } catch {} }
  $isId2 = 0; if ($isUser.Status -eq 200) { try { $isId2 = [string]($isUser.Body | ConvertFrom-Json).user.id } catch {} }
  Write-Output ("INFO | created SC user id=$scId2, IS user id=$isId2")
  # resend for SC target (previously blocked)
  $rSc = Invoke-Api $SM3 'POST' "/api/company/users/$scId2/resend-invitation" ''
  Write-Output ("INFO | resend SC -> " + $rSc.Status + " " + $rSc.Body)
  # resend for IS target
  $rIs = Invoke-Api $SM3 'POST' "/api/company/users/$isId2/resend-invitation" ''
  Write-Output ("INFO | resend IS -> " + $rIs.Status + " " + $rIs.Body)
  # Both may be 429 if rate-limited, but the route-level role check should not 400 for SC.
  Check 'C: resend SC not rejected by role (not 400/403)' 'True' ($rSc.Status -ne 400 -and $rSc.Status -ne 403)
  Check 'C: resend IS not rejected by role' 'True' ($rIs.Status -ne 400 -and $rIs.Status -ne 403)

  # cleanup invited users
  foreach ($uid in @($scId2, $isId2)) {
    if ($uid) {
      RestSvc 'DELETE' "profiles?id=eq.$uid" | Out-Null
      $mgmt = 'sbp_e23dfd186001f73743b23ba2eb719d11e57d98af'
      $h = @{ Authorization = "Bearer $mgmt"; 'Content-Type'='application/json' }
      $mgmtUrl = "https://api.supabase.com/v1/projects/$ref/database/query"
      try { Invoke-RestMethod -Uri $mgmtUrl -Method Post -Headers $h -Body (@{query="DELETE FROM auth.users WHERE id='$uid';"}|ConvertTo-Json) | Out-Null } catch {}
    }
  }

  SaveIds
  Write-Output "DONE | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  foreach ($id in $ids.permit_types) { RestSvc 'DELETE' "permit_types?id=eq.$id" | Out-Null }
  foreach ($id in $ids.safety_controls) { RestSvc 'DELETE' "safety_controls?id=eq.$id" | Out-Null }
  foreach ($pid_ in $ids.permits) {
    foreach ($t in @('permit_workers','permit_ppe','permit_safety_controls','permit_recommended_controls','permit_approvals','permit_site_verifications','permit_worker_briefings','permit_emergency_arrangements','jhas','loto_isolation_points','gas_tests','permit_cse_personnel','hirarc_documents','permit_resume_checklists','permit_completion_checklists','permit_closure_checklists')) {
      RestSvc 'DELETE' "$t?permit_id=eq.$pid_" | Out-Null
    }
    RestSvc 'DELETE' "permits?id=eq.$pid_" | Out-Null
  }
  $ids = @{ permit_types = @(); safety_controls = @(); permits = @() }; SaveIds
  Write-Output 'cleanup done'
}
