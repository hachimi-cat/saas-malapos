#!/usr/bin/env bash
# codegen-sdk.sh — scaffold per-product SDK shells in JS / Python / Go.
#
# Why this exists: every Forjio product publishes three SDKs that wrap
# its REST API:
#   - JS:     @forjio/<brand>     (npm, hachimi@forjio.com)
#   - Python: forjio-<brand>      (PyPI, hachimi@forjio.com)
#   - Go:     hachimi-cat/<brand>-go (git tags, no registry)
#
# This script scaffolds those three packages in `sdks/<lang>/` with the
# canonical family shape — transport, envelope, error class, config —
# all wired against `@forjio/sdk` (TS core), `forjio-sdk` (Python core),
# or `hachimi-cat/forjio-go` (Go core) as appropriate.
#
# It does NOT generate from an OpenAPI spec because most Forjio
# backends don't emit one; the script gives you a skeleton + a marked
# "add endpoints here" section to fill in by hand.
#
# Usage:
#   ./scripts/codegen-sdk.sh js          # only the JS SDK
#   ./scripts/codegen-sdk.sh python      # only the Python SDK
#   ./scripts/codegen-sdk.sh go          # only the Go SDK
#   ./scripts/codegen-sdk.sh all         # all three
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LANG="${1:?usage: codegen-sdk.sh <js|python|go|all>}"
case "$LANG" in
  js|python|go|all) ;;
  *) echo "unknown lang: $LANG" >&2; exit 2 ;;
esac

BRAND="$(node -e 'process.stdout.write(require("./backend/package.json").name.replace(/-backend$/, ""))' 2>/dev/null || true)"
if [[ -z "$BRAND" || "$BRAND" == "forjio-brand" ]]; then
  echo "error: brand not set in backend/package.json. Run scripts/rename.sh first." >&2
  exit 2
fi

BRAND_DISPLAY="$(node -e "const s='$BRAND'; process.stdout.write(s.charAt(0).toUpperCase()+s.slice(1))")"

mkdir -p sdks
log() { echo "[codegen-sdk] $*"; }

# ─── JS SDK ───────────────────────────────────────────────────────────

