# QA: contractor /api/company/plan UI-gating fix
# Contractor (id 1) is authorized for companies 1, 3, 6; NOT 2.
# Company 3 is on the Free plan -> plan endpoint must return 200 with
# attachments_enabled=false (previously 403 made the new-permit UI fall back
# to unlocked uploads). Unauthorized company must stay 403.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env.local'
$url = ((Select-String -Path $envFile -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path $envFile -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$tmp = Join-Path $env:TEMP 'eptw-plan-gate-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pw = 'Test@123456'

function Get-ApiCookie([string]$email) {
  $b = @{ email = $email; password = $pw } | ConvertTo-Json -Compress
  $session = Invoke-RestMethod -Uri "$url/auth/v1/token?grant_type=password" -Method Post -Headers @{ apikey = $sr; 'Content-Type' = 'application/json' } -Body $b -TimeoutSec 20
  $expiresAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + [int]$session.expires_in
  $payloadObj = @{ access_token = $session.access_token; refresh_token = $session.refresh_token; expires_at = $expiresAt; expires_in = $session.expires_in; token_type = 'bearer'; user = $session.user } | ConvertTo-Json -Compress -Depth 10
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadObj)).TrimEnd('=').Replace('+','-').Replace('/','_')
  return "sb-$ref-auth-token=base64-$b64"
}

function Invoke-Api([string]$cookie, [string]$method, [string]$path, [string]$jsonBody = '') {
  $respFile = Join-Path $tmp "resp-$([guid]::NewGuid().ToString('N')).txt"
  $bodyFile = Join-Path $tmp "body-$([guid]::NewGuid().ToString('N')).json"
  $curlArgs = @('-s', '-o', $respFile, '-w', '%{http_code}', '-X', $method, "$base$path", '-H', "Cookie: $cookie")
  if ($jsonBody) { [IO.File]::WriteAllText($bodyFile, $jsonBody); $curlArgs += @('-H', 'Content-Type: application/json', '--data-binary', "@$bodyFile") }
  $code = & curl.exe @curlArgs
  $text = ''; if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return [pscustomobject]@{ Status = [int]$code; Body = $text }
}

$CON = Get-ApiCookie 'contractor@test.com'

Write-Output '--- contractor: authorized Free company 3 (expect 200, free, attachments_enabled=false) ---'
$r1 = Invoke-Api $CON 'GET' '/api/company/plan?company_id=3'
Write-Output "status=$($r1.Status) body=$($r1.Body)"

Write-Output '--- contractor: authorized company 1 (expect 200) ---'
$r2 = Invoke-Api $CON 'GET' '/api/company/plan?company_id=1'
Write-Output "status=$($r2.Status) body=$($r2.Body)"

Write-Output '--- contractor: authorized company 6 (expect 200) ---'
$r6 = Invoke-Api $CON 'GET' '/api/company/plan?company_id=6'
Write-Output "status=$($r6.Status) body=$($r6.Body)"

Write-Output '--- contractor: UNAUTHORIZED company 2 (expect 403) ---'
$r3 = Invoke-Api $CON 'GET' '/api/company/plan?company_id=2'
Write-Output "status=$($r3.Status) body=$($r3.Body)"

Write-Output '--- contractor: upload-url gate on Free company permit 714 (expect 403, server authoritative) ---'
$r4 = Invoke-Api $CON 'POST' '/api/permits/714/attachments/upload-url' '{"filename":"qa.txt","content_type":"text/plain","size_bytes":5}'
Write-Output "status=$($r4.Status) body=$($r4.Body)"
