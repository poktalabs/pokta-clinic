#!/usr/bin/env bash
# Generates fresh production secrets into .env.production.local (gitignored, mode 600). Never prints values.
# Usage: scripts/gen-secrets.sh [--force]. Refuses to overwrite an existing file without --force.
set -euo pipefail
OUT="$(dirname "$0")/../.env.production.local"
if [[ -e "$OUT" && "${1:-}" != "--force" ]]; then
  echo "refusing to overwrite $OUT (pass --force to rotate)" >&2
  exit 1
fi
umask 077
{
  echo "EHR_CLIENT_ID=ehr-$(openssl rand -hex 8)"
  echo "EHR_CLIENT_SECRET=$(openssl rand -hex 32)"
  echo "TOOL_SECRET=$(openssl rand -hex 32)"
} > "$OUT"
chmod 600 "$OUT"
echo "wrote $(cut -d= -f1 "$OUT" | paste -sd, -) to .env.production.local"
