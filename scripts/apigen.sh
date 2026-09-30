#!/usr/bin/env bash
# apigen.sh — the API spec, made from the backend's own code, and everything made from
# it: the API reference docs, the CLI's `malapos api …` commands and the SDKs'
# `client.api` methods (sdks/js, sdks/python, sdks/go). Run after changing a route; CI
# runs `--check`, which fails when any of them is out of date.
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
node "$G/sdk.mjs" --lang node --brand Malapos --spec backend/openapi.json --out sdks/js/src/api.generated.ts $CHECK
node "$G/sdk.mjs" --lang python --brand Malapos --spec backend/openapi.json --out sdks/python/forjio_malapos/api_generated.py $CHECK
node "$G/sdk.mjs" --lang go --package malapos --brand Malapos --spec backend/openapi.json --out sdks/go/api_generated.go $CHECK
if [ "$CHECK" = "--check" ]; then
  git diff --exit-code -- backend/openapi.json || { echo "backend/openapi.json is stale: run ./scripts/apigen.sh" >&2; exit 1; }
fi
