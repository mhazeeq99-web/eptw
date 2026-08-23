#!/usr/bin/env bash
set -u
source scripts/qa.sh
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2 | tr -d ' \r')
SR=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2 | tr -d ' \r')
PASS=0; FAIL=0
check () { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS | $1 (got $3)"; else FAIL=$((FAIL+1)); echo "FAIL | $1 expected=$2 got=$3"; fi }
db () { curl -s -m 15 -H "apikey: $SR" -H "Authorization: Bearer $SR" "$URL/rest/v1/$1"; }

C1=$(get_cookie supervisor@company.com)
ISS=$(get_cookie issuer@company.com)
SC1=$(get_cookie safetycoord1@test.com)
C3=$(get_cookie worksup@test.com)
SM3=$(get_cookie safetymanager@test.com)
CON=$(get_cookie contractor@test.com)

echo "========== TEST B: REJECT + RESUBMIT (company 1) =========="
CREATE=$(api_json "$C1" POST /api/permits '{"company_id":1,"permit_type_id":2,"work_title":"QA reject permit","work_description":"QA","work_location":"QA","planned_start":"2026-12-02T08:00:00","planned_end":"2026-12-02T17:00:00"}')
PID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])")
api "$C1" POST /api/permits/$PID/submit > /dev/null
check "reject (200)" "200" "$(api "$SC1" POST /api/permits/$PID/reject '{"remarks":"Incomplete details"}')"
check "status=rejected" "rejected" "$(db "permits?select=status&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['status'])")"
check "rejection_reason persisted" "Incomplete details" "$(db "permits?select=rejection_reason&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['rejection_reason'])")"
check "approve rejected blocked (400)" "400" "$(api "$SC1" POST /api/permits/$PID/approve-and-issue)"
check "requester resubmit (200)" "200" "$(api "$C1" POST /api/permits/$PID/resubmit)"
check "status after resubmit" "pending_approval" "$(db "permits?select=status&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['status'])")"
check "stage after resubmit" "safety_approval" "$(db "permits?select=workflow_stage&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['workflow_stage'])")"
H=$(db "permit_approvals?select=action&permit_id=eq.$PID&order=created_at")
echo "history: $(echo "$H" | python3 -c "import json,sys; print(', '.join(a['action'] for a in json.load(sys.stdin)))")"
check "history has rejected" "yes" "$(echo "$H" | python3 -c "import json,sys; print('yes' if any(a['action']=='rejected' for a in json.load(sys.stdin)) else 'no')")"
check "history has resubmitted" "yes" "$(echo "$H" | python3 -c "import json,sys; print('yes' if any(a['action']=='resubmitted' for a in json.load(sys.stdin)) else 'no')")"
echo "========== TEST B DONE =========="

