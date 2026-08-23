#!/usr/bin/env bash
set -u
source scripts/qa.sh
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2 | tr -d ' \r')
SR=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2 | tr -d ' \r')
PASS=0; FAIL=0
check () { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS | $1 (got $3)"; else FAIL=$((FAIL+1)); echo "FAIL | $1 expected=$2 got=$3"; fi }
db () { curl -s -m 15 -H "apikey: $SR" -H "Authorization: Bearer $SR" "$URL/rest/v1/$1"; }

SM1=$(get_cookie safetymanager@test.com)     # safety_manager (company 3)
SC1=$(get_cookie safetycoord1@test.com)      # safety_coordinator (company 1)
C1=$(get_cookie supervisor@company.com)      # internal_staff (company 1)
CON=$(get_cookie contractor@test.com)        # contractor_admin (contractor 1)
PA=$(get_cookie mhazeeq99@gmail.com)         # platform_admin

echo "========== SELF-APPROVAL TEST A: Safety Coordinator self-approve (company 1) =========="
CREATE=$(api_json "$SC1" POST /api/permits '{"company_id":1,"permit_type_id":2,"work_title":"QA SC self-approve","work_description":"QA","work_location":"QA","planned_start":"2026-12-10T08:00:00","planned_end":"2026-12-10T17:00:00"}')
PID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])")
api "$SC1" POST /api/permits/$PID/submit > /dev/null
JHA=$(api_json "$SC1" POST /api/permits/$PID/jha '{"title":"QA JHA"}')
JHAID=$(echo "$JHA" | python3 -c "import json,sys; print(json.load(sys.stdin)['jha']['id'])")
api "$SC1" POST /api/permits/$PID/jha/$JHAID/verify '{"status":"verified"}' > /dev/null
for cid in $(db "permit_safety_controls?select=id,is_required,status&permit_id=eq.$PID" | python3 -c "import json,sys; [print(c['id']) for c in json.load(sys.stdin) if c['is_required'] and c['status']=='pending']"); do
  api "$SC1" PATCH /api/permits/$PID/safety-controls/$cid/verify '{"remarks":"ok"}' > /dev/null
done
check "SC self-approve (200)" "200" "$(api "$SC1" POST /api/permits/$PID/approve-and-issue)"
check "SC self-approve -> active" "active" "$(db "permits?select=status&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['status'])")"
H=$(db "permit_approvals?select=action&permit_id=eq.$PID&order=created_at")
echo "history: $(echo "$H" | python3 -c "import json,sys; print(', '.join(a['action'] for a in json.load(sys.stdin)))")"
check "audit exactly submitted,approved,issued" "submitted, approved, issued" "$(echo "$H" | python3 -c "import json,sys; print(', '.join(a['action'] for a in json.load(sys.stdin)))")"
echo "========== TEST A DONE =========="

echo "========== SELF-APPROVAL TEST B: Safety Manager self-approve (company 3) =========="
CREATE=$(api_json "$SM1" POST /api/permits '{"company_id":3,"permit_type_id":10,"work_title":"QA SM self-approve","work_description":"QA","work_location":"QA","planned_start":"2026-12-11T08:00:00","planned_end":"2026-12-11T17:00:00"}')
PID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])")
api "$SM1" POST /api/permits/$PID/submit > /dev/null
JHA=$(api_json "$SM1" POST /api/permits/$PID/jha '{"title":"QA JHA"}')
JHAID=$(echo "$JHA" | python3 -c "import json,sys; print(json.load(sys.stdin)['jha']['id'])")
api "$SM1" POST /api/permits/$PID/jha/$JHAID/verify '{"status":"verified"}' > /dev/null
for cid in $(db "permit_safety_controls?select=id,is_required,status&permit_id=eq.$PID" | python3 -c "import json,sys; [print(c['id']) for c in json.load(sys.stdin) if c['is_required'] and c['status']=='pending']"); do
  api "$SM1" PATCH /api/permits/$PID/safety-controls/$cid/verify '{"remarks":"ok"}' > /dev/null
