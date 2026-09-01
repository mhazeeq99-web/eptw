# ePTW QA — verify planned_start/planned_end persist through the PATCH update route
# Fix regression: update route validated dates but never wrote them to the UPDATE object.
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-plandates-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-plandates-ids.json'
$ids = @{ permit_id = 0 }
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

$IS = Get-ApiCookie 'worksup@test.com'  # company 3 internal staff

if ($Mode -eq 'main') {
  # Create a draft COLD permit (type id=10, company 3) as internal staff, no planned dates yet.
  $createBody = @{ company_id = 3; permit_type_id = 10; submit = $false; work_title = "QA plandates " + (Get-Date).ToString('HHmmssfff'); work_description = 'QA'; work_location = 'QA' } | ConvertTo-Json -Compress -Depth 6
  $cr = Invoke-Api $IS 'POST' '/api/permits' $createBody
  $permitId = 0
  if ($cr.Status -eq 201 -or $cr.Status -eq 200) { try { $permitId = [int]($cr.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $ids.permit_id = $permitId }
  Write-Output ("INFO | draft created -> " + $cr.Status + " id=$permitId")
  if (-not $permitId) { Write-Output 'FATAL: no permit'; exit 1 }
  $ids | ConvertTo-Json | Set-Content -Path $idsFile

  # PATCH update with planned_start/planned_end set (the regression path).
  $ps = '2026-09-10T08:00:00'
  $pe = '2026-09-10T17:00:00'
  $upd = Invoke-Api $IS 'PATCH' "/api/permits/$permitId/update" (@{ permit_type_id = 10; work_title = 'QA plandates updated'; work_description = 'QA'; work_location = 'QA'; planned_start = $ps; planned_end = $pe } | ConvertTo-Json -Compress -Depth 6)
  Write-Output ("INFO | update -> " + $upd.Status + " " + $upd.Body)
  Check 'update route returns 200' '200' $upd.Status

  # Read back from DB via service role.
  $r = RestSvc 'GET' "permits?select=id,planned_start,planned_end&id=eq.$permitId"
  $got = $r.Body | ConvertFrom-Json
  $gotPs = $null; $gotPe = $null
  if ($got -and $got.Count -gt 0) { $gotPs = [string]$got[0].planned_start; $gotPe = [string]$got[0].planned_end }
  Write-Output ("INFO | db planned_start=$gotPs planned_end=$gotPe")
  # Normalise: strip trailing Z / milliseconds / offset before compare
  function Norm([string]$s) { if (-not $s) { return '' }; return ([DateTime]$s).ToString('yyyy-MM-ddTHH:mm:ss') }
  Check 'DB planned_start persisted' (Norm $ps) (Norm $gotPs)
  Check 'DB planned_end persisted' (Norm $pe) (Norm $gotPe)
}

if ($Mode -eq 'cleanup') {
  $permitId = [int]$ids.permit_id
  if ($permitId) {
    $d = @(RestSvc 'DELETE' "permit_workers?permit_id=eq.$permitId")
    @(RestSvc 'DELETE' "permit_safety_controls?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "permit_ppe?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "permit_approvals?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "attachments?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "jha_hazards?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "jhas?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "loto_entries?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "gas_tests?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "hirarc_documents?permit_id=eq.$permitId") | Out-Null
    @(RestSvc 'DELETE' "permits?id=eq.$permitId") | Out-Null
    Write-Output "INFO | cleaned permit $permitId"
  }
}

Write-Output "RESULT: pass=$pass fail=$fail"
