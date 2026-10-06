#!/usr/bin/env bash
# Exercises the agent tools against a running apps/web (default http://localhost:3000) and EHR.
# Usage: scripts/tools-smoke.sh [base-url]. TOOL_SECRET comes from the environment, else apps/web/.env.local.
# The golden sequence books a real first consultation (calendar event in the branch's calendar +
# Appointment at its Location) for a throwaway patient, at the branch of the first offered slot. Set SMOKE_SKIP_BOOKING=1 to stop before the scheduling checks against a real calendar.
# Needs jq.
set -uo pipefail
BASE="${1:-http://localhost:3000}"
SECRET="${TOOL_SECRET:-$(grep '^TOOL_SECRET=' "$(dirname "$0")/../apps/web/.env.local" | cut -d= -f2-)}"
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

# --- Golden path: history, scheduling, escalation -------------------------------------------------
PID="$(jq -r .patient_id <<<"$(sed '$d' <<<"$(call find_patient "$FIND")")")"
hist() { # status, answers-json, chief complaint
  jq -nc --arg c "$CONV" --arg p "$PID" --arg s "$1" --argjson a "$2" --arg cc "$3" \
    '{conversation_id:$c, patient_id:$p, status:$s, answers:$a, chief_complaint:$cc}'
}
PARTIAL='[{"link_id":"onset-duration","answer":"hace tres meses, poco a poco"},{"link_id":"bogus-item","answer":"ignored"}]'
FULL='[{"link_id":"onset-duration","answer":"hace tres meses, poco a poco"},{"link_id":"joints-involved","answer":"manos, ambos lados"},{"link_id":"morning-stiffness-min","answer":"unos 45 minutos"},{"link_id":"joint-swelling","answer":"si"},{"link_id":"systemic-symptoms","answer":"cansancio"},{"link_id":"extra-articular","answer":"no"},{"link_id":"current-medications","answer":"ibuprofeno"},{"link_id":"allergies","answer":"ninguna"},{"link_id":"prior-dx-tests","answer":"no sabe"},{"link_id":"family-history","answer":"mi mama tiene artritis"}]'
OTHER_PATIENT="$(jq -nc --arg c "$CONV" '{conversation_id:$c, patient_id:"00000000-0000-0000-0000-000000000000", status:"in-progress", answers:[], chief_complaint:"x"}')"
Q="$(j conversation_id "$C")"

check "questionnaire needs consent"      200 '"consent_required":true'    "$(call get_questionnaire "$(j conversation_id "\"$CONV-refused\"")")"
check "questionnaire lists the items"    200 '"link_id":"chief-complaint"' "$(call get_questionnaire "$Q")"
check "history for another patient is refused" 200 '"patient_mismatch":true' "$(call save_history "$OTHER_PATIENT")"
check "partial history saves in progress" 200 '"saved":true'              "$(call save_history "$(hist in-progress "$PARTIAL" 'me duelen las manos')")"
check "completed with gaps lists them"   200 '"saved":false'              "$(call save_history "$(hist completed "$PARTIAL" 'me duelen las manos')")"
check "gaps name the missing items"      200 'joints-involved'            "$(call save_history "$(hist completed "$PARTIAL" 'me duelen las manos')")"
check "full history saves as completed"  200 '"saved":true'               "$(call save_history "$(hist completed "$FULL" 'me duelen las manos')")"
check "history can be re-saved"          200 '"status":"completed"'       "$(call save_history "$(hist completed "$FULL" 'me duelen las manos')")"

check "availability needs consent"       200 '"consent_required":true'    "$(call check_availability "$(j conversation_id "\"$CONV-refused\"")")"
AV="$(call check_availability "$Q")"
check "availability returns slots"       200 '"label"'                    "$AV"
check "slots carry branch and practitioner" 200 '"practitioner_name"'     "$AV"
check "slots carry the branch name"      200 '"branch_name":"GMA '        "$AV"
check "availability honours part of day" 200 '"slots"'                    "$(call check_availability "$(j conversation_id "$C" part_of_day '"afternoon"')")"
check "availability rejects a bad date"  400 'Invalid input'              "$(call check_availability "$(j conversation_id "$C" preferred_date '"mañana"')")"
check "availability rejects a bad branch" 400 'Invalid input'             "$(call check_availability "$(j conversation_id "$C" branch '"roma"')")"
check "availability accepts any"         200 '"label"'                    "$(call check_availability "$(j conversation_id "$C" branch '"any"')")"
for B in del-valle polanco satelite; do
  BAV="$(call check_availability "$(j conversation_id "$C" branch "\"$B\"")")"
  check "availability at $B returns slots" 200 '"label"'                  "$BAV"
  if [[ "$(jq -r '[.slots[].branch] | unique | join(",")' <<<"$(sed '$d' <<<"$BAV")")" == "$B" ]]; then echo "PASS  availability at $B only offers $B"; else echo "FAIL  availability at $B offered another branch: $BAV"; FAIL=1; fi
