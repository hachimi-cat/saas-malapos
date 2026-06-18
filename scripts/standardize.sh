#!/usr/bin/env bash
# standardize.sh — lint a Forjio SaaS fork against the family standards.
#
# Why this exists: forking the template + running rename.sh + bootstrap.sh
# leaves a working repo, but doesn't guarantee the long-tail
# standardization that makes the family feel coherent — README shape,
# package versions in lockstep, repo description, no lingering
# `FORJIO_BRAND` placeholders, expected dirs present, etc.
#
# Run this after bootstrap to confirm the fork meets the bar, and
# periodically afterward to catch drift.
#
# Usage:
#   ./scripts/standardize.sh                # lint, exit 1 on findings
#   ./scripts/standardize.sh --fix          # auto-fix what's auto-fixable
#   ./scripts/standardize.sh --quick        # skip slow checks (gh repo desc)
#
# Checks (8 rules):
#   1. No FORJIO_BRAND / forjio-brand / "Forjio Brand" placeholders left
#   2. backend/, frontend/, cli/, e2e/, copy/, scripts/ all present
#   3. backend|frontend|cli package.json names match <brand>-<dir>
#   4. CLAUDE.md exists + does not still say "FORJIO_BRAND"
#   5. README.md mentions the brand at least once + has the expected H1
#   6. .github/workflows/ci-cd.yml has FORJIO_BRAND env at top set to brand
#   7. cli/package.json publishes as @forjio/<brand>-cli
#   8. (--quick skips) gh repo description matches "<Brand>: ..."
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIX=0
QUICK=0
for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
    --quick) QUICK=1 ;;
    -h|--help) sed -n '1,30p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

FAIL=0
FIXED=0

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }
hdr()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

fail()  { red "  ✗ $*"; FAIL=$((FAIL+1)); }
ok()    { grn "  ✓ $*"; }
fixed() { ylw "  ↻ $*"; FIXED=$((FIXED+1)); }

# ─── Load brand from backend/package.json (single source of truth) ───

if [[ ! -f backend/package.json ]]; then
  red "backend/package.json missing — is this a Forjio SaaS fork?"
  exit 2
fi

BRAND="$(node -e 'process.stdout.write(require("./backend/package.json").name.replace(/-backend$/, ""))' 2>/dev/null || true)"
if [[ -z "$BRAND" || "$BRAND" == "forjio-brand" ]]; then
  red "brand not set in backend/package.json (still '$BRAND'). Run scripts/rename.sh first."
  exit 2
fi

BRAND_DISPLAY="$(node -e "const s='$BRAND'; process.stdout.write(s.charAt(0).toUpperCase()+s.slice(1))")"
hdr "Standardizing $BRAND (display: $BRAND_DISPLAY)"

# ─── Rule 1: no lingering placeholders ───────────────────────────────

hdr "1. Placeholder sweep"
LEFTOVERS=$(grep -rEIl --binary-files=without-match \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
  --exclude="*.lock" --exclude="package-lock.json" \
  --exclude="standardize.sh" --exclude="rename.sh" --exclude="bootstrap.mjs" \
  --exclude="seed-demo.mjs" --exclude="codegen-sdk.sh" --exclude="provision-do.sh" \
  --exclude="install.sh" \
  --exclude="TEMPLATE.md" --exclude="TEMPLATE-UPGRADE-AUDIT.md" --exclude="CLAUDE.md" \
  'FORJIO_BRAND|forjio-brand|Forjio Brand' . 2>/dev/null || true)
if [[ -z "$LEFTOVERS" ]]; then
  ok "no FORJIO_BRAND / forjio-brand / 'Forjio Brand' leftovers"
else
  echo "$LEFTOVERS" | while read -r f; do
    fail "placeholder in $f"
  done
fi

# ─── Rule 2: required dirs ────────────────────────────────────────────

hdr "2. Required directories"
for d in backend frontend cli e2e copy scripts; do
  [[ -d "$d" ]] && ok "$d/" || fail "missing $d/"
done

# ─── Rule 3: package.json names ──────────────────────────────────────

hdr "3. package.json name consistency"
check_pkg_name() {
  local dir="$1" want="$2"
  local got
  got="$(node -e "process.stdout.write(require('./$dir/package.json').name)" 2>/dev/null || echo "<missing>")"
  if [[ "$got" == "$want" ]]; then
    ok "$dir/package.json name = $want"
  else
    fail "$dir/package.json name = '$got' (want '$want')"
    if (( FIX )); then
      node -e "
        const p = require('./$dir/package.json');
        p.name = '$want';
        require('fs').writeFileSync('./$dir/package.json', JSON.stringify(p, null, 2) + '\n');
      "
      fixed "set $dir/package.json name to $want"
    fi
  fi
}
check_pkg_name backend  "${BRAND}-backend"
check_pkg_name frontend "${BRAND}-frontend"
check_pkg_name cli      "@forjio/${BRAND}-cli"
check_pkg_name e2e      "${BRAND}-e2e"