scaffold_js() {
  local dir="sdks/js"
  if [[ -d "$dir" ]]; then
    log "✓ $dir already exists, skipping"
    return
  fi
  log "scaffolding @forjio/$BRAND at $dir/"
  mkdir -p "$dir/src/__tests__"
  cat > "$dir/package.json" <<EOF
{
  "name": "@forjio/$BRAND",
  "version": "0.1.0",
  "description": "$BRAND_DISPLAY SDK — typed JS/TS client for the $BRAND.com REST API. Sister to the Python + Go SDKs.",
  "license": "UNLICENSED",
  "private": false,
  "author": "Forjio <support@forjio.com>",
  "homepage": "https://$BRAND.com/docs/sdk/js",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/hachimi-cat/$BRAND.git",
    "directory": "sdks/js"
  },
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts --clean",
    "test": "vitest run",
    "type-check": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@forjio/sdk": "^0.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
EOF
  cat > "$dir/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
EOF
  cat > "$dir/src/index.ts" <<EOF
import { ForjioHttp, type ForjioConfig, ApiRequestError } from "@forjio/sdk/http";

export interface ${BRAND_DISPLAY}ClientConfig extends ForjioConfig {
  /** Override the API base URL. Default: https://$BRAND.com */
  baseUrl?: string;
}

/**
 * ${BRAND_DISPLAY} typed client. Composes \`@forjio/sdk\`'s transport
 * and adds product-specific endpoint methods below.
 *
 * @example
 *   const client = new ${BRAND_DISPLAY}Client({ apiKey: "..." });
 *   const items = await client.list();
 */
export class ${BRAND_DISPLAY}Client {
  private http: ForjioHttp;
  constructor(config: ${BRAND_DISPLAY}ClientConfig) {
    this.http = new ForjioHttp({
      baseUrl: config.baseUrl ?? "https://$BRAND.com",
      ...config,
    });
  }

  // ─── Endpoint methods ───────────────────────────────────────────
  // Add product methods here. Each one calls \`this.http.get/post/...\`
  // and lets @forjio/sdk's transport handle retries, idempotency,
  // and error envelope unwrapping.
  //
  // example:
  //   async list(params?: { cursor?: string }) {
  //     return this.http.get<MyResource[]>("/api/v1/things", { query: params });
  //   }
}

export { ApiRequestError };
EOF
  cat > "$dir/src/__tests__/client.test.ts" <<EOF
import { describe, it, expect } from "vitest";
import { ${BRAND_DISPLAY}Client } from "../index.js";

describe("${BRAND_DISPLAY}Client", () => {
  it("constructs with default base URL", () => {
    const c = new ${BRAND_DISPLAY}Client({ apiKey: "test" });
    expect(c).toBeDefined();
  });
});
EOF
  cat > "$dir/README.md" <<EOF
# @forjio/$BRAND

Typed JS/TS client for the [$BRAND.com](https://$BRAND.com) REST API.

\`\`\`bash
npm install @forjio/$BRAND
\`\`\`

\`\`\`ts
import { ${BRAND_DISPLAY}Client } from "@forjio/$BRAND";

const client = new ${BRAND_DISPLAY}Client({ apiKey: process.env.${BRAND^^}_API_KEY! });
const items = await client.list();
\`\`\`

See [$BRAND.com/docs/sdk/js](https://$BRAND.com/docs/sdk/js) for the
full method reference.

## Family

Sister to:
- [\`forjio-$BRAND\`](https://pypi.org/project/forjio-$BRAND/) (Python)
- [\`hachimi-cat/$BRAND-go\`](https://github.com/hachimi-cat/$BRAND-go) (Go)
EOF
  log "  → $dir/ ready ($(ls $dir/src/ | wc -l) source files)"
}

# ─── Python SDK ──────────────────────────────────────────────────────

scaffold_python() {
  local dir="sdks/python"
  if [[ -d "$dir" ]]; then
    log "✓ $dir already exists, skipping"
    return
  fi
  log "scaffolding forjio-$BRAND (PyPI) at $dir/"
  mkdir -p "$dir/forjio_$BRAND" "$dir/tests"
  cat > "$dir/pyproject.toml" <<EOF
[project]
name = "forjio-$BRAND"
version = "0.1.0"
description = "${BRAND_DISPLAY} SDK — typed Python client for the $BRAND.com REST API. Sister to the JS + Go SDKs."
authors = [{ name = "Forjio", email = "support@forjio.com" }]
license = "Proprietary"
readme = "README.md"
requires-python = ">=3.10"
dependencies = [
  "forjio-sdk>=0.6.0",
  "httpx>=0.27.0",
  "pydantic>=2.7.0",
]

[project.urls]
Homepage = "https://$BRAND.com/docs/sdk/python"
Repository = "https://github.com/hachimi-cat/$BRAND"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["forjio_$BRAND"]
EOF
  cat > "$dir/forjio_$BRAND/__init__.py" <<EOF
"""${BRAND_DISPLAY} Python SDK — typed client for the $BRAND.com REST API."""
from .client import ${BRAND_DISPLAY}Client, ApiRequestError

__all__ = ["${BRAND_DISPLAY}Client", "ApiRequestError"]
__version__ = "0.1.0"
EOF
  cat > "$dir/forjio_$BRAND/client.py" <<EOF
"""${BRAND_DISPLAY} client. Composes \`forjio-sdk\`'s transport."""
from __future__ import annotations

from typing import Any
from forjio_sdk import ForjioHttp, ApiRequestError, ForjioConfig


class ${BRAND_DISPLAY}Client:
    """${BRAND_DISPLAY} typed client.

    Example:
        client = ${BRAND_DISPLAY}Client(api_key="...")
        items = client.list()
    """

    def __init__(self, *, api_key: str, base_url: str = "https://$BRAND.com") -> None:
        self._http = ForjioHttp(
            ForjioConfig(api_key=api_key, base_url=base_url),
        )

    # ─── Endpoint methods ──────────────────────────────────────────
    # Add product methods here. Mirror the JS SDK 1:1 — same paths,
    # same param names, same envelope unwrapping (handled by ForjioHttp).
    #
    # example:
    #   def list(self, *, cursor: str | None = None) -> list[dict[str, Any]]:
    #       return self._http.get("/api/v1/things", params={"cursor": cursor})


__all__ = ["${BRAND_DISPLAY}Client", "ApiRequestError"]
EOF
  cat > "$dir/tests/test_client.py" <<EOF
"""Smoke tests for ${BRAND_DISPLAY}Client."""
from forjio_$BRAND import ${BRAND_DISPLAY}Client


def test_construct():
    c = ${BRAND_DISPLAY}Client(api_key="test")
    assert c is not None
EOF
  cat > "$dir/README.md" <<EOF
# forjio-$BRAND

Typed Python client for the [$BRAND.com](https://$BRAND.com) REST API.

\`\`\`bash
pip install forjio-$BRAND
\`\`\`

\`\`\`python
from forjio_$BRAND import ${BRAND_DISPLAY}Client

client = ${BRAND_DISPLAY}Client(api_key="...")
items = client.list()
\`\`\`

## Family

Sister to:
- [\`@forjio/$BRAND\`](https://www.npmjs.com/package/@forjio/$BRAND) (JS/TS)
- [\`hachimi-cat/$BRAND-go\`](https://github.com/hachimi-cat/$BRAND-go) (Go)
EOF
  log "  → $dir/ ready"
}

# ─── Go SDK ───────────────────────────────────────────────────────────

scaffold_go() {
  local dir="sdks/go"
  if [[ -d "$dir" ]]; then
    log "✓ $dir already exists, skipping"
    return
  fi
  log "scaffolding $BRAND-go at $dir/"
  mkdir -p "$dir"
  cat > "$dir/go.mod" <<EOF
module github.com/hachimi-cat/$BRAND-go

go 1.22

require github.com/hachimi-cat/forjio-go v0.6.0
EOF
  cat > "$dir/client.go" <<EOF
// Package $BRAND is the Go SDK for the $BRAND.com REST API.
// Sister to @forjio/$BRAND (JS) and forjio-$BRAND (Python).
package $BRAND

import (
	forjio "github.com/hachimi-cat/forjio-go"
)

// Client is the ${BRAND_DISPLAY} typed client. It wraps forjio-go's
// transport with product-specific endpoint methods.
type Client struct {
	http *forjio.HTTP
}

// Config holds the credentials + endpoint overrides.
type Config struct {
	APIKey  string
	BaseURL string // default: https://$BRAND.com
}

// New constructs a ${BRAND_DISPLAY} client.
//
// Example:
//
//	c := $BRAND.New($BRAND.Config{APIKey: os.Getenv("${BRAND^^}_API_KEY")})
//	items, err := c.List(ctx, nil)
func New(cfg Config) *Client {
	base := cfg.BaseURL
	if base == "" {
		base = "https://$BRAND.com"
	}
	return &Client{
		http: forjio.NewHTTP(forjio.Config{APIKey: cfg.APIKey, BaseURL: base}),
	}
}

// ─── Endpoint methods ─────────────────────────────────────────────
// Add product methods here. Mirror the JS + Python SDKs 1:1 — same
// paths, same param names, same envelope unwrapping.
//
// example:
//   func (c *Client) List(ctx context.Context, cursor *string) ([]Thing, error) {
//       var out []Thing
//       err := c.http.Get(ctx, "/api/v1/things", forjio.Query{"cursor": cursor}, &out)
//       return out, err
//   }
EOF
  cat > "$dir/client_test.go" <<EOF
package $BRAND

import "testing"

func TestNew(t *testing.T) {
	c := New(Config{APIKey: "test"})
	if c == nil {
		t.Fatal("client is nil")
	}
}
EOF
  cat > "$dir/README.md" <<EOF
# $BRAND-go

Typed Go client for the [$BRAND.com](https://$BRAND.com) REST API.

\`\`\`bash
go get github.com/hachimi-cat/$BRAND-go
\`\`\`

\`\`\`go
import "github.com/hachimi-cat/$BRAND-go"

c := $BRAND.New($BRAND.Config{APIKey: "..."})
items, err := c.List(ctx, nil)
\`\`\`

## Family

Sister to:
- [\`@forjio/$BRAND\`](https://www.npmjs.com/package/@forjio/$BRAND) (JS/TS)
- [\`forjio-$BRAND\`](https://pypi.org/project/forjio-$BRAND/) (Python)
EOF
  log "  → $dir/ ready"
}

# ─── Run ──────────────────────────────────────────────────────────────

case "$LANG" in
  js)     scaffold_js ;;
  python) scaffold_python ;;
  go)     scaffold_go ;;
  all)    scaffold_js; scaffold_python; scaffold_go ;;
esac

echo ""
log "done. next:"
log "  - fill in endpoint methods in sdks/*/[src|forjio_*|*.go]"
log "  - publish: cd sdks/js && npm publish --access public"
log "             cd sdks/python && python -m build && twine upload dist/*"
log "             cd sdks/go && git tag v0.1.0 && git push origin v0.1.0"
