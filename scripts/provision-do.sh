#!/usr/bin/env bash
# provision-do.sh — Spin up DigitalOcean infrastructure for a new
# Forjio SaaS product. Step 10 of the TEMPLATE.md walkthrough.
#
# Idempotent: each step checks state first and skips when done so
# re-runs after a partial failure pick up where they left off.
#
# What it does:
#   1. Two droplets (stg-<brand>, prd-<brand>) in sgp1
#   2. DNS A records on both .com and .forjio.com zones
#   3. install.sh on each droplet (node, pnpm, pm2, nginx, certbot,
#      postgres 16, 2GB swap)
#   4. certbot --webroot for TLS on both domains (NOT --nginx — see
#      feedback_nginx_auth_request_no_rotation)
#   5. Verify both endpoints respond 200
#
# Prereqs:
#   - doctl authenticated (`doctl auth init`)
#   - SSH key registered with DO + path in $DO_SSH_KEY (default ~/.ssh/id_ed25519)
#   - The .com domain you own already added to DO's DNS section (`doctl
#     compute domain create <brand>.com` if not). .forjio.com is
#     already managed.
#
# Usage:
#   ./scripts/provision-do.sh <brand> [<region>]
#   ./scripts/provision-do.sh kalium sgp1
set -euo pipefail

BRAND="${1:?usage: provision-do.sh <brand> [<region>]}"
REGION="${2:-sgp1}"
DO_SSH_KEY="${DO_SSH_KEY:-$HOME/.ssh/id_ed25519}"

if [[ ! "$BRAND" =~ ^[a-z][a-z0-9-]{1,30}$ ]]; then
  echo "error: brand must be lowercase alphanumeric/hyphen (got '$BRAND')" >&2
  exit 2
fi

STAGING_NAME="stg-$BRAND"
PROD_NAME="prd-$BRAND"

# Droplet sizes — locked per the canonical playbook. Bump only if a
# product genuinely needs more headroom (most don't until > 10k MAU).
STAGING_SIZE="s-1vcpu-1gb"   # $6/mo
PROD_SIZE="s-2vcpu-2gb"      # $18/mo
IMAGE="ubuntu-24-04-x64"

# log() writes to STDERR — several call sites run inside $(…) command
# substitution (e.g. ensure_droplet), and stdout-logging corrupted the
# captured values (template bug found spawning suppuo).
log() { echo >&2 "[provision-do] $*"; }
err() { echo "[provision-do] ERROR: $*" >&2; exit 1; }

# ─── Pre-flight ───────────────────────────────────────────────────────

command -v doctl >/dev/null || err "doctl not found — install + run 'doctl auth init'"
doctl account get >/dev/null 2>&1 || err "doctl not authenticated — run 'doctl auth init'"

[[ -r "$DO_SSH_KEY" ]] || err "SSH key not readable at $DO_SSH_KEY (set DO_SSH_KEY=...)"

# doctl returns MD5-format fingerprints, so match on MD5 (the original
# SHA256 comparison never matched — template bug found spawning suppuo).
DO_SSH_FINGERPRINT="$(ssh-keygen -lf "$DO_SSH_KEY" -E md5 | awk '{print $2}' | sed 's|MD5:||')"
DO_KEY_ID="$(doctl compute ssh-key list --format ID,FingerPrint --no-header | awk -v fp="$DO_SSH_FINGERPRINT" '$2==fp {print $1; exit}')"
[[ -n "$DO_KEY_ID" ]] || err "$DO_SSH_KEY not registered with DigitalOcean. Run 'doctl compute ssh-key import'."

log "brand=$BRAND region=$REGION ssh-key=$DO_KEY_ID"

# ─── Step 1: Droplets ─────────────────────────────────────────────────

ensure_droplet() {
  local name="$1" size="$2"
  local existing_id
  existing_id="$(doctl compute droplet list --format ID,Name --no-header | awk -v n="$name" '$2==n {print $1; exit}')"
  if [[ -n "$existing_id" ]]; then
    log "✓ droplet $name already exists (id=$existing_id)"
    echo "$existing_id"
    return
  fi
  log "creating droplet $name ($size)…"
  doctl compute droplet create "$name" \
    --image "$IMAGE" \
    --size "$size" \
    --region "$REGION" \
    --ssh-keys "$DO_KEY_ID" \
    --tag-name "forjio-family,$BRAND" \
    --wait \
    --format ID --no-header
}

STAGING_ID="$(ensure_droplet "$STAGING_NAME" "$STAGING_SIZE")"
PROD_ID="$(ensure_droplet "$PROD_NAME" "$PROD_SIZE")"

