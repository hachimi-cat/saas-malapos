#!/usr/bin/env bash
# rename.sh — Replace template placeholders with this product's identity.
#
# Run once per repo, right after `gh repo create --template`. Idempotent
# (safe to re-run with the same args; second pass is a no-op).
#
# Usage:
#   ./scripts/rename.sh <brand-slug> "<Display Name>" [<accent-hex>] [<backend-port>] [<frontend-port>]
#
# Example:
#   ./scripts/rename.sh kalium "Kalium" "#7C3AED" 4180 3180
#
# What it swaps across backend/ frontend/ cli/ e2e/ .github/ + root docs:
#   forjio-brand           → <brand-slug>           kebab id
#   forjio_brand           → <brand-snake>          snake id (DB names, env)
#   FORJIO_BRAND           → <BRAND_SLUG_UPPER>     uppercased env-var prefix
#   "Forjio Brand"         → <Display Name>         UI text, README headline
#   :4000                  → :<backend-port>        Express listener + tests
#   :3000                  → :<frontend-port>       Next.js listener + tests
#   ?? 4000 / -p 4000      → <backend-port>         no-colon forms: index.ts
#   -p 3000 / --port 3000  → <frontend-port>          env fallback, CLI flags
#   #1a1a2e (default       → <accent-hex>           brand color wherever the
#     placeholder color)                            hex literal appears
#
# NOTE: the portal shells follow the `--primary` theme token
# (`hsl(var(--primary))`), not a hex — after renaming, retune
# `--primary` / `--ring` in frontend/src/app/globals.css to the brand
# accent (HSL triplet of <accent-hex>).
#
# Skips: .git/, node_modules/, dist/, .next/, out/, this script itself.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  cat <<USAGE >&2
usage: $0 <brand-slug> "<Display Name>" [<accent-hex>] [<backend-port>] [<frontend-port>]
example: $0 kalium "Kalium" "#7C3AED" 4180 3180
USAGE
  exit 2
fi

BRAND_SLUG="$1"
BRAND_DISPLAY="$2"
ACCENT_HEX="${3:-#1a1a2e}"
BACKEND_PORT="${4:-4000}"
FRONTEND_PORT="${5:-3000}"

BRAND_SNAKE="${BRAND_SLUG//-/_}"
BRAND_UPPER="$(echo "$BRAND_SLUG" | tr '[:lower:]-' '[:upper:]_')"

# Sanity-check inputs
if [[ ! "$BRAND_SLUG" =~ ^[a-z][a-z0-9-]{1,30}$ ]]; then
  echo "error: brand-slug must be lowercase alphanumeric/hyphen, 2-31 chars (got '$BRAND_SLUG')" >&2; exit 2
