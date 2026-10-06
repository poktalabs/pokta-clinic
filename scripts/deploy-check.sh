#!/usr/bin/env bash
# Post-deploy smoke. Usage: scripts/deploy-check.sh <ehr-url> <web-url>
# TOOL_SECRET comes from the environment, else .env.production.local. Never prints secrets.
set -uo pipefail
EHR="${1:?usage: deploy-check.sh <ehr-url> <web-url>}"; EHR="${EHR%/}"
WEB="${2:?usage: deploy-check.sh <ehr-url> <web-url>}"; WEB="${WEB%/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -z "${TOOL_SECRET:-}" && -f "$ROOT/.env.production.local" ]]; then
  TOOL_SECRET="$(grep '^TOOL_SECRET=' "$ROOT/.env.production.local" | cut -d= -f2-)"
fi
export TOOL_SECRET
FAIL=0
# The free EHR spins down when idle; the first request can take about a minute.
probe() { # label, url, expected substring
  local body; body="$(curl -s --max-time 90 -w '\n%{http_code}' "$2")"
  if [[ "$(tail -n1 <<<"$body")" == 200 && "$body" == *"$3"* ]]; then echo "PASS  $1"; else echo "FAIL  $1: $(tail -n1 <<<"$body")"; FAIL=1; fi
}
probe "EHR /healthz" "$EHR/healthz" '"ok":true'
probe "EHR /fhir/metadata" "$EHR/fhir/metadata" 'CapabilityStatement'
"$ROOT/scripts/tools-smoke.sh" "$WEB" || FAIL=1
exit $FAIL