done
check "SM self-approve (200)" "200" "$(api "$SM1" POST /api/permits/$PID/approve-and-issue)"
check "SM self-approve -> active" "active" "$(db "permits?select=status&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['status'])")"
H=$(db "permit_approvals?select=action&permit_id=eq.$PID&order=created_at")
check "audit exactly submitted,approved,issued" "submitted, approved, issued" "$(echo "$H" | python3 -c "import json,sys; print(', '.join(a['action'] for a in json.load(sys.stdin)))")"
echo "========== TEST B DONE =========="

echo "========== SAFETY GATE: self-approval must fail without verified controls =========="
CREATE=$(api_json "$SC1" POST /api/permits '{"company_id":1,"permit_type_id":2,"work_title":"QA gate test","work_description":"QA","work_location":"QA","planned_start":"2026-12-12T08:00:00","planned_end":"2026-12-12T17:00:00"}')
PID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])")
api "$SC1" POST /api/permits/$PID/submit > /dev/null
check "approve without JHA/controls blocked (400)" "400" "$(api "$SC1" POST /api/permits/$PID/approve-and-issue)"
echo "========== GATE TEST DONE =========="

echo "========== TEST C: Internal Staff cannot approve =========="
CREATE=$(api_json "$C1" POST /api/permits '{"company_id":1,"permit_type_id":2,"work_title":"QA internal staff PTW","work_description":"QA","work_location":"QA","planned_start":"2026-12-13T08:00:00","planned_end":"2026-12-13T17:00:00"}')
PID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])")
api "$C1" POST /api/permits/$PID/submit > /dev/null
check "internal staff cannot approve (403)" "403" "$(api "$C1" POST /api/permits/$PID/approve-and-issue)"
check "internal staff cannot reject (403)" "403" "$(api "$C1" POST /api/permits/$PID/reject '{"remarks":"x"}')"
check "internal staff cannot suspend (403)" "403" "$(api "$C1" POST /api/permits/$PID/suspend '{"remarks":"x"}')"
check "internal staff cannot manage users (403)" "403" "$(api "$C1" POST /api/company/users '{"full_name":"X","email":"x@x.com","role":"internal_staff"}')"
echo "========== TEST C DONE =========="

echo "========== TEST D: Contractor Admin flow + cannot approve =========="
CREATE=$(api_json "$CON" POST /api/permits '{"company_id":1,"permit_type_id":2,"work_title":"QA contractor PTW","work_description":"QA","work_location":"QA","planned_start":"2026-12-14T08:00:00","planned_end":"2026-12-14T17:00:00","worker_name":"Mohd Ali","worker_id":"CT-2045","staff_reference_name":"Ahmad bin Ali"}')
PID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])")
check "contractor create with worker fields (200)" "200" "$(echo "$CREATE" | python3 -c "import json,sys; print('200' if 'permit' in json.load(sys.stdin) else 'fail')")"
check "contractor create missing worker fields blocked (400)" "400" "$(api "$CON" POST /api/permits '{"company_id":1,"permit_type_id":2,"work_title":"QA con no worker","work_description":"QA","work_location":"QA"}')"
W=$(db "permits?select=worker_name,worker_id,staff_reference_name,initiation_mode&id=eq.$PID")
check "worker details persisted" "yes" "$(echo "$W" | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print('yes' if d['worker_name']=='Mohd Ali' and d['staff_reference_name']=='Ahmad bin Ali' and d['initiation_mode']=='contractor_direct' else 'no')")"
api "$CON" POST /api/permits/$PID/submit > /dev/null
check "contractor cannot approve (403)" "403" "$(api "$CON" POST /api/permits/$PID/approve-and-issue)"
check "contractor cannot reject (403)" "403" "$(api "$CON" POST /api/permits/$PID/reject '{"remarks":"x"}')"
check "internal staff cannot approve contractor PTW (403)" "403" "$(api "$C1" POST /api/permits/$PID/approve-and-issue)"
echo "========== TEST D DONE =========="

echo "========== PLATFORM ADMIN: not operational =========="
check "platform admin cannot create PTW (403)" "403" "$(api "$PA" POST /api/permits '{"company_id":1,"permit_type_id":2,"work_title":"QA PA","work_description":"QA","work_location":"QA"}')"
check "platform admin cannot approve (403)" "403" "$(api "$PA" POST /api/permits/$PID/approve-and-issue)"
echo "========== PLATFORM ADMIN DONE =========="

echo
echo "TOTAL: PASS=$PASS FAIL=$FAIL"
