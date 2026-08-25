# ePTW live 5-role authorization tests — production build on :3457, curl-based
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD  # set like scripts/qa.sh: QA_PASSWORD=<test-account password>
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD (test-account password) to run the QA harness'; exit 1 }
$cookieName = "sb-$ref-auth-token"
$tmp = Join-Path $env:TEMP 'eptw-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pass = 0; $fail = 0

function Check([string]$name, [string]$expected, $actual) {
  if ("$expected" -eq "$actual") { $script:pass++; Write-Output "PASS | $name (got $actual)" }
  else { $script:fail++; Write-Output "FAIL | $name expected=$expected got=$actual" }
}

function Get-ApiCookie([string]$email) {
  $loginBody = @{ email = $email; password = $pw } | ConvertTo-Json
  $session = Invoke-RestMethod -Uri "$url/auth/v1/token?grant_type=password" -Method Post `
    -Headers @{ apikey = $sr; 'Content-Type' = 'application/json' } -Body $loginBody -TimeoutSec 20
  $expiresAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + [int]$session.expires_in
  $payloadObj = @{
    access_token  = $session.access_token
    refresh_token = $session.refresh_token
    expires_at    = $expiresAt
    expires_in    = $session.expires_in
    token_type    = 'bearer'
    user          = $session.user
  } | ConvertTo-Json -Compress -Depth 10
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadObj)).TrimEnd('=').Replace('+','-').Replace('/','_')
  return "$cookieName=base64-$b64"
}

# curl-based API call: returns { Status, Body }
function Invoke-Api([string]$cookie, [string]$method, [string]$path, [string]$jsonBody = '') {
  $respFile = Join-Path $tmp "resp-$([guid]::NewGuid().ToString('N')).txt"
  $bodyFile = Join-Path $tmp "body-$([guid]::NewGuid().ToString('N')).json"
  $args = @('-s', '-o', $respFile, '-w', '%{http_code}', '-X', $method, "$base$path", '-H', "Cookie: $cookie")
  if ($jsonBody) {
    [IO.File]::WriteAllText($bodyFile, $jsonBody)
    $args += @('-H', 'Content-Type: application/json', '--data-binary', "@$bodyFile")
  }
  $code = & curl.exe @args
  $text = ''
  if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return [pscustomobject]@{ Status = [int]$code; Body = $text }
}

# Wait for server
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5
  if ($c -eq '200') { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Output 'FATAL: server not ready on :3457'; exit 1 }
Write-Output "server ready (ref=$ref)"

$PA  = Get-ApiCookie 'mhazeeq99@gmail.com'      # platform_admin
$SM  = Get-ApiCookie 'safetymanager@test.com'   # safety_manager (company 3)
$SC1 = Get-ApiCookie 'safetycoord1@test.com'    # safety_coordinator (company 1)
$IS1 = Get-ApiCookie 'supervisor@company.com'   # internal_staff (company 1)
$CON = Get-ApiCookie 'contractor@test.com'      # contractor_admin (contractor 1)

# ---------------------------------------------------------------
# 0. Unauthenticated
# ---------------------------------------------------------------
$r = Invoke-Api '' 'POST' '/api/permits' '{"company_id":1,"permit_type_id":2,"work_title":"unauth"}'
Check 'unauthenticated create (401)' '401' $r.Status

# ---------------------------------------------------------------
# 1. Platform admin: not operational
# ---------------------------------------------------------------
$r = Invoke-Api $PA 'POST' '/api/permits' '{"company_id":1,"permit_type_id":2,"work_title":"PA create","work_description":"x","work_location":"x","planned_start":"2026-12-01T08:00:00","planned_end":"2026-12-01T17:00:00"}'
Check 'platform_admin create PTW (403)' '403' $r.Status

# ---------------------------------------------------------------
# 2. Internal Staff (company 1)
# ---------------------------------------------------------------
$r = Invoke-Api $IS1 'POST' '/api/permits' '{"company_id":1,"permit_type_id":2,"work_title":"QA IS permit","work_description":"QA","work_location":"QA","planned_start":"2026-12-02T08:00:00","planned_end":"2026-12-02T17:00:00"}'
$isPid = ''
if ($r.Status -eq 201 -or $r.Status -eq 200) { try { $isPid = ($r.Body | ConvertFrom-Json).permit.id } catch {} }
Check 'internal_staff create PTW (201)' '201' $r.Status
if ($isPid) {
  $r = Invoke-Api $IS1 'POST' "/api/permits/$isPid/submit"
  Check 'internal_staff submit (200)' '200' $r.Status
  $r = Invoke-Api $IS1 'POST' "/api/permits/$isPid/approve-and-issue"
  Check 'internal_staff approve (403)' '403' $r.Status
  $r = Invoke-Api $IS1 'POST' "/api/permits/$isPid/reject" '{"remarks":"x"}'
  Check 'internal_staff reject (403)' '403' $r.Status
}
$r = Invoke-Api $IS1 'POST' '/api/company/users' '{"full_name":"X","email":"x@x.com","role":"internal_staff"}'
Check 'internal_staff manage users (403)' '403' $r.Status

# ---------------------------------------------------------------
# 3. Contractor Admin
# ---------------------------------------------------------------
$r = Invoke-Api $CON 'POST' '/api/permits' '{"company_id":1,"permit_type_id":2,"work_title":"QA contractor PTW","work_description":"QA","work_location":"QA","planned_start":"2026-12-03T08:00:00","planned_end":"2026-12-03T17:00:00","worker_name":"Mohd Ali","worker_id":"CT-2045","staff_reference_name":"Ahmad bin Ali"}'
$conPid = ''
if ($r.Status -eq 201 -or $r.Status -eq 200) { try { $conPid = ($r.Body | ConvertFrom-Json).permit.id } catch {} }
Check 'contractor_admin create with worker fields (201)' '201' $r.Status
$r = Invoke-Api $CON 'POST' '/api/permits' '{"company_id":1,"permit_type_id":2,"work_title":"QA con no worker","work_description":"QA","work_location":"QA","planned_start":"2026-12-03T08:00:00","planned_end":"2026-12-03T17:00:00"}'
Check 'contractor_admin missing worker fields (400)' '400' $r.Status
if ($conPid) {
  $r = Invoke-Api $CON 'POST' "/api/permits/$conPid/submit"
  Check 'contractor_admin submit (200)' '200' $r.Status
  $r = Invoke-Api $CON 'POST' "/api/permits/$conPid/approve-and-issue"
  Check 'contractor_admin approve (403)' '403' $r.Status
  $r = Invoke-Api $CON 'POST' "/api/permits/$conPid/reject" '{"remarks":"x"}'
  Check 'contractor_admin reject (403)' '403' $r.Status
}

# ---------------------------------------------------------------
# 4/5. Safety Coordinator + Manager self-approval
# ---------------------------------------------------------------
function New-SubmittedPermit([string]$cookie, [string]$title, [int]$companyId) {
  # permit_type ids are company-scoped: company 1 uses 1-5, company 3 uses 9-13
  $ptype = if ($companyId -eq 3) { 10 } else { 2 }
  $body = @{ company_id = $companyId; permit_type_id = $ptype; work_title = $title; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-12-04T08:00:00'; planned_end = '2026-12-04T17:00:00' } | ConvertTo-Json -Compress
  $r = Invoke-Api $cookie 'POST' '/api/permits' $body
  $permitId = 0
  if ($r.Status -eq 201 -or $r.Status -eq 200) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  if ($permitId) { Invoke-Api $cookie 'POST' "/api/permits/$permitId/submit" | Out-Null }
  return $permitId
}

function Complete-SafetyGates([string]$cookie, [int]$permitId) {
  $j = Invoke-Api $cookie 'POST' "/api/permits/$permitId/jha" '{"title":"QA JHA"}'
  $jhaId = 0
  if ($j.Status -eq 200 -or $j.Status -eq 201) { try { $jhaId = ($j.Body | ConvertFrom-Json).jha.id } catch {} }
  if ($jhaId) { Invoke-Api $cookie 'POST' "/api/permits/$permitId/jha/$jhaId/verify" '{"status":"verified"}' | Out-Null }
  $h = @{ apikey = $sr; Authorization = "Bearer $sr" }
  $controls = Invoke-RestMethod -Uri "$url/rest/v1/permit_safety_controls?select=id,is_required,status&permit_id=eq.$permitId" -Headers $h -TimeoutSec 20
  foreach ($c in $controls) {
    if ($c.is_required -and $c.status -eq 'pending') {
      Invoke-Api $cookie 'PATCH' "/api/permits/$permitId/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null
    }
  }
}

$scPid = New-SubmittedPermit $SC1 'QA SC self-approve' 1
Check 'SC create+submit (200)' '200' $(if ($scPid) {'200'} else {'fail'})
if ($scPid) {
  $r = Invoke-Api $SC1 'POST' "/api/permits/$scPid/approve-and-issue"
  Check 'SC self-approve blocked without gates (400)' '400' $r.Status
  Complete-SafetyGates $SC1 $scPid
  $r = Invoke-Api $SC1 'POST' "/api/permits/$scPid/approve-and-issue"
  Check 'SC self-approve (200)' '200' $r.Status
  $st = Invoke-RestMethod -Uri "$url/rest/v1/permits?select=status,workflow_stage&id=eq.$scPid" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20
  Check 'SC permit active' 'active' $st[0].status
  Check 'SC permit workflow_stage' 'active' $st[0].workflow_stage
}

$smPid = New-SubmittedPermit $SM 'QA SM self-approve' 3
Check 'SM create+submit (200)' '200' $(if ($smPid) {'200'} else {'fail'})
if ($smPid) {
  Complete-SafetyGates $SM $smPid
  $r = Invoke-Api $SM 'POST' "/api/permits/$smPid/approve-and-issue"
  Check 'SM self-approve (200)' '200' $r.Status
  $st = Invoke-RestMethod -Uri "$url/rest/v1/permits?select=status,workflow_stage&id=eq.$smPid" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20
  Check 'SM permit active' 'active' $st[0].status
}

# ---------------------------------------------------------------
# 6. Company isolation + contractor isolation
# ---------------------------------------------------------------
if ($smPid) {
  $r = Invoke-Api $SC1 'POST' "/api/permits/$smPid/approve-and-issue"
  # Company isolation: TESTING.md TEST 12 — Company A users cannot open
  # Company B permits at all (404). 403 is also acceptable (route-level deny).
  Check 'Company A SC approve Company B permit denied (403/404)' '404' $r.Status
  if ($r.Status -notin @(403, 404)) { Write-Output "  note: got $($r.Status)" }
  $r = Invoke-Api $CON 'POST' "/api/permits/$smPid/approve-and-issue"
  Check 'Contractor approve Company 3 permit denied (403/404)' '403' $r.Status
  if ($r.Status -notin @(403, 404)) { Write-Output "  note: got $($r.Status)" }

  # ---------------------------------------------------------------
  # 7. Lifecycle on SM active permit
  # ---------------------------------------------------------------
  $r = Invoke-Api $SM 'POST' "/api/permits/$smPid/suspend" '{"remarks":"QA suspend"}'
  Check 'SM suspend (200)' '200' $r.Status
  $r = Invoke-Api $SM 'POST' "/api/permits/$smPid/resume" '{"remarks":"QA resume"}'
  Check 'SM resume (200)' '200' $r.Status
  $r = Invoke-Api $SM 'POST' "/api/permits/$smPid/complete" '{"remarks":"QA complete"}'
  Check 'SM complete (200)' '200' $r.Status
  $r = Invoke-Api $SM 'POST' "/api/permits/$smPid/close" '{"remarks":"QA close"}'
  Check 'SM close (200)' '200' $r.Status
}

Write-Output ''
Write-Output "TOTAL: PASS=$pass FAIL=$fail"
