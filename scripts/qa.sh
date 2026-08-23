#!/usr/bin/env bash
# ePTW QA harness — exercises the real Next.js API routes as real users
# by constructing Supabase SSR session cookies from password-grant tokens.
set -u
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2 | tr -d ' \r')
SR=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2 | tr -d ' \r')
REF=$(echo "$URL" | sed -E 's|https://([^.]+)\..*|\1|')
BASE=http://localhost:3457
COOKIE_NAME="sb-$REF-auth-token"
PW="${QA_PASSWORD:?Set QA_PASSWORD (test-account password) to run the QA harness}"

get_cookie () {
  local email="$1"
  local session
  session=$(curl -s -m 15 -X POST "$URL/auth/v1/token?grant_type=password" \
    -H "apikey: $SR" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PW\"}")
  local access refresh user expires_in
  access=$(echo "$session" | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
  refresh=$(echo "$session" | python3 -c "import json,sys; print(json.load(sys.stdin)['refresh_token'])")
  user=$(echo "$session" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['user']))")
  expires_in=$(echo "$session" | python3 -c "import json,sys; print(json.load(sys.stdin)['expires_in'])")
  local expires_at=$(( $(date +%s) + expires_in ))
  local payload
  payload=$(python3 -c "
import json,sys,base64
s = {'access_token': sys.argv[1], 'refresh_token': sys.argv[2], 'expires_at': int(sys.argv[3]), 'expires_in': int(sys.argv[4]), 'token_type': 'bearer', 'user': json.loads(sys.argv[5])}
raw = base64.b64encode(json.dumps(s).encode()).decode()
print('base64-' + raw.replace('+', '-').replace('/', '_').rstrip('='))
" "$access" "$refresh" "$expires_at" "$expires_in" "$user")
  echo "$COOKIE_NAME=$payload"
}

api () { # api <cookie> <method> <path> [json-body]
  local cookie="$1" method="$2" path="$3" body="${4:-}"
  local args=(-s -m 30 -o /dev/null -w "%{http_code}" -X "$method" "$BASE$path" -H "Cookie: $cookie")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  curl "${args[@]}"
}

api_json () { # api_json <cookie> <method> <path> [json-body] -> prints body
  local cookie="$1" method="$2" path="$3" body="${4:-}"
  local args=(-s -m 30 -X "$method" "$BASE$path" -H "Cookie: $cookie")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  curl "${args[@]}"
}

echo "QA harness ready. Ref=$REF, Base=$BASE"
