# ePTW billing (HitPay) live tests — production build on :3457
# The server must be started with HITPAY_WEBHOOK_SALT='qa-webhook-salt'
# and NO HITPAY_API_KEY (checkout/cancel must return 503 "not configured").
param([Parameter(Mandatory=$true)][ValidateSet('webhook','checkout','cancel','rls','cleanup')][string]$Mode)
$ErrorActionPreference = 'Continue'
$url = ((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line -replace '^[^=]+=','').Trim()
$sr  = ((Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line -replace '^[^=]+=','').Trim()
$ref = ($url -replace '^https://([^.]+)\..*','$1')
$base = 'http://localhost:3457'
$salt = 'qa-webhook-salt'
$pw = $env:QA_PASSWORD
if (-not $pw) { Write-Output 'FATAL: set $env:QA_PASSWORD'; exit 1 }
$tmp = Join-Path $env:TEMP 'eptw-billing-qa'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
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
  $curlArgs = @('-s', '-o', $respFile, '-w', '%{http_code}', '-X', $method, "$base$path", '-H', "Cookie: $cookie")
  if ($jsonBody) { [IO.File]::WriteAllText($bodyFile, $jsonBody); $curlArgs += @('-H', 'Content-Type: application/json', '--data-binary', "@$bodyFile") }
  $code = & curl.exe @curlArgs
  $text = ''; if (Test-Path $respFile) { $text = [IO.File]::ReadAllText($respFile) }
  return [pscustomobject]@{ Status = [int]$code; Body = $text }
}
function RestQ([string]$path) { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20; if ($null -eq $r) { return @() }; return $r }
function RestQUser([string]$path, [string]$tok) { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers @{ apikey = $sr; Authorization = "Bearer $tok" } -TimeoutSec 20; if ($null -eq $r) { return @() }; return $r }
function RestPost([string]$path, [string]$body) { try { $r = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Method Post -Headers @{ apikey = $sr; Authorization = "Bearer $sr"; 'Content-Type' = 'application/json'; Prefer = 'return=representation' } -Body $body -TimeoutSec 20; return @($r) } catch { $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }; return @( [pscustomobject]@{ status = "$code" } ) } }
function RestDelete([string]$path) { try { $null = Invoke-RestMethod -Uri "$url/rest/v1/$path" -Method Delete -Headers @{ apikey = $sr; Authorization = "Bearer $sr" } -TimeoutSec 20; return $true } catch { return $false } }
function Get-HmacHex([string]$payload, [string]$key) {
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [Text.Encoding]::UTF8.GetBytes($key)
  $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))
  return ([BitConverter]::ToString($hash)).Replace('-','').ToLower()
}
# Send a signed webhook: writes payload to a file (no BOM), computes HMAC over it, POSTs with curl
function Send-Webhook([string]$payload, [string]$signatureOverride = '') {
  $file = Join-Path $tmp "wh-$([guid]::NewGuid().ToString('N')).json"
  [IO.File]::WriteAllText($file, $payload)
  $sig = $signatureOverride
  if (-not $sig) { $sig = Get-HmacHex $payload $salt }
  $out = Join-Path $tmp "wh-out-$([guid]::NewGuid().ToString('N')).txt"
  $code = & curl.exe -s -o $out -w '%{http_code}' -X POST "$base/api/billing/webhook" -H "Content-Type: application/json" -H "Hitpay-Signature: $sig" -H "Hitpay-Event-Type: created" -H "Hitpay-Event-Object: charge" --data-binary "@$file"
  return [int]$code
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) { $c = & curl.exe -s -o NUL -w '%{http_code}' "$base/login" --max-time 5; if ($c -eq '200') { $ready = $true; break }; Start-Sleep -Seconds 2 }
if (-not $ready) { Write-Output 'FATAL: server not ready'; exit 1 }

$SM3 = Get-ApiCookie 'safetymanager@test.com'
$IS1 = Get-ApiCookie 'supervisor@company.com'