echo "========== TEST C: ROLE + CROSS-COMPANY RESTRICTIONS =========="
# C3 user creates + submits a company-3 permit
CREATE3=$(api_json "$C3" POST /api/permits '{"company_id":3,"permit_type_id":10,"work_title":"QA C3 permit","work_description":"QA","work_location":"QA","planned_start":"2026-12-03T08:00:00","planned_end":"2026-12-03T17:00:00"}')
PID3=$(echo "$CREATE3" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])")
api "$C3" POST /api/permits/$PID3/submit > /dev/null
check "SC1 (company1) approve C3 permit denied (404 hidden)" "404" "$(api "$SC1" POST /api/permits/$PID3/approve-and-issue)"
check "SM3 (company3) can approve C3 permit (400=missing docs not authz)" "400" "$(api "$SM3" POST /api/permits/$PID3/approve-and-issue)"
check "contractor create C3 permit blocked (403)" "403" "$(api "$CON" POST /api/permits '{"company_id":3,"permit_type_id":10,"work_title":"QA con","work_description":"QA","work_location":"QA"}')"
check "contractor approve blocked (403)" "403" "$(api "$CON" POST /api/permits/$PID3/approve-and-issue)"
check "supervisor manage users blocked (403)" "403" "$(api "$C1" POST /api/company/users '{"full_name":"X","email":"x@x.com","role":"safety_coordinator"}')"
C1_USERID=$(db "profiles?select=id&email=eq.supervisor@company.com" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
check "SM3 deactivate C1 user denied (404 hidden)" "404" "$(api "$SM3" PATCH /api/company/users/$C1_USERID '{"is_active":false}')"
check "SM3 lists own company users (200)" "200" "$(api "$SM3" GET /api/company/users)"
echo "========== TEST C DONE =========="

echo "========== TEST D: EXPIRY SWEEP + DEDUP =========="
FUTURE=$(date -u -d "+1 hour" +%Y-%m-%dT%H:%M:%S)
CREATE_E=$(api_json "$C1" POST /api/permits "{\"company_id\":1,\"permit_type_id\":2,\"work_title\":\"QA expiring permit\",\"work_description\":\"QA\",\"work_location\":\"QA\",\"planned_start\":\"$(date -u -d "+0 hour" +%Y-%m-%dT%H:%M:%S)\",\"planned_end\":\"$FUTURE\"}")
PIDE=$(echo "$CREATE_E" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])")
api "$C1" POST /api/permits/$PIDE/submit > /dev/null
JHA=$(api_json "$C1" POST /api/permits/$PIDE/jha '{"title":"QA JHA"}')
JHAID=$(echo "$JHA" | python3 -c "import json,sys; print(json.load(sys.stdin)['jha']['id'])")
api "$SC1" POST /api/permits/$PIDE/jha/$JHAID/verify '{"status":"verified"}' > /dev/null
for cid in $(db "permit_safety_controls?select=id,is_required,status&permit_id=eq.$PIDE" | python3 -c "import json,sys; [print(c['id']) for c in json.load(sys.stdin) if c['is_required'] and c['status']=='pending']"); do
  api "$ISS" PATCH /api/permits/$PIDE/safety-controls/$cid/verify '{"remarks":"ok"}' > /dev/null
done
api "$SC1" POST /api/permits/$PIDE/approve-and-issue > /dev/null
check "expiring permit is active" "active" "$(db "permits?select=status&id=eq.$PIDE" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['status'])")"
# trigger dashboard sweep twice
curl -s -m 30 -o /dev/null "$BASE/dashboard" -H "Cookie: $C1"
N1=$(db "notifications?select=id&permit_id=eq.$PIDE&type=eq.permit_expiring_soon" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
curl -s -m 30 -o /dev/null "$BASE/dashboard" -H "Cookie: $C1"
N2=$(db "notifications?select=id&permit_id=eq.$PIDE&type=eq.permit_expiring_soon" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
check "expiry notification created (recipients >0)" "1" "$([ "$N1" -ge 1 ] && echo 1 || echo 0)"
check "expiry notification deduplicated (N2==N1)" "same" "$([ "$N2" = "$N1" ] && echo same || echo "different $N1->$N2")"
echo "========== TEST D DONE =========="

echo "========== TEST E: STORAGE SECURITY =========="
# upload a private object for a company-3 permit path via service role
curl -s -m 15 -o /dev/null -X POST "$URL/storage/v1/object/permit-attachments/18/qa-sec.txt" -H "apikey: $SR" -H "Authorization: Bearer $SR" -H "Content-Type: text/plain" -d "secret company3 data"
C1TOK=$(curl -s -m 15 -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $SR" -H "Content-Type: application/json" -d '{"email":"supervisor@company.com","password":"Test@123456"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
C3TOK=$(curl -s -m 15 -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $SR" -H "Content-Type: application/json" -d '{"email":"safetymanager@test.com","password":"Test@123456"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
R1=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "$URL/storage/v1/object/info/permit-attachments/18/qa-sec.txt" -H "apikey: $SR" -H "Authorization: Bearer $C1TOK")
R2=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "$URL/storage/v1/object/info/permit-attachments/18/qa-sec.txt" -H "apikey: $SR" -H "Authorization: Bearer $C3TOK")
RU=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "$URL/storage/v1/object/info/permit-attachments/18/qa-sec.txt")
check "C1 cannot read C3 attachment (denied)" "400" "$R1"
check "C3 can read own attachment (200)" "200" "$R2"
check "unauthenticated cannot read (denied)" "400" "$RU"
# cleanup
curl -s -m 15 -o /dev/null -X DELETE "$URL/storage/v1/object/permit-attachments/18/qa-sec.txt" -H "apikey: $SR" -H "Authorization: Bearer $SR"
echo "========== TEST E DONE =========="

echo
echo "TOTAL: PASS=$PASS FAIL=$FAIL"