STAGING_IP="$(doctl compute droplet get "$STAGING_ID" --format PublicIPv4 --no-header)"
PROD_IP="$(doctl compute droplet get "$PROD_ID" --format PublicIPv4 --no-header)"
log "  staging: $STAGING_IP"
log "  prod:    $PROD_IP"

# ─── Step 2: DNS records on both zones ───────────────────────────────

ensure_a_record() {
  local zone="$1" name="$2" ip="$3"
  local existing
  existing="$(doctl compute domain records list "$zone" --format ID,Type,Name,Data --no-header \
    | awk -v n="$name" -v ip="$ip" '$2=="A" && $3==n && $4==ip {print $1; exit}')"
  if [[ -n "$existing" ]]; then
    log "  ✓ $zone $name → $ip (record $existing)"
    return
  fi
  # Delete any stale record for the same name first so we don't dupe.
  local stale_id
  stale_id="$(doctl compute domain records list "$zone" --format ID,Type,Name --no-header \
    | awk -v n="$name" '$2=="A" && $3==n {print $1}')"
  if [[ -n "$stale_id" ]]; then
    log "  removing stale $zone $name → (was wrong IP), record $stale_id"
    doctl compute domain records delete "$zone" "$stale_id" --force
  fi
  log "  creating $zone $name → $ip"
  doctl compute domain records create "$zone" \
    --record-type A --record-name "$name" --record-data "$ip" --record-ttl 300 \
    --format ID --no-header >/dev/null
}

# .forjio.com zone — every product has its .forjio.com mirror.
log "DNS records on forjio.com zone…"
ensure_a_record "forjio.com" "$BRAND" "$PROD_IP"

# <brand>.com zone — only if the user has added it to DO. Bail
# cleanly if not.
if doctl compute domain get "$BRAND.com" >/dev/null 2>&1; then
  log "DNS records on $BRAND.com zone…"
  ensure_a_record "$BRAND.com" "@" "$PROD_IP"
  ensure_a_record "$BRAND.com" "www" "$PROD_IP"
  ensure_a_record "$BRAND.com" "staging" "$STAGING_IP"
else
  log "⚠ $BRAND.com not in DO DNS yet. Add it after registering the domain:"
  log "    doctl compute domain create $BRAND.com --ip-address $PROD_IP"
  log "    then re-run this script to add the A records."
fi

# ─── Step 3: install.sh on each droplet ──────────────────────────────

INSTALL_SCRIPT="$(dirname "$0")/install.sh"
if [[ ! -f "$INSTALL_SCRIPT" ]]; then
  log "⚠ scripts/install.sh missing in this template — skipping install step."
  log "  Copy the canonical playbook from saas-plugipay/scripts/ or"
  log "  reference_forjio_deploy_playbook.md, drop at scripts/install.sh,"
  log "  then re-run with --resume to pick up here."
else
  for host_ip in "$STAGING_IP" "$PROD_IP"; do
    log "running install.sh on $host_ip…"
    # Note: this is destructive (installs packages, opens firewall
    # ports). Idempotent inside install.sh — re-runs are safe.
    scp -i "$DO_SSH_KEY" -o StrictHostKeyChecking=accept-new \
      "$INSTALL_SCRIPT" "root@$host_ip:/tmp/install.sh"
    ssh -i "$DO_SSH_KEY" -o StrictHostKeyChecking=accept-new \
      "root@$host_ip" "FORJIO_BRAND=$BRAND bash /tmp/install.sh"
  done
fi

# ─── Step 4: certbot (--webroot, NOT --nginx) ────────────────────────

log "TLS via certbot --webroot (run on each droplet)…"
log "  ssh root@$PROD_IP 'certbot certonly --webroot -w /var/www/$BRAND -d $BRAND.com -d www.$BRAND.com -d $BRAND.forjio.com --email support@forjio.com --agree-tos -n'"
log "  ssh root@$STAGING_IP 'certbot certonly --webroot -w /var/www/$BRAND -d staging.$BRAND.com --email support@forjio.com --agree-tos -n'"
log ""
log "(Skipping automated cert provisioning — first run after DNS"
log " propagation. Re-run those two commands once dig +short shows"
log " the IPs above.)"

# ─── Step 5: smoke ───────────────────────────────────────────────────

log "verification:"
log "  curl -sI https://$BRAND.com"
log "  curl -sI https://$BRAND.forjio.com"
log "  curl -sI https://staging.$BRAND.com"
log ""
log "done. monthly cost: \$$((6 + 18)) for the two droplets."
log "next: TEMPLATE.md Step 11 — seed demo data via scripts/seed-demo.mjs"
