#!/usr/bin/env bash
# apigen.sh — the API spec, made from the backend's own code, and everything made from
# it: the API reference docs and the CLI's `malapos api …` commands. (Malapos has no
# SDK package of its own yet; when one lands, add its `sdk.mjs` line here.) Run after
# changing a route; CI runs `--check`, which fails when any of them is out of date.
#   ./scripts/apigen.sh           # regenerate
#   ./scripts/apigen.sh --check   # verify only
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
CHECK="${1:-}"
G="$ROOT/tools/apigen"
[ -d "$G/node_modules" ] || (cd "$G" && npm ci --silent --no-audit --no-fund)
[ -d backend/node_modules ] || (cd backend && npm ci --silent --no-audit --no-fund)
(cd backend && node --import tsx "$G/spec.mjs" --out openapi.json)
node "$G/docs.mjs" --spec backend/openapi.json --out copy/docs/api/reference \
  --nav frontend/src/lib/docs-reference.generated.ts --brand malapos --base-url https://malapos.com \
  --auth-header "Authorization: Bearer sk_live_…" $CHECK
node "$G/cli.mjs" --spec backend/openapi.json --out cli/src/commands/api.generated.ts $CHECK
if [ "$CHECK" = "--check" ]; then
  git diff --exit-code -- backend/openapi.json || { echo "backend/openapi.json is stale: run ./scripts/apigen.sh" >&2; exit 1; }
fi
