#!/usr/bin/env bash
# install.sh — bootstrap a fresh Ubuntu 24.04 droplet to host a Forjio
# SaaS. Run by scripts/provision-do.sh on each droplet (it scp's this
# file over and runs `FORJIO_BRAND=<brand> bash /tmp/install.sh`).
#
# Idempotent: every step checks state first, so re-runs are safe.
#
# Installs: 2GB swap, Node 22, pnpm, pm2, nginx, certbot, PostgreSQL 16,
# a UFW firewall. Bakes in the four gotchas from the Forjio deploy
# playbook (noninteractive apt, swap-before-first-deploy, certbot order,
# /var/www webroot for --webroot TLS).
#
# Usage (normally invoked by provision-do.sh, but standalone works):
#   FORJIO_BRAND=kalium bash install.sh
set -euo pipefail

BRAND="${FORJIO_BRAND:?FORJIO_BRAND env is required}"
export DEBIAN_FRONTEND=noninteractive   # gotcha #1 — no needrestart TTY prompts

log() { echo "[install] $*"; }

# ─── 2GB swap (gotcha #2 — 1GB droplets OOM during npm ci) ────────────
if ! swapon --show | grep -q /swapfile; then
  log "creating 2GB swap…"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  log "✓ swap already on"
fi

# ─── Base packages ────────────────────────────────────────────────────
log "apt update + base packages…"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git ufw rsync

# ─── Node 22 (NodeSource) ─────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22.* ]]; then
  log "installing Node 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
else
  log "✓ node $(node -v)"
fi

# ─── pnpm + pm2 ───────────────────────────────────────────────────────
command -v pnpm >/dev/null 2>&1 || { log "installing pnpm…"; npm install -g pnpm; }
command -v pm2  >/dev/null 2>&1 || { log "installing pm2…";  npm install -g pm2; }

# ─── nginx ────────────────────────────────────────────────────────────
if ! command -v nginx >/dev/null 2>&1; then
  log "installing nginx…"
  apt-get install -y -qq nginx
fi
# Webroot for `certbot --webroot` (provision-do.sh issues certs this way,
# NOT --nginx — see feedback_nginx_auth_request_no_rotation).
mkdir -p "/var/www/$BRAND"

# Install the product vhost. `deploy/nginx/*.conf` ships in the repo —
# scripts/rename.sh rewrites the brand slug + ports inside it (it does
# not rename the file, so glob rather than expecting <brand>.conf).
# The CI rsync drops the repo at /opt/saas/<brand>; on the first deploy
# this file may not be there yet, so the symlink is best-effort —
# `nginx -t` runs only once the conf is present.
NGINX_SRC="$(ls /opt/saas/$BRAND/deploy/nginx/*.conf 2>/dev/null | head -1 || true)"
if [[ -n "$NGINX_SRC" && -f "$NGINX_SRC" ]]; then
  log "installing nginx vhost for $BRAND…"
  ln -sf "$NGINX_SRC" "/etc/nginx/sites-enabled/$BRAND.conf"
  rm -f /etc/nginx/sites-enabled/default
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    log "✓ nginx vhost installed + reloaded"
  else
    log "⚠ nginx -t failed (TLS certs may not be issued yet) — reload skipped"
  fi
else
  log "⚠ deploy/nginx/*.conf not present yet — symlink it after the first CI deploy:"
  log "    ln -sf /opt/saas/$BRAND/deploy/nginx/*.conf /etc/nginx/sites-enabled/$BRAND.conf"
  log "    nginx -t && systemctl reload nginx"
fi

# ─── certbot ──────────────────────────────────────────────────────────
if ! command -v certbot >/dev/null 2>&1; then
  log "installing certbot…"
  apt-get install -y -qq certbot python3-certbot-nginx
fi

# ─── PostgreSQL 16 ────────────────────────────────────────────────────
if ! command -v psql >/dev/null 2>&1; then
  log "installing PostgreSQL 16…"
  apt-get install -y -qq postgresql postgresql-contrib
fi
systemctl enable --now postgresql

# Create the role + database if missing. The password is generated once
# and printed below — capture it into the product's secrets env file.
DB_USER="$BRAND"
DB_NAME="${BRAND}_prod"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  DB_PASS="$(openssl rand -hex 16)"
  log "creating postgres role + db…"
  sudo -u postgres psql -qc "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASS';"
  sudo -u postgres psql -qc "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────"
  echo "  │ DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
  echo "  │   ↑ save this into the product's secrets env + GitHub Secrets"
  echo "  └─────────────────────────────────────────────────────────────"
  echo ""
else
  log "✓ postgres role $DB_USER already exists (DATABASE_URL unchanged)"
fi

# ─── Firewall ─────────────────────────────────────────────────────────
log "configuring UFW…"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

# ─── Deploy target dir ────────────────────────────────────────────────
mkdir -p "/opt/saas/$BRAND"

log "✓ droplet ready for $BRAND"
log ""
log "next (provision-do.sh prints the exact commands):"
log "  1. point DNS at this droplet"
log "  2. certbot certonly --webroot -w /var/www/$BRAND -d <domains>"
log "  3. CI deploy rsyncs code to /opt/saas/$BRAND + pm2 starts it"
