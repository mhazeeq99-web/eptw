#!/usr/bin/env bash
set -u
source scripts/qa.sh
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2 | tr -d ' \r')
SR=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2 | tr -d ' \r')
PASS=0; FAIL=0
check () { # check <desc> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS | $1 (got $3)"; else FAIL=$((FAIL+1)); echo "FAIL | $1 expected=$2 got=$3"; fi
}
db () { curl -s -m 15 -H "apikey: $SR" -H "Authorization: Bearer $SR" "$URL/rest/v1/$1"; }
dbpost () { curl -s -m 15 -X POST -H "apikey: $SR" -H "Authorization: Bearer $SR" -H "Content-Type: application/json" -d "$2" "$URL/rest/v1/$1"; }

C1=$(get_cookie supervisor@company.com)      # company 1 supervisor
ISS=$(get_cookie issuer@company.com)          # company 1 permit issuer
SC1=$(get_cookie safetycoord1@test.com)       # company 1 safety coordinator
C3=$(get_cookie worksup@test.com)             # company 3 work supervisor
SM3=$(get_cookie safetymanager@test.com)      # company 3 safety manager
CON=$(get_cookie contractor@test.com)         # contractor 1

echo "========== TEST A: FULL HAPPY PATH (company 1) =========="
# 1. create
CREATE=$(api_json "$C1" POST /api/permits '{"company_id":1,"permit_type_id":2,"work_title":"QA happy path permit","work_description":"QA","work_location":"QA area","planned_start":"2026-12-01T08:00:00","planned_end":"2026-12-01T17:00:00"}')
PID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['id'])" 2>/dev/null)
echo "created permit id=$PID"
check "create status=draft" "draft" "$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['permit']['status'])")"

# 2. invalid: approve a DRAFT
check "approve draft blocked (400)" "400" "$(api "$SC1" POST /api/permits/$PID/approve-and-issue)"

# 3. submit
check "submit (200)" "200" "$(api "$C1" POST /api/permits/$PID/submit)"

# 4. requester cannot approve (role)
check "requester approve blocked (403)" "403" "$(api "$C1" POST /api/permits/$PID/approve-and-issue)"

# 5. approve without verified controls/JHA (400)
check "approve without JHA/controls (400)" "400" "$(api "$SC1" POST /api/permits/$PID/approve-and-issue)"

# 6. add JHA as requester
JHA=$(api_json "$C1" POST /api/permits/$PID/jha '{"title":"QA JHA","description":"steps","hazards_controls":[{"hazard":"fire","control":"extinguisher"}]}')
JHAID=$(echo "$JHA" | python3 -c "import json,sys; print(json.load(sys.stdin)['jha']['id'])" 2>/dev/null)
echo "jha id=$JHAID"
check "add JHA (201)" "201" "$(echo "$JHA" | python3 -c "import json,sys; print('201' if 'jha' in json.load(sys.stdin) else 'fail')")"

# 7. verify JHA as safety coordinator
check "verify JHA (200)" "200" "$(api "$SC1" POST /api/permits/$PID/jha/$JHAID/verify '{"status":"verified"}')"

# 8. verify required safety controls
CONTROLS=$(db "permit_safety_controls?select=id,is_required,status&permit_id=eq.$PID")
echo "controls: $(echo "$CONTROLS" | head -c 200)"
for cid in $(echo "$CONTROLS" | python3 -c "import json,sys; [print(c['id']) for c in json.load(sys.stdin) if c['is_required'] and c['status']=='pending']"); do
  check "verify control $cid (200)" "200" "$(api "$SC1" PATCH /api/permits/$PID/safety-controls/$cid/verify '{"remarks":"verified in QA"}')"
done

# 9. approve & issue
check "approve & issue (200)" "200" "$(api "$SC1" POST /api/permits/$PID/approve-and-issue)"
check "status=active" "active" "$(db "permits?select=status&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['status'])")"
check "workflow_stage=active" "active" "$(db "permits?select=workflow_stage&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['workflow_stage'])")"

# 10. audit history for approve
HIST=$(db "permit_approvals?select=action&permit_id=eq.$PID&order=created_at")
echo "history: $(echo "$HIST" | python3 -c "import json,sys; print(', '.join(a['action'] for a in json.load(sys.stdin)))")"
check "audit has approved" "yes" "$(echo "$HIST" | python3 -c "import json,sys; print('yes' if any(a['action']=='approved' for a in json.load(sys.stdin)) else 'no')")"
check "audit has issued" "yes" "$(echo "$HIST" | python3 -c "import json,sys; print('yes' if any(a['action']=='issued' for a in json.load(sys.stdin)) else 'no')")"
check "audit has exactly 3 records" "3" "$(echo "$HIST" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")"

# 11. invalid transitions on active
check "resume active blocked (400)" "400" "$(api "$ISS" POST /api/permits/$PID/resume '{"remarks":"x"}')"
check "close active blocked (400)" "400" "$(api "$ISS" POST /api/permits/$PID/close '{"remarks":"x"}')"

# 12. requester cannot suspend
check "requester suspend blocked (403)" "403" "$(api "$C1" POST /api/permits/$PID/suspend '{"remarks":"x"}')"

# 13. suspend as issuer
check "suspend (200)" "200" "$(api "$ISS" POST /api/permits/$PID/suspend '{"remarks":"Unsafe condition"}')"
check "status=suspended" "suspended" "$(db "permits?select=status&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['status'])")"
check "suspension_reason persisted" "Unsafe condition" "$(db "permits?select=suspension_reason&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['suspension_reason'])")"

# 14. resume
check "resume (200)" "200" "$(api "$ISS" POST /api/permits/$PID/resume '{"remarks":"Resolved"}')"
check "status=active after resume" "active" "$(db "permits?select=status&id=eq.$PID" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['status'])")"

# 15. complete
check "complete (200)" "200" "$(api "$ISS" POST /api/permits/$PID/complete '{"remarks":"Work done"}')"
check "completed_at set" "yes" "$(db "permits?select=completed_at&id=eq.$PID" | python3 -c "import json,sys; print('yes' if json.load(sys.stdin)[0]['completed_at'] else 'no')")"

# 16. close
check "close (200)" "200" "$(api "$ISS" POST /api/permits/$PID/close '{"remarks":"Closed out"}')"
check "closed_at set" "yes" "$(db "permits?select=closed_at&id=eq.$PID" | python3 -c "import json,sys; print('yes' if json.load(sys.stdin)[0]['closed_at'] else 'no')")"

HIST2=$(db "permit_approvals?select=action&permit_id=eq.$PID&order=created_at")
echo "final history: $(echo "$HIST2" | python3 -c "import json,sys; print(', '.join(a['action'] for a in json.load(sys.stdin)))")"
echo "========== TEST A DONE =========="
echo
echo "PID=$PID" > /tmp/qa_pid.txt 2>/dev/null || echo "PID=$PID" > qa_pid.txt
