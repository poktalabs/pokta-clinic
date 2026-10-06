#!/usr/bin/env bash
# Exercises the agent tools against a running apps/web (default http://localhost:3000) and EHR.
# Usage: scripts/tools-smoke.sh [base-url]. Reads TOOL_SECRET from apps/web/.env.local.
set -uo pipefail
BASE="${1:-http://localhost:3000}"
SECRET="$(grep '^TOOL_SECRET=' "$(dirname "$0")/../apps/web/.env.local" | cut -d= -f2-)"
CONV="smoke-$(date +%s)"
PHONE="55$(printf '%08d' $((RANDOM * RANDOM % 100000000)))"
FAIL=0

call() { # tool, json body, [secret]
  curl -s -w '\n%{http_code}' -X POST "$BASE/api/tools/$1" -H 'Content-Type: application/json' \
    -H "x-pokta-tool-secret: ${3-$SECRET}" -d "$2"
}
check() { # label, expected status, expected substring, response
  local status body; status="$(tail -n1 <<<"$4")"; body="$(sed '$d' <<<"$4")"
  if [[ "$status" == "$2" && "$body" == *"$3"* ]]; then echo "PASS  $1 ($status)"; else echo "FAIL  $1: got $status $body"; FAIL=1; fi
}

# JSON bodies live in variables: inside $(...) bash would brace-expand {"a":1,"b":2}.
j() { local out="" sep=""; while (($#)); do out+="$sep\"$1\":$2"; sep=","; shift 2; done; printf '{%s}' "$out"; }
C="\"$CONV\""; P="\"$PHONE\""
FIND="$(j conversation_id "$C" phone "$P")"
FIND_FORMATTED="$(j conversation_id "$C" phone "\"+52 ${PHONE:0:2} ${PHONE:2:4} ${PHONE:6}\"")"
SAVE_MIN="$(j conversation_id "$C" nombre '"Lucia"' primer_apellido '"Mendoza"' telefono "$P")"
SAVE_SHORT="$(j conversation_id "$C" nombre '"Lucia"' primer_apellido '"Mendoza"' telefono '"55123"')"
SAVE_FULL="$(j conversation_id "$C" nombre '"Lucia"' primer_apellido '"Mendoza"' segundo_apellido '"Rios"' telefono "$P" fecha_nacimiento '"1988-03-14"' sexo '"M"')"
CONSENT_YES="$(j conversation_id "$C" granted true)"
CONSENT_MISSING="$(j conversation_id "$C")"
C2="\"$CONV-refused\""
CONSENT_NO="$(j conversation_id "$C2" granted false)"
FIND_REFUSED="$(j conversation_id "$C2" phone "$P")"

check "no secret is rejected"            401 'unauthorized'               "$(call find_patient "$FIND" '')"
check "bad input is rejected"            400 'Invalid input'              "$(call record_consent "$CONSENT_MISSING")"
check "find before consent is refused"   200 '"consent_required":true'    "$(call find_patient "$FIND")"
check "save before consent is refused"   200 '"consent_required":true'    "$(call save_patient "$SAVE_MIN")"
check "consent is recorded"              200 '"granted":true'             "$(call record_consent "$CONSENT_YES")"
check "unknown phone is not found"       200 '"found":false'              "$(call find_patient "$FIND_FORMATTED")"
check "short phone asks to repeat"       200 '"invalid_phone":true'       "$(call save_patient "$SAVE_SHORT")"
check "new patient is saved"             200 '"already_registered":false' "$(call save_patient "$SAVE_FULL")"
check "saved patient is found by phone"  200 '"given_name":"Lucia"'       "$(call find_patient "$FIND")"
check "same phone is not duplicated"     200 '"already_registered":true'  "$(call save_patient "$SAVE_MIN")"
call record_consent "$CONSENT_NO" >/dev/null
check "refused consent blocks lookup"    200 '"consent_required":true'    "$(call find_patient "$FIND_REFUSED")"

exit $FAIL
