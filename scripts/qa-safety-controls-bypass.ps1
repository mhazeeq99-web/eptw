# ePTW QA — Safety Controls gate bypass when no required controls configured
# Verifies:
#   A. A permit type with NO required safety controls can be approved even
#      though no safety controls are verified.
#   B. Readiness reports safety_controls as 'not_required' (not blocking).
# Requires: production build on :3457, QA_PASSWORD env.
param([ValidateSet('main','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-noreq-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-noreq-ids.json'
$ids = @{ type_id = 0; permit_id = 0 }
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

$SM = Get-ApiCookie 'safetymanager@test.com'   # company 3
$IS = Get-ApiCookie 'worksup@test.com'          # company 3 internal staff

if ($Mode -eq 'main') {
  # Create a permit type with NO required controls (only recommended).
  $unique = "QA NoReq " + (Get-Date).ToString('HHmmssfff')
  $typeBody = @{ name = $unique; requires_jha = $true } | ConvertTo-Json -Compress -Depth 6
  $tr = Invoke-Api $SM 'POST' '/api/admin/permit-types' $typeBody
  $typeId = 0
  if ($tr.Status -eq 201) { try { $typeId = [int]($tr.Body | ConvertFrom-Json).permit_type.id } catch {} }
  if ($typeId) { $ids.type_id = $typeId }
  Write-Output ("INFO | type created -> " + $tr.Status + " id=$typeId")
  Check 'A: permit type created (201)' '201' $tr.Status

  # Create a COLD-equivalent permit using this type, with a JHA to satisfy that gate.
  $createBody = @{ company_id = 3; permit_type_id = $typeId; submit = $false; work_title = "QA noreq " + (Get-Date).ToString('HHmmssfff'); planned_start = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK'); planned_end = (Get-Date).AddHours(2).ToString('yyyy-MM-ddTHH:mm:ssK'); declaration_confirmed_at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK') } | ConvertTo-Json -Compress -Depth 6
  $cr = Invoke-Api $IS 'POST' '/api/permits' $createBody
  $permitId = 0
  if ($cr.Status -eq 201 -or $cr.Status -eq 200) { try { $permitId = [int]($cr.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { $ids.permit_id = $permitId }
  Write-Output ("INFO | draft created -> " + $cr.Status + " id=$permitId")

  if ($permitId) {
    # Add a JHA so the JHA gate is satisfied (the only other required gate for COLD-like).
    $jhaBody = @{ title = "QA JHA " + (Get-Date).ToString('HHmmssfff'); hazards = @(@{ hazard='Test hazard'; likelihood=2; severity=2 }) } | ConvertTo-Json -Compress -Depth 6
    $jha = Invoke-Api $IS 'POST' "/api/permits/$permitId/jha" $jhaBody
    Write-Output ("INFO | jha -> " + $jha.Status)
    # Complete + verify the JHA
    $jhaId = 0
    if ($jha.Status -eq 200 -or $jha.Status -eq 201) { try { $jhaId = [int](($jha.Body | ConvertFrom-Json).jha.id) } catch {} }
    if ($jhaId) {
      Invoke-Api $IS 'POST' "/api/permits/$permitId/jha/$jhaId/complete" | Out-Null
      $ver = Invoke-Api $SM 'POST' "/api/permits/$permitId/jha/$jhaId/verify" (@{ status='verified' } | ConvertTo-Json -Compress)
      Write-Output ("INFO | jha verify -> " + $ver.Status)
    }

    # Submit the permit
    $sub = Invoke-Api $IS 'POST' "/api/permits/$permitId/submit" ''
    Write-Output ("INFO | submit -> " + $sub.Status)

    # Check readiness: safety_controls must be not_required
    $rd = Invoke-Api $SM 'GET' "/api/permits/$permitId/readiness"
    $sc = ''
    $readyFlag = $false
    if ($rd.Status -eq 200) {
      $rdObj = $rd.Body | ConvertFrom-Json
      $sc = [string](($rdObj.items | Where-Object { $_.key -eq 'safety_controls' }).status)
      $readyFlag = ($rdObj.ready -eq $true)
    }
    Write-Output ("INFO | readiness safety_controls=$sc ready=$readyFlag")
    Check 'B: safety_controls status not_required' 'not_required' $sc

    # Attempt approval — should NOT be blocked by safety controls.
    # (The new permit type defaults requires_site_verification=true, so site
    # verification legitimately blocks; that is separate from safety controls.)
    $appr = Invoke-Api $SM 'POST' "/api/permits/$permitId/approve-and-issue" ''
    Write-Output ("INFO | approve -> " + $appr.Status + " " + $appr.Body)
    $blockedByControls = $false
    if ($appr.Body -match '"blocking_reasons"') {
      $apprObj = $appr.Body | ConvertFrom-Json
      $blockedByControls = @($apprObj.blocking_reasons | Where-Object { $_ -match 'safety controls' }).Count -gt 0
    }
    Check 'C: approval not blocked by safety controls' 'False' "$blockedByControls"
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
  if ($ids.type_id) { RestSvc 'DELETE' "permit_types?id=eq.$($ids.type_id)" | Out-Null }
  $ids = @{ type_id = 0; permit_id = 0 }; Set-Content -Path $idsFile -Value ($ids | ConvertTo-Json -Compress)
  Write-Output 'cleanup done'
}
