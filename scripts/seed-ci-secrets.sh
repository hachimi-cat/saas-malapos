#!/usr/bin/env bash
# seed-ci-secrets.sh — set the GitHub Actions secrets the CI/CD workflow
# needs, via the `gh` CLI. Step 9 of the TEMPLATE.md walkthrough.
#
# The workflow (.github/workflows/ci-cd.yml) references these secrets;
# without them the deploy + E2E jobs fail. This script reads each value
# from an env var if present, otherwise prompts for it, then runs
# `gh secret set`. Already-set secrets are skipped (re-runs are safe).
#
# Run from inside the product repo (gh needs the repo context):
#   ./scripts/seed-ci-secrets.sh
#
# Pre-fill non-interactively by exporting the env vars first:
#   STAGING_HOST=1.2.3.4 PRODUCTION_HOST=5.6.7.8 ./scripts/seed-ci-secrets.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

command -v gh >/dev/null || { echo "error: gh CLI not installed" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "error: run 'gh auth login' first" >&2; exit 1; }

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
[[ -n "$REPO" ]] || { echo "error: not inside a GitHub repo (no remote?)" >&2; exit 1; }
echo "seeding CI secrets for $REPO"

EXISTING="$(gh secret list --json name -q '.[].name' 2>/dev/null || true)"

# secret name | prompt | is it a file path?
SECRETS=(
  "STAGING_HOST|Staging host: staging-<brand>.forjio.com (the shared box)|no"
  "PRODUCTION_HOST|Production droplet IP|no"
  "SSH_PRIVATE_KEY|Path to the deploy SSH private key|file"
  "E2E_BYPASS_SECRET|Shared secret the E2E suite sends to skip rate limits|no"
  "NPM_TOKEN|npm token for publishing the CLI (from ~/.npmrc)|no"
  "MIDTRANS_CLIENT_KEY|Payment-product only — leave blank if not applicable|no"
)

set_secret() {
  local name="$1" prompt="$2" kind="$3" value=""
  if grep -qx "$name" <<<"$EXISTING"; then
    echo "  ✓ $name already set — skipping"
    return
  fi
  # Pre-filled via env var?
  value="${!name:-}"
  if [[ -z "$value" ]]; then
    if [[ "$kind" == "file" ]]; then
      read -r -p "  $name — $prompt: " path
      [[ -n "$path" && -r "$path" ]] || { echo "  ⚠ skipped $name (no readable file)"; return; }
      gh secret set "$name" < "$path" && echo "  ✓ $name set (from $path)"
      return
    fi
    read -r -s -p "  $name — $prompt: " value; echo
  fi
  if [[ -z "$value" ]]; then
    echo "  ⚠ skipped $name (empty)"
    return
  fi
  printf '%s' "$value" | gh secret set "$name" && echo "  ✓ $name set"
}

for entry in "${SECRETS[@]}"; do
  IFS='|' read -r name prompt kind <<<"$entry"
  set_secret "$name" "$prompt" "$kind"
done

echo ""
echo "done. GITHUB_TOKEN is provided automatically by Actions — don't set it."
echo "verify: gh secret list"