if ($Mode -eq 'webhook') {
  # ---- setup: pending subscription for company 3 (service role) ----
  $subs = RestQ 'company_subscriptions?select=id&company_id=eq.3&provider_subscription_id=eq.rb-qa-1'
  if (@($subs).Count -eq 0) {
    $created = RestPost 'company_subscriptions' '{"company_id":3,"plan_id":2,"status":"pending","provider":"hitpay","provider_subscription_id":"rb-qa-1","provider_customer_id":"cust-qa-1","reference":"eptw:3:qa"}'
  }
  $sub = RestQ 'company_subscriptions?select=id,status&company_id=eq.3&provider_subscription_id=eq.rb-qa-1'
  Check 'pending subscription seeded' 'pending' $sub[0].status

  # ---- 1. charge.created succeeded -> active + payment recorded ----
  $charge = '{"id":"chg-qa-1","channel":"recurrent","customer_id":"cust-qa-1","status":"succeeded","customer":{"name":"QA","email":"qa@test.com"},"currency":"MYR","amount":99,"closed_at":"2026-08-24T10:00:00+08:00","created_at":"2026-08-24T10:00:00+08:00"}'
  $code = Send-Webhook $charge
  Check 'webhook charge.created succeeded (200)' '200' $code
  $sub = RestQ 'company_subscriptions?select=id,status,provider_subscription_status,current_period_end&company_id=eq.3&provider_subscription_id=eq.rb-qa-1'
  Check 'subscription activated' 'active' $sub[0].status
  Check 'provider status active' 'active' $sub[0].provider_subscription_status
  $pay = RestQ 'payments?select=provider_payment_id,amount,currency,status&provider_payment_id=eq.chg-qa-1'
  Check 'payment recorded (chg-qa-1)' 'succeeded' $pay[0].status
  Check 'payment amount 99' '99' $pay[0].amount

  # ---- 2. duplicate charge -> idempotent (no extra payment, no re-activation) ----
  $code = Send-Webhook $charge
  Check 'duplicate webhook acked (200)' '200' $code
  $payCount = @(RestQ 'payments?select=id&provider_payment_id=eq.chg-qa-1').Count
  Check 'duplicate webhook -> no duplicate payment (1 row)' '1' $payCount

  # ---- 3. failed charge -> failed payment, subscription stays active ----
  $chargeFail = '{"id":"chg-qa-2","channel":"recurrent","customer_id":"cust-qa-1","status":"failed","customer":{"name":"QA","email":"qa@test.com"},"currency":"MYR","amount":99,"created_at":"2026-08-24T11:00:00+08:00"}'
  $code = Send-Webhook $chargeFail
  Check 'webhook failed charge acked (200)' '200' $code
  $payFail = RestQ 'payments?select=status&provider_payment_id=eq.chg-qa-2'
  Check 'failed payment recorded' 'failed' $payFail[0].status
  $sub = RestQ 'company_subscriptions?select=status&company_id=eq.3&provider_subscription_id=eq.rb-qa-1'
  Check 'subscription stays active after failed charge (grace)' 'active' $sub[0].status

  # ---- 4. subscription_updated expired -> internal expired ----
  $subExp = '{"id":"rbs-qa-1","recurring_billing_id":"rb-qa-1","status":"expired","cycle":"monthly"}'
  $code = Send-Webhook $subExp
  Check 'subscription_updated expired acked (200)' '200' $code
  $sub = RestQ 'company_subscriptions?select=status,provider_subscription_status&company_id=eq.3&provider_subscription_id=eq.rb-qa-1'
  Check 'subscription -> expired (downgrade)' 'expired' $sub[0].status

  # ---- 5. subscription_updated active -> active again ----
  $subAct = '{"id":"rbs-qa-2","recurring_billing_id":"rb-qa-1","status":"active","cycle":"monthly"}'
  $code = Send-Webhook $subAct
  Check 'subscription_updated active acked (200)' '200' $code
  $sub = RestQ 'company_subscriptions?select=status&company_id=eq.3&provider_subscription_id=eq.rb-qa-1'
  Check 'subscription -> active again' 'active' $sub[0].status

  # ---- 6. subscription_updated cancelled -> internal cancelled ----
  $subCan = '{"id":"rbs-qa-3","recurring_billing_id":"rb-qa-1","status":"cancelled","cycle":"monthly"}'
  $code = Send-Webhook $subCan
  Check 'subscription_updated cancelled acked (200)' '200' $code
  $sub = RestQ 'company_subscriptions?select=status&company_id=eq.3&provider_subscription_id=eq.rb-qa-1'
  Check 'subscription -> cancelled' 'cancelled' $sub[0].status

  # ---- 7. bad signature -> 401 ----
  $code = Send-Webhook $charge 'wrong-signature'
  Check 'bad signature rejected (401)' '401' $code

  # ---- 8. unknown company payload -> acked but no state change ----
  $unknown = '{"id":"chg-qa-9","channel":"recurrent","customer_id":"no-such-customer","status":"succeeded","currency":"MYR","amount":99,"created_at":"2026-08-24T12:00:00+08:00"}'
  $code = Send-Webhook $unknown
  Check 'unmatched payload acked (200)' '200' $code
}

