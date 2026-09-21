# ePTW QA — Company users: invite email/redirect link, instant resend,
# deactivate-then-remove gating.
# Verifies:
#   A. Create Internal Staff -> 201; invite link contains redirect_to to the
#      app's update-password (so staff can complete registration).
#   B. Resend invitation right away -> 200 (no 60s rate-limit block).
#   C. send_email:false returns a fresh invite link without sending email.
#   D. DELETE while ACTIVE -> 409 (must deactivate first).
#   E. Deactivate -> DELETE succeeds -> account gone from auth + profiles.
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-users-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-users-ids.json'
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
function RestQ([string]$path) { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20; if ($null -eq $r) { return @() }; return $r }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SM3 = Get-ApiCookie 'safetymanager@test.com'   # company 3 safety manager

if ($Mode -eq 'main') {
  $stamp = (Get-Date).ToString('HHmmssfff')
  $email = "qa-users-$stamp@test.com"

  # ---------------- A. Create + invite link redirect --------------------------
  $createBody = @{
    full_name = 'QA Users Staff'; email = $email; role = 'internal_staff'
    department = 'QA'; position = 'Tester'
  } | ConvertTo-Json -Compress -Depth 6
  $cr = Invoke-Api $SM3 'POST' '/api/company/users' $createBody
  $userId = ''; $inviteLink = ''
  if ($cr.Status -eq 201) {
    $obj = $cr.Body | ConvertFrom-Json
    $userId = [string]$obj.user.id
    $inviteLink = [string]$obj.invite_link
  }
  if ($userId) { $script:ids.user_id = $userId; $script:ids.email = $email; SaveIds }
  Check 'A: create internal staff -> 201' '201' $cr.Status
  Check 'A: invite link returned' 'True' ([bool]$inviteLink)
  Check 'A: invite link is branded (no raw supabase link in response/email)' 'True' ([bool]($inviteLink -match '/invite\?token='))
  Check 'A: invite link on app origin' 'True' ([bool]($inviteLink -match 'localhost:3457|eptw-three\.vercel\.app'))
  Write-Output ("INFO | A: link=" + $inviteLink.Substring(0, [Math]::Min(160, $inviteLink.Length)))
  if (-not $userId) { Write-Output 'FATAL: no user'; exit 1 }

  # ---------------- B. Instant resend (no 60s block) --------------------------
  $rr = Invoke-Api $SM3 'POST' "/api/company/users/$userId/resend-invitation" '{"send_email":true}'
  Check 'B: instant resend -> 200' '200' $rr.Status

  # ---------------- C. send_email:false returns fresh link --------------------
  $rc = Invoke-Api $SM3 'POST' "/api/company/users/$userId/resend-invitation" '{"send_email":false}'
  $linkC = ''
  if ($rc.Status -eq 200) { $linkC = [string]($rc.Body | ConvertFrom-Json).invite_link }
  Check 'C: copy-link mode -> 200' '200' $rc.Status
  Check 'C: fresh invite link returned' 'True' ([bool]$linkC)

  # ---------------- D. DELETE while ACTIVE -> 409 -----------------------------
  $rd = Invoke-Api $SM3 'DELETE' "/api/company/users/$userId"
  Check 'D: delete active user -> 409' '409' $rd.Status
  Check 'D: message asks to deactivate first' 'True' ([bool]($rd.Body -match 'Deactivate the account first'))

  # ---------------- E. Deactivate then DELETE -> gone -------------------------
  $deact = Invoke-Api $SM3 'PATCH' "/api/company/users/$userId" '{"is_active":false}'
  Check 'E: deactivate -> 200' '200' $deact.Status
  $rem = Invoke-Api $SM3 'DELETE' "/api/company/users/$userId"
  Check 'E: delete deactivated user -> 200' '200' $rem.Status
  if ($rem.Status -eq 200) {
    $rows = @(RestQ "profiles?select=id&id=eq.$userId")
    Check 'E: profile row gone' '0' $rows.Count
    # Auth user should also be gone (admin lookup now 404).
    try {
      $null = Invoke-RestMethod -Uri "$url/auth/v1/admin/users/$userId" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 15
      Check 'E: auth user gone' 'no' 'yes'
    } catch {
      Check 'E: auth user gone' 'no' 'no'
    }
  }

  SaveIds
  Write-Output "TOTAL | pass=$pass fail=$fail"
  exit 0
}

if ($Mode -eq 'cleanup') {
  $uid = [string]$ids.user_id
  if ($uid) {
    try { $null = Invoke-RestMethod -Uri "$url/auth/v1/admin/users/$uid" -Method Delete -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 15 } catch {}
    RestQ "profiles?id=eq.$uid" | Out-Null
    Write-Output "INFO | cleaned $uid"
    $ids = @{ user_id = ''; email = '' }; SaveIds
  } else { Write-Output 'INFO | nothing to clean' }
}


