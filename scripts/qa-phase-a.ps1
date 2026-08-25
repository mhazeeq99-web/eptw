# ePTW Phase A tests — multi-worker permit_workers + work_method
# Requires: production build on :3457, QA_PASSWORD env
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-phaseA-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pass = 0; $fail = 0
$ids = @{ permits = @() }

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
  $curlArgs = @('-s', '-o', $respFile, '-w', '%{http_code}', '-X', $method, "$base$path", '-H', "Cookie: $cookie")
  if ($jsonBody) { [IO.File]::WriteAllText($bodyFile, $jsonBody); $curlArgs += @('-H', 'Content-Type: application/json', '--data-binary', "@$bodyFile") }
  $code = & curl.exe @curlArgs
  $text = ''; if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return [pscustomobject]@{ Status = [int]$code; Body = $text }
}
function RestQ([string]$path) { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20; if ($null -eq $r) { return @() }; return $r }
function RestQUser([string]$path, [string]$tok) { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $tok" } -TimeoutSec 20; if ($null -eq $r) { return @() }; return $r }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SC1 = Get-ApiCookie 'safetycoord1@test.com'
$CON = Get-ApiCookie 'contractor@test.com'
$SM3 = Get-ApiCookie 'safetymanager@test.com'
$IS1 = Get-ApiCookie 'supervisor@company.com'

# ---------------- 1. Internal PTW with multiple workers + work method ----------------
$body = @{
  company_id = 1; permit_type_id = 2; work_title = 'QA Phase A internal'; work_description = 'QA';
  work_location = 'QA location'; work_method = '1. Isolate. 2. Work. 3. Restore.';
  planned_start = '2026-09-10T08:00:00'; planned_end = '2026-09-10T17:00:00';
  workers = @(
    @{ full_name = 'Ahmad bin Ali'; id_number = 'EMP-1001'; induction_completed = $false },
    @{ full_name = 'Bakar bin Omar'; id_number = 'EMP-1002'; induction_completed = $false }
  )
} | ConvertTo-Json -Compress -Depth 6
$r = Invoke-Api $SC1 'POST' '/api/permits' $body
$intPid = 0
if ($r.Status -eq 201) { try { $intPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
Check 'internal PTW create (201)' '201' $r.Status
$ids.permits += $intPid
if ($intPid) {
  $w = @(RestQ "permit_workers?select=full_name,id_number,is_contractor&permit_id=eq.$intPid")
  Check 'internal permit has 2 workers' '2' $w.Count
  Check 'internal worker is_contractor=false' 'False' $w[0].is_contractor
  $p = RestQ "permits?select=work_method&id=eq.$intPid"
  Check 'work_method saved' '1. Isolate. 2. Work. 3. Restore.' $p[0].work_method
}

# ---------------- 2. Contractor PTW with multi-worker list ----------------
$body = @{
  company_id = 1; permit_type_id = 2; work_title = 'QA Phase A contractor'; work_description = 'QA';
  work_location = 'QA loc'; work_method = 'Method A';
  planned_start = '2026-09-11T08:00:00'; planned_end = '2026-09-11T17:00:00';
  staff_reference_name = 'Encik Rahman';
  workers = @(
    @{ full_name = 'Mohd Ali'; id_number = '800101-14-5678'; nationality = 'Malaysian'; induction_completed = $true },
    @{ full_name = 'Raj Kumar'; id_number = 'A1234567'; nationality = 'Indian'; induction_completed = $false }
  )
} | ConvertTo-Json -Compress -Depth 6
$r = Invoke-Api $CON 'POST' '/api/permits' $body
$conPid = 0
if ($r.Status -eq 201) { try { $conPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
Check 'contractor PTW create (201)' '201' $r.Status
$ids.permits += $conPid
if ($conPid) {
  $w = @(RestQ "permit_workers?select=full_name,id_number,nationality,is_contractor,contractor_id,induction_completed&permit_id=eq.$conPid&order=id")
  Check 'contractor permit has 2 workers' '2' $w.Count
  Check 'contractor worker is_contractor=true' 'True' $w[0].is_contractor
  Check 'contractor worker contractor_id=1' '1' $w[0].contractor_id
  Check 'nationality saved (Malaysian)' 'Malaysian' $w[0].nationality
  Check 'induction saved (true/false)' 'True' $w[0].induction_completed
  Check 'second worker nationality (Indian)' 'Indian' $w[1].nationality
}

# ---------------- 3. Validation failures ----------------
$body = @{ company_id = 1; permit_type_id = 2; work_title = 'QA no workers'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-12T08:00:00'; planned_end = '2026-09-12T17:00:00'; staff_reference_name = 'Encik Rahman'; workers = @() } | ConvertTo-Json -Compress -Depth 6
$r = Invoke-Api $CON 'POST' '/api/permits' $body
Check 'contractor PTW without workers (400)' '400' $r.Status
$body = @{ company_id = 1; permit_type_id = 2; work_title = 'QA missing id'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-12T08:00:00'; planned_end = '2026-09-12T17:00:00'; staff_reference_name = 'Encik Rahman'; workers = @(@{ full_name = 'No ID Worker'; id_number = '' }) } | ConvertTo-Json -Compress -Depth 6
$r = Invoke-Api $CON 'POST' '/api/permits' $body
Check 'contractor worker missing NRIC (400)' '400' $r.Status

# ---------------- 4. Edit: replace worker list + work method ----------------
if ($intPid) {
  $body = @{
    permit_type_id = 2; work_title = 'QA Phase A internal revised'; work_description = 'QA'; work_location = 'QA loc';
    work_method = 'Revised method';
    planned_start = '2026-09-10T08:00:00'; planned_end = '2026-09-10T17:00:00';
    workers = @(@{ full_name = 'Ahmad bin Ali'; id_number = 'EMP-1001' })
  } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $SC1 'PATCH' "/api/permits/$intPid/update" $body
  Check 'edit permit (200)' '200' $r.Status
  $w = @(RestQ "permit_workers?select=full_name&permit_id=eq.$intPid")
  Check 'worker list replaced (1 worker)' '1' $w.Count
  $p = RestQ "permits?select=work_method&id=eq.$intPid"
  Check 'work_method updated' 'Revised method' $p[0].work_method
}

# ---------------- 5. RLS / company isolation ----------------
# company-3 permit with a worker
$body = @{ company_id = 3; permit_type_id = 10; work_title = 'QA Phase A iso'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-13T08:00:00'; planned_end = '2026-09-13T17:00:00'; workers = @(@{ full_name = 'Isolasi Worker'; id_number = 'EMP-3-1' }) } | ConvertTo-Json -Compress -Depth 6
$r = Invoke-Api $SM3 'POST' '/api/permits' $body
$isoPid = 0
if ($r.Status -eq 201) { try { $isoPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
$ids.permits += $isoPid
if ($isoPid) {
  $isTok = (Get-Session 'supervisor@company.com').access_token
  $smTok = (Get-Session 'safetymanager@test.com').access_token
  $isRows = @(RestQUser "permit_workers?select=id&permit_id=eq.$isoPid" $isTok)
  Check 'company-1 user cannot see company-3 workers (0 rows)' '0' $isRows.Count
  $smRows = @(RestQUser "permit_workers?select=id&permit_id=eq.$isoPid" $smTok)
  Check 'company-3 user sees own workers (1 row)' '1' $smRows.Count
  # company-1 user CAN see contractor workers of a company-1 permit (customer visibility)
  $isRows2 = @(RestQUser "permit_workers?select=id&permit_id=eq.$conPid" $isTok)
  Check 'company-1 user sees contractor workers on own-company permit (2 rows)' '2' $isRows2.Count
}

Write-Output ''
Write-Output "TOTAL: PASS=$pass FAIL=$fail"
Write-Output "QA permit ids: $($ids.permits -join ',')"
