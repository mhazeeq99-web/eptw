# ePTW QA — Internal Staff invitation email via Resend.
# Verifies:
#   A. Safety Manager creates an Internal Staff user -> 201, profile created.
#   B. Response reports email_sent (Resend accepted or skipped) and the
#      invitation link was generated (invitation_sent=true).
#   C. Resend-invitation route refreshes the link and attempts email again.
#   D. Cleanup removes the created Auth user + profile.
# Requires: production build on :3457, QA_PASSWORD env, RESEND_* in .env.local.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-resend-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-resend-ids.json'
$ids = @{ user_id = ''; email = '' }
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

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SM3 = Get-ApiCookie 'safetymanager@test.com'   # company 3 safety manager

if ($Mode -eq 'main') {
  $stamp = (Get-Date).ToString('HHmmssfff')
  $email = "qa-resend-$stamp@test.com"

  # ---------------- A. Create Internal Staff user ---------------------------
  $createBody = @{
    full_name = 'QA Resend Staff'
    email = $email
    role = 'internal_staff'
    department = 'QA'
    position = 'Tester'
  } | ConvertTo-Json -Compress -Depth 6
  $cr = Invoke-Api $SM3 'POST' '/api/company/users' $createBody
  $userId = ''
  $invitationSent = 'n/a'
  $emailSent = 'n/a'
  if ($cr.Status -eq 201) {
    $obj = $cr.Body | ConvertFrom-Json
    $userId = [string]$obj.user.id
    $invitationSent = "$($obj.invitation_sent)"
    $emailSent = "$($obj.email_sent)"
  }
  if ($userId) { $script:ids.user_id = $userId; $script:ids.email = $email; SaveIds }
  Check 'A: create internal staff -> 201' '201' $cr.Status
  Check 'A: invitation link generated (invitation_sent=True)' 'True' $invitationSent
  Write-Output ("INFO | A: email_sent=$emailSent userId=$userId")
  Check 'A: email_sent reported (boolean present)' 'True' ([bool]($emailSent -match '^(True|False)$'))
  if (-not $userId) { Write-Output 'FATAL: no user created'; exit 1 }

  # Resend accepted vs skipped is environment dependent (sender verification);
  # when RESEND_FROM_EMAIL is configured we expect an actual send attempt.
  $fromSet = [bool](Select-String -Path .env.local -Pattern '^RESEND_FROM_EMAIL=' -Quiet)
  if ($fromSet) {
    Write-Output 'INFO | RESEND_FROM_EMAIL is configured -> expecting email_sent=True (or a logged Resend rejection).'
    if ($emailSent -eq 'True') { Check 'B: email accepted by Resend (email_sent=True)' 'True' $emailSent }
    else { Check 'B: email accepted by Resend (email_sent=True) — see server log if False' 'True' $emailSent }
  } else {
    Write-Output 'INFO | RESEND_FROM_EMAIL NOT set -> skip expected email_sent assertion.'
  }

  # ---------------- C. Resend invitation -------------------------------------
  Start-Sleep -Seconds 62  # rate limit is 60s
  $rr = Invoke-Api $SM3 'POST' "/api/company/users/$userId/resend-invitation"
  $resendOk = 'n/a'; $resendEmailSent = 'n/a'
  if ($rr.Status -eq 200) {
    $robj = $rr.Body | ConvertFrom-Json
    $resendOk = "$($robj.success)"
    $resendEmailSent = "$($robj.email_sent)"
  }
  Check 'C: resend invitation -> 200' '200' $rr.Status
  Check 'C: resend success=True' 'True' $resendOk
  Write-Output ("INFO | C: resend email_sent=$resendEmailSent")

  SaveIds
  Write-Output "TOTAL | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  $uid = [string]$ids.user_id
  if ($uid) {
    $body = @{ query = "delete from profiles where id = '$uid'" } | ConvertTo-Json
    try { $null = Invoke-RestMethod -Uri 'https://api.supabase.com/v1/projects/iyqoihinciwecvuwepoj/database/query' -Method Post -Headers @{ Authorization = 'Bearer sbp_e23dfd186001f73743b23ba2eb719d11e57d98af'; 'Content-Type' = 'application/json' } -Body $body -TimeoutSec 20 } catch { Write-Output "WARN profile delete: $($_.Exception.Message)" }
    # Delete the Auth user via admin REST (service role) so the account is removed.
    & curl.exe -s -X DELETE "$url/auth/v1/admin/users/$uid" -H "apikey: $sr" -H "Authorization: Bearer $sr" -o NUL
    Write-Output "INFO | cleaned user $uid"
    $ids = @{ user_id = ''; email = '' }; SaveIds
  } else { Write-Output 'INFO | nothing to clean' }
}
