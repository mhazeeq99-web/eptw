# ePTW Phase B tests — PPE selection + expanded safety controls + gates
# Requires: production build on :3457, QA_PASSWORD env
param([ValidateSet('main','required-ppe','cleanup')][string]$Mode = 'main')
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-phaseB-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idsFile = Join-Path $env:TEMP 'eptw-phaseB-ids.json'
$ids = @{ permits = @() }
if (Test-Path $idsFile) { try { $ids = Get-Content $idsFile -Raw | ConvertFrom-Json } catch {} }
$pass = 0; $fail = 0

function SaveIds() { $ids | ConvertTo-Json -Depth 5 | Set-Content -Path $idsFile -Encoding UTF8 }

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
function RestPost([string]$path, [string]$body) { try { $null = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Method Post -Headers @{ apikey = $sr; Authorization = "Bearer $sr"; 'Content-Type' = 'application/json' } -Body $body -TimeoutSec 20; return $true } catch { return $false } }

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SC1 = Get-ApiCookie 'safetycoord1@test.com'
$CON = Get-ApiCookie 'contractor@test.com'
$SM3 = Get-ApiCookie 'safetymanager@test.com'
$IS1 = Get-ApiCookie 'supervisor@company.com'

if ($Mode -eq 'main') {
  # PPE catalogue + recommendations sanity
  $ppe = @(RestQ 'ppe_items?select=id,category,name&is_active=eq.true')
  Check 'PPE catalogue seeded (>=33 items)' 'True' $([bool]($ppe.Count -ge 33))
  $rec = @(RestQ 'permit_type_ppe?select=id&requirement=eq.recommended&limit=1')
  Check 'PPE type recommendations exist' 'True' $([bool]($rec.Count -ge 1))

  # pick a HOT-work permit type (company 1 = id 1) and get recommended PPE ids
  $hotPpe = @(RestQ "permit_type_ppe?select=ppe_item_id&permit_type_id=eq.1")
  Check 'HOT type has recommended PPE (>=5)' 'True' $([bool]($hotPpe.Count -ge 5))
  $hotPpeIds = @($hotPpe | ForEach-Object { [int]$_.ppe_item_id })
  $helmetId = @(RestQ "ppe_items?select=id&name=eq.Safety%20Helmet")[0].id

  # 1. Internal PTW with PPE + recommended control selection
  $recControls = @(RestQ "permit_type_safety_controls?select=safety_control_id&permit_type_id=eq.1&is_recommended=eq.true")
  $recControlIds = @($recControls | ForEach-Object { [int]$_.safety_control_id })
  $body = @{
    company_id = 1; permit_type_id = 1; work_title = 'QA Phase B internal'; work_description = 'QA';
    work_location = 'QA loc'; planned_start = '2026-09-20T08:00:00'; planned_end = '2026-09-20T17:00:00';
    ppe_other = 'Arc Flash Shield';
    ppe_item_ids = $hotPpeIds;
    recommended_control_ids = $recControlIds
  } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $SC1 'POST' '/api/permits' $body
  $permitId = 0
  if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $permitId
  Check 'internal PTW create with PPE (201)' '201' $r.Status
  if ($permitId) {
    $sel = @(RestQ "permit_ppe?select=ppe_item_id&permit_id=eq.$permitId&is_selected=eq.true")
    Check 'permit PPE persisted (>=5 selected)' 'True' $([bool]($sel.Count -ge 5))
    $recSel = @(RestQ "permit_recommended_controls?select=safety_control_id&permit_id=eq.$permitId")
    Check 'recommended controls persisted' $recControlIds.Count $recSel.Count
    $p = RestQ "permits?select=ppe_other&id=eq.$permitId"
    Check 'ppe_other persisted' 'Arc Flash Shield' $p[0].ppe_other
  }

  # 2. Contractor PTW with PPE + workers
  $body = @{
    company_id = 1; permit_type_id = 2; work_title = 'QA Phase B contractor'; work_description = 'QA';
    work_location = 'QA loc'; planned_start = '2026-09-21T08:00:00'; planned_end = '2026-09-21T17:00:00';
    staff_reference_name = 'Encik Rahman';
    workers = @(@{ full_name = 'Mohd Ali'; id_number = '800101-14-5678'; nationality = 'Malaysian'; induction_completed = $true });
    ppe_item_ids = @([int]$helmetId)
  } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $CON 'POST' '/api/permits' $body
  $cpid = 0
  if ($r.Status -eq 201) { try { $cpid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $cpid
  Check 'contractor PTW create with PPE (201)' '201' $r.Status
  if ($cpid) {
    $sel = @(RestQ "permit_ppe?select=ppe_item_id&permit_id=eq.$cpid")
    Check 'contractor permit PPE persisted (1)' '1' $sel.Count
  }

  # 3. Edit: modify PPE selection
  if ($permitId) {
    $body = @{
      permit_type_id = 1; work_title = 'QA Phase B internal revised'; work_description = 'QA'; work_location = 'QA loc';
      planned_start = '2026-09-20T08:00:00'; planned_end = '2026-09-20T17:00:00';
      ppe_item_ids = @([int]$helmetId); ppe_other = 'Revised PPE note';
      recommended_control_ids = @(); workers = @()
    } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $SC1 'PATCH' "/api/permits/$permitId/update" $body
    Check 'edit permit with new PPE (200)' '200' $r.Status
    $sel = @(RestQ "permit_ppe?select=ppe_item_id&permit_id=eq.$permitId")
    Check 'PPE selection replaced (1 item)' '1' $sel.Count
    $p = RestQ "permits?select=ppe_other&id=eq.$permitId"
    Check 'ppe_other updated' 'Revised PPE note' $p[0].ppe_other
  }

  # 4. Required vs recommended: a REQUIRED control must block approval;
  #    recommended controls must NOT block.
  #    Use the existing required flow: HOT type 1 requires JHA + GAS + FIRE_WATCH.
  #    Recommended-only permit: COLD type 2 requires JHA only. Create+submit+gates
  #    (JHA only), then approve -> recommended controls do not block.
  $body = @{
    company_id = 1; permit_type_id = 2; work_title = 'QA Phase B cold recommended'; work_description = 'QA';
    work_location = 'QA loc'; planned_start = '2026-09-22T08:00:00'; planned_end = '2026-09-22T17:00:00';
    ppe_item_ids = @(); recommended_control_ids = @()
  } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $SC1 'POST' '/api/permits' $body
  $coldPid = 0
  if ($r.Status -eq 201) { try { $coldPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $coldPid
  if ($coldPid) {
    Invoke-Api $SC1 'POST' "/api/permits/$coldPid/submit" | Out-Null
    $j = Invoke-Api $SC1 'POST' "/api/permits/$coldPid/jha" '{"title":"QA JHA"}'
    $jid = 0; if ($j.Status -eq 200 -or $j.Status -eq 201) { try { $jid = ($j.Body | ConvertFrom-Json).jha.id } catch {} }
    if ($jid) { Invoke-Api $SC1 'POST' "/api/permits/$coldPid/jha/$jid/verify" '{"status":"verified"}' | Out-Null }
    foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$coldPid")) {
      if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $SC1 'PATCH' "/api/permits/$coldPid/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
    }
    $r = Invoke-Api $SC1 'POST' "/api/permits/$coldPid/approve-and-issue"
    Check 'approval with unverified recommended controls still allowed (200)' '200' $r.Status
  }

  # 5. Company isolation: company-1 user cannot see company-3 PPE items/config
  $isTok = (Get-Session 'supervisor@company.com').access_token
  $smTok = (Get-Session 'safetymanager@test.com').access_token
  $companyPpe = @(RestQUser 'ppe_items?select=id&company_id=not.is.null' $isTok)
  Check 'no cross-company PPE items visible to company-1 (0 rows)' '0' $companyPpe.Count
  # permit PPE isolation using a company-3 permit
  $body = @{ company_id = 3; permit_type_id = 10; work_title = 'QA Phase B iso'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-23T08:00:00'; planned_end = '2026-09-23T17:00:00'; ppe_item_ids = @([int]$helmetId) } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $SM3 'POST' '/api/permits' $body
  $isoPid = 0
  if ($r.Status -eq 201) { try { $isoPid = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $isoPid
  if ($isoPid) {
    $isRows = @(RestQUser "permit_ppe?select=ppe_item_id&permit_id=eq.$isoPid" $isTok)
    Check 'company-1 user cannot see company-3 permit PPE (0 rows)' '0' $isRows.Count
    $smRows = @(RestQUser "permit_ppe?select=ppe_item_id&permit_id=eq.$isoPid" $smTok)
    Check 'company-3 user sees own permit PPE (1 row)' '1' $smRows.Count
  }
}

elseif ($Mode -eq 'required-ppe') {
  # Promote the (seed-created, 'recommended') Safety Helmet mapping for COLD
  # (company 1, type id 2) to REQUIRED; verify the gate blocks approval when it
  # is not selected, then allows after selection. The mapping is reverted at
  # the end of this mode.
  $helmetId = @(RestQ "ppe_items?select=id&name=eq.Safety%20Helmet")[0].id
  $coldTypeId = 2
  $mapping = RestQ "permit_type_ppe?select=id,requirement&permit_type_id=eq.$coldTypeId&ppe_item_id=eq.$helmetId"
  $mapId = $mapping[0].id
  $originalRequirement = $mapping[0].requirement
  Check 'COLD helmet mapping exists' 'True' $([bool]$mapId)
  try {
    $null = Invoke-RestMethod -Uri "$url/rest/v1/permit_type_ppe?id=eq.$mapId" -Method Patch -Headers @{ apikey = $sr; Authorization = "Bearer $sr"; 'Content-Type' = 'application/json' } -Body '{"requirement":"required"}' -TimeoutSec 20
    Check 'promoted helmet to REQUIRED' 'True' 'True'
  } catch { Check 'promoted helmet to REQUIRED' 'True' 'False' }
  $mapping2 = RestQ "permit_type_ppe?select=requirement&permit_type_id=eq.$coldTypeId&ppe_item_id=eq.$helmetId"
  Check 'mapping is required' 'required' $mapping2[0].requirement
  # create a COLD permit WITHOUT selecting the helmet
  $SC1 = Get-ApiCookie 'safetycoord1@test.com'
  $body = @{ company_id = 1; permit_type_id = 2; work_title = 'QA required PPE gate'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-24T08:00:00'; planned_end = '2026-09-24T17:00:00'; ppe_item_ids = @() } | ConvertTo-Json -Compress -Depth 6
  $r = Invoke-Api $SC1 'POST' '/api/permits' $body
  $permitId = 0
  if ($r.Status -eq 201) { try { $permitId = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
  $ids.permits += $permitId
  if ($permitId) {
    Invoke-Api $SC1 'POST' "/api/permits/$permitId/submit" | Out-Null
    $j = Invoke-Api $SC1 'POST' "/api/permits/$permitId/jha" '{"title":"QA JHA"}'
    $jid = 0; if ($j.Status -eq 200 -or $j.Status -eq 201) { try { $jid = ($j.Body | ConvertFrom-Json).jha.id } catch {} }
    if ($jid) { Invoke-Api $SC1 'POST' "/api/permits/$permitId/jha/$jid/verify" '{"status":"verified"}' | Out-Null }
    foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$permitId")) {
      if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $SC1 'PATCH' "/api/permits/$permitId/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
    }
    $r = Invoke-Api $SC1 'POST' "/api/permits/$permitId/approve-and-issue"
    Check 'approval blocked: required PPE not selected (400)' '400' $r.Status
    $msg = $r.Body
    Check 'block message names the PPE' 'True' $([bool]($msg -match 'Required PPE'))

    # The required PPE must be selected on the DRAFT (editing a pending_approval
    # permit is correctly blocked). Create a second permit WITH the helmet
    # selected, submit, pass the safety gates, and approve.
    $body = @{ company_id = 1; permit_type_id = 2; work_title = 'QA required PPE selected'; work_description = 'QA'; work_location = 'QA'; planned_start = '2026-09-25T08:00:00'; planned_end = '2026-09-25T17:00:00'; ppe_item_ids = @([int]$helmetId); recommended_control_ids = @() } | ConvertTo-Json -Compress -Depth 6
    $r = Invoke-Api $SC1 'POST' '/api/permits' $body
    $permit2 = 0
    if ($r.Status -eq 201) { try { $permit2 = [int]($r.Body | ConvertFrom-Json).permit.id } catch {} }
    $ids.permits += $permit2
    Check 'permit with required PPE selected created (201)' '201' $r.Status
    if ($permit2) {
      Invoke-Api $SC1 'POST' "/api/permits/$permit2/submit" | Out-Null
      $j = Invoke-Api $SC1 'POST' "/api/permits/$permit2/jha" '{"title":"QA JHA"}'
      $jid = 0; if ($j.Status -eq 200 -or $j.Status -eq 201) { try { $jid = ($j.Body | ConvertFrom-Json).jha.id } catch {} }
      if ($jid) { Invoke-Api $SC1 'POST' "/api/permits/$permit2/jha/$jid/verify" '{"status":"verified"}' | Out-Null }
      foreach ($c in @(RestQ "permit_safety_controls?select=id,is_required,status&permit_id=eq.$permit2")) {
        if ($c.is_required -and $c.status -eq 'pending') { Invoke-Api $SC1 'PATCH' "/api/permits/$permit2/safety-controls/$($c.id)/verify" '{"remarks":"ok"}' | Out-Null }
      }
      $r = Invoke-Api $SC1 'POST' "/api/permits/$permit2/approve-and-issue"
      Check 'approval allowed when required PPE selected (200)' '200' $r.Status
    }
  }
  # revert the mapping to its original requirement
  try {
    $null = Invoke-RestMethod -Uri "$url/rest/v1/permit_type_ppe?id=eq.$mapId" -Method Patch -Headers @{ apikey = $sr; Authorization = "Bearer $sr"; 'Content-Type' = 'application/json' } -Body "{`"requirement`":`"$originalRequirement`"}" -TimeoutSec 20
    Check 'reverted PPE mapping' 'True' 'True'
  } catch { Check 'reverted PPE mapping' 'True' 'False' }
}

elseif ($Mode -eq 'cleanup') {
  $permits = @($ids.permits | Where-Object { $_ })
  if ($permits.Count -gt 0) {
    $deleted = 0
    foreach ($p in $permits) {
      foreach ($tbl in @('permit_recommended_controls','permit_ppe','permit_workers','jhas','permit_safety_controls','permit_approvals','notifications')) {
        try { $null = Invoke-RestMethod -Uri "$url/rest/v1/$tbl`?permit_id=eq.$p" -Method Delete -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 15 } catch {}
      }
      try { $null = Invoke-RestMethod -Uri "$url/rest/v1/permits?id=eq.$p" -Method Delete -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 15; $deleted++ } catch {}
    }
    Check "QA permits deleted ($deleted)" $permits.Count $deleted
  }
  $leftPpe = @(RestQ 'permit_ppe?select=permit_id&limit=1').Count
  Check 'no permit_ppe left' '0' $leftPpe
  $leftRec = @(RestQ 'permit_recommended_controls?select=permit_id&limit=1').Count
  Check 'no permit_recommended_controls left' '0' $leftRec
}

SaveIds
Write-Output ''
Write-Output "TOTAL (mode=$Mode): PASS=$pass FAIL=$fail"