done

if [[ "${SMOKE_SKIP_BOOKING:-0}" != 1 ]]; then
  START="$(jq -r '.slots[0].start' <<<"$(sed '$d' <<<"$AV")")"
  BRANCH="$(jq -r '.slots[0].branch' <<<"$(sed '$d' <<<"$AV")")"
  book() { jq -nc --arg c "$1" --arg p "$2" --arg b "$3" --arg s "$4" '{conversation_id:$c, patient_id:$p, branch:$b, start:$s}'; }
  check "booking needs a branch"         400 'Invalid input'              "$(call book_appointment "$(jq -nc --arg c "$CONV" --arg p "$PID" --arg s "$START" '{conversation_id:$c, patient_id:$p, start:$s}')")"
  check "off-grid start is refused"      200 '"booked":false'             "$(call book_appointment "$(book "$CONV" "$PID" "$BRANCH" "2030-01-01T03:00:00-06:00")")"
  # Saturday starts exist only at Satelite: another branch must refuse one.
  inDays() { date -v+"$1"d "$2" 2>/dev/null || date -d "+$1 days" "$2"; }
  for i in 2 3 4 5 6 7 8; do [[ "$(inDays "$i" +%u)" == 6 ]] && { SAT_DATE="$(inDays "$i" +%Y-%m-%d)"; break; }; done
  SAT="$(call check_availability "$(j conversation_id "$C" branch '"satelite"' preferred_date "\"$SAT_DATE\"")")"
  check "satelite offers Saturday slots" 200 '"branch":"satelite"'        "$SAT"
  SAT_START="$(jq -r '.slots[0].start' <<<"$(sed '$d' <<<"$SAT")")"
  check "a Saturday start is refused outside Satelite" 200 '"booked":false' "$(call book_appointment "$(book "$CONV" "$PID" polanco "$SAT_START")")"
  BOOKED="$(call book_appointment "$(book "$CONV" "$PID" "$BRANCH" "$START")")"
  check "slot is booked"                 200 '"booked":true'              "$BOOKED"
  check "booking names the branch"       200 "\"branch\":\"$BRANCH\""     "$BOOKED"
  check "booking returns the address"    200 '"address":"'                "$BOOKED"
  check "booking returns the practitioner" 200 '"practitioner_name":"'    "$BOOKED"
  APPT="$(jq -r .appointment_id <<<"$(sed '$d' <<<"$BOOKED")")"
  check "booking again is idempotent"    200 "\"appointment_id\":\"$APPT\"" "$(call book_appointment "$(book "$CONV" "$PID" "$BRANCH" "$START")")"

  # A second Conversation must not get the slot the first one holds.
  CONV3="$CONV-second"; PHONE3="55$(printf '%08d' $((RANDOM * RANDOM % 100000000)))"
  call record_consent "$(jq -nc --arg c "$CONV3" '{conversation_id:$c, granted:true}')" >/dev/null
  SAVED3="$(call save_patient "$(jq -nc --arg c "$CONV3" --arg t "$PHONE3" '{conversation_id:$c, nombre:"Mario", primer_apellido:"Lopez", telefono:$t}')")"
  PID3="$(jq -r .patient_id <<<"$(sed '$d' <<<"$SAVED3")")"
  check "taken slot is not double-booked" 200 '"booked":false'            "$(call book_appointment "$(book "$CONV3" "$PID3" "$BRANCH" "$START")")"
  OFFER="$(call check_availability "$(jq -nc --arg c "$CONV3" --arg b "$BRANCH" '{conversation_id:$c, branch:$b}')")"
  if [[ "$OFFER" != *"$START"* && "$OFFER" == *'"label"'* ]]; then echo "PASS  taken slot leaves the offer list"; else echo "FAIL  taken slot still offered or none offered: $OFFER"; FAIL=1; fi
fi

CONV4="$CONV-redflag"
ESC="$(jq -nc --arg c "$CONV4" '{conversation_id:$c, severity:"emergencia", patient_words:"me duele el pecho y me falta el aire", instruction_given:"llamar al 911"}')"
ESC_BAD_PATIENT="$(jq -nc --arg c "$CONV4-b" '{conversation_id:$c, severity:"urgencia", patient_words:"ojo rojo y dolor de cabeza fuerte", instruction_given:"ir a urgencias hoy", patient_id:"00000000-0000-0000-0000-000000000000"}')"
check "escalation works without consent" 200 '"logged":true'              "$(call escalate "$ESC")"
check "escalation survives a bad patient id" 200 '"logged":true'          "$(call escalate "$ESC_BAD_PATIENT")"
check "escalation validates severity"    400 'Invalid input'              "$(call escalate "$(jq -nc --arg c "$CONV4" '{conversation_id:$c, severity:"alta", patient_words:"x", instruction_given:"y"}')")"

exit $FAIL