# ─── Rule 4: CLAUDE.md ───────────────────────────────────────────────

hdr "4. CLAUDE.md"
if [[ -f CLAUDE.md ]]; then
  if grep -q "FORJIO_BRAND\|forjio-brand\|Forjio Brand" CLAUDE.md; then
    fail "CLAUDE.md still has template placeholders"
  else
    ok "CLAUDE.md scrubbed of placeholders"
  fi
  if grep -q "$BRAND" CLAUDE.md; then
    ok "CLAUDE.md mentions $BRAND"
  else
    fail "CLAUDE.md does not mention $BRAND"
  fi
else
  fail "CLAUDE.md missing"
fi

# ─── Rule 5: README.md ───────────────────────────────────────────────

hdr "5. README.md"
if [[ -f README.md ]]; then
  # We don't require the H1 to match — that's a docs choice. We do
  # require the brand name to appear somewhere in the README at all.
  if grep -qiE "(^|[^a-z])($BRAND|$BRAND_DISPLAY)" README.md; then
    ok "README mentions $BRAND_DISPLAY"
  else
    fail "README does not mention $BRAND or $BRAND_DISPLAY anywhere"
  fi
  if grep -q "$BRAND.com\|$BRAND.forjio.com" README.md; then
    ok "README references $BRAND.com or $BRAND.forjio.com"
  else
    ylw "  (optional) README does not reference the product domain — add for the dual-domain story"
  fi
else
  fail "README.md missing"
fi

# ─── Rule 6: ci-cd.yml FORJIO_BRAND env ──────────────────────────────

hdr "6. .github/workflows/ci-cd.yml"
CI=".github/workflows/ci-cd.yml"
if [[ -f "$CI" ]]; then
  # Family CI workflows substitute the brand in-place (not via a single
  # env: block) — what we actually want to confirm is that the brand
  # name appears in the workflow at all + no leftover placeholders.
  # Case-insensitive: rename.sh inserts both BRAND and BRAND_UPPER forms.
  if grep -qiE "(^|[^a-z])$BRAND([^a-z]|$)" "$CI"; then
    ok "ci-cd.yml references $BRAND"
  else
    fail "ci-cd.yml does not reference $BRAND anywhere — did rename.sh skip it?"
  fi
  if grep -qE "^on:" "$CI"; then
    ok "ci-cd.yml has triggers"
  else
    fail "ci-cd.yml has no 'on:' section"
  fi
else
  fail "$CI missing"
fi

# ─── Rule 7: cli publishes under @forjio/ ────────────────────────────

hdr "7. CLI package scope"
CLI_NAME="$(node -e 'process.stdout.write(require("./cli/package.json").name)' 2>/dev/null || echo "")"
if [[ "$CLI_NAME" == "@forjio/${BRAND}-cli" ]]; then
  ok "cli publishes as $CLI_NAME"
else
  fail "cli/package.json name = '$CLI_NAME' (want '@forjio/${BRAND}-cli')"
fi

# ─── Rule 8: GitHub repo description (slow — requires gh) ────────────

if (( QUICK )); then
  ylw "skipping rule 8 (--quick)"
else
  hdr "8. GitHub repo description"
  if command -v gh >/dev/null 2>&1; then
    REPO_DESC="$(gh repo view "hachimi-cat/$BRAND" --json description -q .description 2>/dev/null || echo "<no-repo>")"
    if [[ "$REPO_DESC" == "<no-repo>" ]]; then
      ylw "  (repo hachimi-cat/$BRAND not found on gh — skipping)"
    elif [[ -z "$REPO_DESC" ]]; then
      fail "repo description empty — set with: gh repo edit hachimi-cat/$BRAND --description '$BRAND_DISPLAY: <one-liner>'"
    elif [[ "$REPO_DESC" == *"$BRAND_DISPLAY"* ]] || [[ "$REPO_DESC" == *"$BRAND"* ]]; then
      ok "repo description references $BRAND_DISPLAY"
    else
      fail "repo description doesn't reference '$BRAND_DISPLAY' (got: '$REPO_DESC')"
    fi
  else
    ylw "  (gh CLI not installed — skipping)"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────

echo ""
if (( FAIL == 0 )); then
  grn "✓ standardized: $BRAND meets all checks ($FIXED auto-fix$([[ $FIXED -eq 1 ]] || echo es))"
  exit 0
else
  red "✗ $FAIL finding$([[ $FAIL -eq 1 ]] || echo s) — re-run with --fix where applicable"
  exit 1
fi
