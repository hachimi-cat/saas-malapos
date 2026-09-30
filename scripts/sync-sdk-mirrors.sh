#!/usr/bin/env bash
# One-way sync of sdk/<lang>/ sources to the public per-language mirror repos
# (Pattern 2: develop in the private monorepo, publish source to public mirrors).
#
# For each lang: rsync the sdk dir over a fresh clone of the mirror, commit
# with the source sha, push, and tag v<version> when that tag doesn't exist
# yet (versions come from package.json / pyproject.toml / VERSION).
#
# Auth: uses $GH_MIRROR_TOKEN when set (CI); otherwise relies on the local
# git insteadOf rewrite for git@github.com: URLs.
set -euo pipefail

PRODUCT=malapos
GH_OWNER=hachimi-cat
LANGS=${LANGS:-"go"}

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC_SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD)

remote_url() {
  local mirror=$1
  if [ -n "${GH_MIRROR_TOKEN:-}" ]; then
    echo "https://x-access-token:${GH_MIRROR_TOKEN}@github.com/${GH_OWNER}/${mirror}.git"
  else
    echo "git@github.com:${GH_OWNER}/${mirror}.git"
  fi
}

sdk_version() {
  local lang=$1 dir=$2
  case "$lang" in
    node|js|cli) node -p "require('$dir/package.json').version" ;;
    python)      sed -n 's/^version *= *"\(.*\)"/\1/p' "$dir/pyproject.toml" | head -1 ;;
    go)          cat "$dir/VERSION" ;;
  esac
}

for lang in $LANGS; do
  mirror="${PRODUCT}-${lang}"
  case "$lang" in
    cli) src="$REPO_ROOT/cli" ;;
    *)   src="$REPO_ROOT/sdk/$lang"; [ -d "$src" ] || src="$REPO_ROOT/sdks/$lang" ;;
  esac
  [ -d "$src" ] || { echo "skip $lang: no source dir"; continue; }

  version=$(sdk_version "$lang" "$src")
  [ -n "$version" ] || { echo "FATAL: no version for $lang"; exit 1; }

  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  git clone --quiet --depth 50 "$(remote_url "$mirror")" "$work"

  rsync -a --delete \
    --exclude .git --exclude node_modules --exclude dist --exclude .venv \
    --exclude __pycache__ --exclude "*.tsbuildinfo" --exclude .pytest_cache \
    "$src/" "$work/"

  git -C "$work" config user.name "hachimi-cat"
  git -C "$work" config user.email "hachimi@forjio.com"
  git -C "$work" add -A

  if git -C "$work" diff --cached --quiet; then
    echo "$mirror: no source changes"
  else
    git -C "$work" commit --quiet -m "sync from saas-malapos@${SRC_SHA}"
    git -C "$work" push --quiet origin HEAD:master
    echo "$mirror: pushed sync of saas-malapos@${SRC_SHA}"
  fi

  if git -C "$work" ls-remote --tags origin "refs/tags/v${version}" | grep -q .; then
    echo "$mirror: tag v${version} already exists"
  else
    git -C "$work" tag "v${version}" 2>/dev/null || true
    git -C "$work" push --quiet origin "v${version}"
    echo "$mirror: tagged v${version}"
  fi

  rm -rf "$work"
done

echo "mirror sync complete (source ${SRC_SHA})"