fi
if [[ ! "$ACCENT_HEX" =~ ^#[0-9a-fA-F]{6}$ ]]; then
  echo "error: accent-hex must be #RRGGBB (got '$ACCENT_HEX')" >&2; exit 2
fi
if [[ ! "$BACKEND_PORT" =~ ^[0-9]{4,5}$ ]] || [[ ! "$FRONTEND_PORT" =~ ^[0-9]{4,5}$ ]]; then
  echo "error: ports must be numeric (got backend=$BACKEND_PORT frontend=$FRONTEND_PORT)" >&2; exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "rename.sh — applying brand identity"
echo "  brand-slug      $BRAND_SLUG"
echo "  brand-snake     $BRAND_SNAKE"
echo "  BRAND_UPPER     $BRAND_UPPER"
echo "  display-name    $BRAND_DISPLAY"
echo "  accent-hex      $ACCENT_HEX"
echo "  backend-port    $BACKEND_PORT"
echo "  frontend-port   $FRONTEND_PORT"
echo

# Files in scope: source + config + docs across the standard repo shape.
# We exclude binary/build artifacts and this script itself so re-runs are
# clean.
#
# Two finds because we want full recursion into subtrees but only top-level
# files at the repo root (so we don't accidentally rewrite e.g. an
# .env that some user dropped in /tmp-test/ at depth N).
EXT_PATTERN='\.(ts|tsx|js|jsx|json|md|yml|yaml|example|prisma|css|scss|html|conf)$|^\.env'

mapfile -t SUBTREE_FILES < <(
  find backend frontend cli e2e copy deploy .github scripts -type f 2>/dev/null \
    -not -path '*/node_modules/*' \
    -not -path '*/.next/*' \
    -not -path '*/dist/*' \
    -not -path '*/out/*' \
    -not -path '*/.git/*' \
    -not -name 'rename.sh' \
    -not -name 'package-lock.json' \
    -not -name 'pnpm-lock.yaml'
)
mapfile -t ROOT_FILES < <(
  find . -maxdepth 1 -type f 2>/dev/null
)

FILES=()
for f in "${SUBTREE_FILES[@]}" "${ROOT_FILES[@]}"; do
  if [[ "$(basename "$f")" =~ ^\.env ]] || [[ "$f" =~ $EXT_PATTERN ]]; then
    FILES+=("$f")
  fi
done

echo "scanning ${#FILES[@]} files…"

CHANGED=0
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue

  # Skip if this file has nothing to rewrite — fast path.
  if ! grep -qE 'forjio-brand|forjio_brand|FORJIO_BRAND|Forjio Brand|:4000|:3000|\?\? 4000|-p 4000|--port 4000|-p 3000|--port 3000|#1a1a2e' "$f" 2>/dev/null; then
    continue
  fi

  before="$(md5sum "$f" | cut -d' ' -f1)"

  # sed is GNU on linux. -i without backup, multiple -e.
  sed -i \
    -e "s|forjio-brand|${BRAND_SLUG}|g" \
    -e "s|forjio_brand|${BRAND_SNAKE}|g" \
    -e "s|FORJIO_BRAND|${BRAND_UPPER}|g" \
    -e "s|Forjio Brand|${BRAND_DISPLAY}|g" \
    -e "s|:4000\b|:${BACKEND_PORT}|g" \
    -e "s|:3000\b|:${FRONTEND_PORT}|g" \
    -e "s|?? 4000\b|?? ${BACKEND_PORT}|g" \
    -e "s|-p 4000\b|-p ${BACKEND_PORT}|g" \
    -e "s|--port 4000\b|--port ${BACKEND_PORT}|g" \
    -e "s|-p 3000\b|-p ${FRONTEND_PORT}|g" \
    -e "s|--port 3000\b|--port ${FRONTEND_PORT}|g" \
    -e "s|#1a1a2e|${ACCENT_HEX}|g" \
    "$f"

  after="$(md5sum "$f" | cut -d' ' -f1)"
  if [[ "$before" != "$after" ]]; then
    CHANGED=$((CHANGED + 1))
    echo "  ✓ $f"
  fi
done


# ─── package-lock.json names (special case) ──────────────────────────
# Lockfiles are excluded from the generic pass (we must not touch dep
# hashes), but the root "name" fields still carry the placeholder.
# npm ci tolerates the mismatch, yet rewrite them for consistency.
while IFS= read -r lock; do
  if grep -q '"forjio-brand-' "$lock"; then
    sed -i "s|\"forjio-brand-|\"${BRAND_SLUG}-|g" "$lock"
    CHANGED=$((CHANGED + 1))
    echo "  ✓ $lock (name fields)"
  fi
done < <(find backend frontend cli e2e -maxdepth 2 -name package-lock.json 2>/dev/null)

# ─── README rewrite (special case) ────────────────────────────────────
# README.md in the template describes the *template*, not the product.
# Replace it with a minimal product-flavored stub so standardize.sh
# passes and the fork has a starting point.
if [[ -f README.md ]] && head -1 README.md | grep -q 'Forjio Service Template'; then
  cat > README.md <<README_EOF
# ${BRAND_DISPLAY}

${BRAND_DISPLAY} is a Forjio family product. Served at
[${BRAND_SLUG}.com](https://${BRAND_SLUG}.com) and mirrored at
[${BRAND_SLUG}.forjio.com](https://${BRAND_SLUG}.forjio.com).

## What this repo contains

- \`backend/\` — Express + Prisma API
- \`frontend/\` — Next.js 15 App Router (marketing site + dashboard)
- \`cli/\` — \`@forjio/${BRAND_SLUG}-cli\` Commander-based CLI
- \`e2e/\` — Playwright suite (local + CI-against-staging)
- \`copy/docs/\` — markdown docs rendered at \`/docs\`
- \`scripts/\` — bootstrap, seed-demo, provision-do, standardize, codegen-sdk

## Develop

\`\`\`bash
cd backend  && npm install && npm run dev   # :${BACKEND_PORT}
cd frontend && npm install && npm run dev   # :${FRONTEND_PORT}
\`\`\`

See [CLAUDE.md](./CLAUDE.md) for in-repo conventions and the wider
Forjio family architecture.
README_EOF
  CHANGED=$((CHANGED + 1))
  echo "  ✓ README.md (regenerated for ${BRAND_SLUG})"
fi

echo
echo "done. $CHANGED files updated."

# Helpful nudges for the human running this.
if [[ $CHANGED -gt 0 ]]; then
  cat <<NEXT

next steps:
  1. git diff   # review the rewrites
  2. git add -A && git commit -m "chore: rename template placeholders to ${BRAND_SLUG}"
  3. ./scripts/bootstrap.ts   # register Huudis OIDC client + Plugipay partner (PLANNED)
  4. See TEMPLATE.md for the full spawn-a-new-SaaS walkthrough.
NEXT
fi