elseif ($Mode -eq 'checkout') {
  $r = Invoke-Api $SM3 'POST' '/api/billing/checkout'
  Check 'checkout without HitPay credentials (503 not configured)' '503' $r.Status
  $r = Invoke-Api $IS1 'POST' '/api/billing/checkout'
  Check 'internal_staff cannot start checkout (403)' '403' $r.Status
  $page = & curl.exe -s -o NUL -w '%{http_code}' "$base/settings/subscription" -H "Cookie: $SM3" --max-time 20
  Check 'GET /settings/subscription (200)' '200' $page
}

elseif ($Mode -eq 'cancel') {
  # seed an ACTIVE subscription so the cancel route reaches the provider call
  $subs = RestQ 'company_subscriptions?select=id&company_id=eq.3&provider_subscription_id=eq.rb-qa-cancel'
  if (@($subs).Count -eq 0) {
    RestPost 'company_subscriptions' '{"company_id":3,"plan_id":2,"status":"active","provider":"hitpay","provider_subscription_id":"rb-qa-cancel","provider_customer_id":"cust-qa-cancel","reference":"eptw:3:qacancel"}' | Out-Null
  }
  $r = Invoke-Api $SM3 'POST' '/api/billing/cancel'
  Check 'cancel without HitPay credentials (503 not configured)' '503' $r.Status
  $r = Invoke-Api $IS1 'POST' '/api/billing/cancel'
  Check 'internal_staff cannot cancel (403)' '403' $r.Status
}

elseif ($Mode -eq 'rls') {
  # seed a payment row for company 3
  $pay = RestQ 'payments?select=id&provider_payment_id=eq.pay-qa-rls'
  if (@($pay).Count -eq 0) {
    RestPost 'payments' '{"company_id":3,"provider":"hitpay","provider_payment_id":"pay-qa-rls","amount":99,"currency":"MYR","status":"succeeded"}' | Out-Null
  }
  $isTok = (Get-Session 'supervisor@company.com').access_token
  $smTok = (Get-Session 'safetymanager@test.com').access_token
  $paTok = (Get-Session 'mhazeeq99@gmail.com').access_token
  $isRows = @(RestQUser 'payments?select=id&company_id=eq.3' $isTok)
  Check 'company-1 user cannot see company-3 payments (0 rows)' '0' $isRows.Count
  $smRows = @(RestQUser 'payments?select=id&company_id=eq.3' $smTok)
  Check 'company-3 user sees own payments (1 row)' '1' $smRows.Count
  $paRows = @(RestQUser 'payments?select=id&company_id=eq.3' $paTok)
  Check 'platform admin sees payments (1 row)' '1' $paRows.Count
  $beRows = @(RestQUser 'billing_events?select=id&limit=5' $isTok)
  Check 'company user cannot see billing_events (0 rows)' '0' $beRows.Count
  try {
    $isTok2 = $isTok
    Invoke-RestMethod -Uri "$url/rest/v1/payments" -Method Post -Headers @{ apikey = $sr; Authorization = "Bearer $isTok2"; 'Content-Type' = 'application/json' } -Body '{"company_id":1,"provider":"hitpay","provider_payment_id":"pay-qa-forced","amount":99,"currency":"MYR","status":"succeeded"}' -TimeoutSec 15 | Out-Null
    Check 'company user cannot INSERT payment (403)' '403' '200'
  } catch { $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }; Check 'company user cannot INSERT payment (403)' '403' $code }
}

elseif ($Mode -eq 'cleanup') {
  $d1 = RestDelete 'company_subscriptions?company_id=eq.3&provider_subscription_id=in.(rb-qa-1,rb-qa-cancel)'
  $d2 = RestDelete 'payments?provider_payment_id=in.(chg-qa-1,chg-qa-2,pay-qa-rls)'
  $d3 = RestDelete 'billing_events?provider_event_id=in.(chg-qa-1,chg-qa-2,chg-qa-9,rbs-qa-1,rbs-qa-2,rbs-qa-3)'
  $left = @(RestQ 'company_subscriptions?select=id&provider_subscription_id=like.rb-qa%25').Count
  Check 'cleanup: no QA subscriptions remain' '0' $left
  $leftPay = @(RestQ 'payments?select=id&provider_payment_id=like.pay-qa%25').Count
  Check 'cleanup: no QA payments remain' '0' $leftPay
  $leftBe = @(RestQ 'billing_events?select=id&provider_event_id=like.chg-qa%25').Count + @(RestQ 'billing_events?select=id&provider_event_id=like.rbs-qa%25').Count
  Check 'cleanup: no QA billing_events remain' '0' $leftBe
}

Write-Output ''
Write-Output "TOTAL (mode=$Mode): PASS=$pass FAIL=$fail"
