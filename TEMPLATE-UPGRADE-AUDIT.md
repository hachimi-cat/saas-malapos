# Template Upgrade Audit — 2026-04-20

Audit of 4 Forjio product repos (`saas-linksnap`, `saas-storlaunch`,
`saas-huudis`, `saas-plugipay`) to identify battle-tested patterns
worth backporting into `forjio-service-template`.

**Trigger:** Plugipay CI/CD broke 4 times on 2026-04-20 (commits
`6766c41`, `c6c8e17`, `c8fe277`, `668b633`) re-discovering fixes
already proven in LinkSnap. This audit eliminates the
re-discovery loop.

**Criterion for each pick:** works in prod today + simplest.

---

## 1. CI/CD workflows

**Winner: `saas-linksnap/.github/workflows/ci-cd.yml`**

LinkSnap has the oldest, most-stable `ci-cd.yml`. Plugipay converged
to this exact pattern on 2026-04-20 (`668b633`) after discovering
that its previous `https://staging-<name>.forjio.com` target was
UFW-blocked on :443. Storlaunch uses raw-app-port (`$STAGING_HOST:4251`)
which requires a secret + bypass the nginx reverse proxy — more
fragile. Huudis has no E2E (OIDC smoke checks only) so not a fit
for the generic template.

### Job sequence (porting)

`lint → test → build → deploy-staging → e2e-staging → deploy-production → release`

### Key patterns to port

- ~~**Tailscale for E2E staging reach**~~ — **SUPERSEDED 2026-06-15**:
  staging moved to a shared box reached over PUBLIC http
  (`staging-<brand>.forjio.com`), Tailscale removed from CI. See CLAUDE.md
  "shared staging E2E pattern" + the spawn-product skill.
- ~~**MagicDNS hostnames**~~ — superseded; the public `.forjio.com`
  staging host replaces the MagicDNS name (still nginx :80 + bypass secret).
- **Dual wait-for-staging loop**: backend `/api/v1/health` (30 × 3s)
  then frontend `/` (20 × 3s) then 5s settle
- **`E2E_BYPASS_SECRET` static secret** for test-mode auth bypass
  (Storlaunch's `github.run_id` rotation is nicer but secret-based is
  good enough and every product already has this secret set)
- **PM2 rsync deploys** to `/opt/saas/MALAPOS/` with
  `npx prisma migrate deploy` before restart

### What NOT to port

- Storlaunch's port-specific patterns (`4251`, `3001` hardcoded) —
  parameterize via `BACKEND_PORT` / `FRONTEND_PORT` env in
  template
- LinkSnap's `libcairo2-dev` apt deps (only needed for QR canvas)
- Huudis's OIDC-specific smoke checks (`/.well-known/openid-*`)

---

## 2. Backend scaffolding

**Winner: `saas-plugipay/backend/`**

Plugipay's backend scaffold is the cleanest and most complete. It
has the `app.ts` / `index.ts` split, the full `src/lib/` helper
suite, a route factory with `enableTestOnlyRoutes`, and the
consistent error-envelope shape.

### `app.ts` + `index.ts` split

Currently the template has only `index.ts` which both creates the
express app and starts it. Plugipay exports `createApp(opts)` from
`app.ts` and `index.ts` only calls `app.listen`. This lets tests
import `createApp` without side-effects (ports, outbox worker).

### `src/middleware/` — port all of these

| Middleware | Source | Reason |
|---|---|---|
| `request-id.ts` | plugipay | Accepts `X-Request-Id` or generates `req_<ulid>`, echoes back in response header |
| `rate-limit.ts` | plugipay | Sets headers per rate class (skeleton — no actual limiter; products fill) |
| `idempotency.ts` | plugipay | Process-local cache, 24h TTL, 409 on body hash mismatch |
| `zod-error.ts` | plugipay | ZodError → `ApiError(400, 'VALIDATION_ERROR')` |
| `auth.ts` | already in template | Keep current `requireAuth` (JWT via `@forjio/sdk/auth`) |

**Skipped:** `hmac-auth.ts` + `session-auth.ts`. HMAC is
Plugipay-specific (`FORJIO4-HMAC-SHA256`, the AWS SigV4 analog for
payment APIs). Session auth is Huudis-specific (OIDC cookie). Neither
belongs in a generic template — products add as needed.

### `src/lib/` — port all of these

| Lib | Source | Reason |
|---|---|---|
| `async-handler.ts` | plugipay | `h(fn)` wraps async route handlers so rejections reach error middleware |
| `http.ts` | plugipay (adapted) | Response envelope helpers + `ApiError` class. **Normalize codes to UPPER_SNAKE_CASE** (`NOT_FOUND`, `CONFLICT`, `INVALID_SIGNATURE`) — plugipay uses lower_snake, template + Huudis use UPPER. UPPER wins. |
| `ids.ts` | plugipay | ULID factory + ARN builder (`forjio:<service>:<region>:<accountId>:<resource>/<id>`) |
| `cursor.ts` | plugipay | Base64url-encoded `{createdAt, id}` cursor + `parsePagination(q)` |
| `zod-error.ts` | plugipay | Thin wrapper → `ApiError(400, 'VALIDATION_ERROR')` |
| `test-keys.ts` | plugipay (stub) | Test-mode access key registry; template ships a minimal skeleton |
| `db.ts` | already in template | Keep current Prisma singleton |

### Route factory pattern

Plugipay's `routes/index.ts` is a factory:

```ts
export interface RoutesOptions {
  enableTestOnlyRoutes?: boolean;
}
export default function routes(opts: RoutesOptions = {}): Router { … }
```

Port as a factory so tests can conditionally enable `/test-only`
routes.

### Error shape (normalization)

User requirement: **`{ code, message }` where `code` is
SNAKE_CASE — specifically UPPER_SNAKE_CASE** (`NOT_FOUND`,
`CONFLICT`, `INVALID_SIGNATURE`, `VALIDATION_ERROR`, `AUTH_REQUIRED`,
`INTERNAL_ERROR`, `FORBIDDEN`). Plugipay uses lowercase
(`not_found`); template + Huudis already use UPPER. Consolidating on
UPPER matches the existing template convention.

### Prisma schema baseline

All 4 products have `OutboxEvent` + `ProcessedEvent`. Plugipay adds
`aggregateId` (for event-sourcing indexed queries) — worth porting.
Template already ships the outbox model; add `aggregateId` + its
index.

---

## 3. Frontend scaffolding

**Winner: `saas-plugipay/frontend/`** for `src/lib/api.ts` +
`src/lib/api-server.ts` split.

### `api.ts` + `api-server.ts` split (port both)

- `api.ts` — fetch-based client, browser-safe, auto-attaches
  `Idempotency-Key` on mutating requests, throws `ApiRequestError`
- `api-server.ts` — `'server-only'` helper that forwards `cookie` +
  `x-forwarded-for` from a Next.js server component to the backend

Other 3 products use axios + localStorage — more complex, worse for
SSR. Plugipay's pattern is cleanest.

### Error + loading boundaries

Only Plugipay ships `error.tsx` + `loading.tsx` at the route-group
level. Port minimal skeletons into the template (under
`src/app/(dashboard)/`).

### Reusable `ErrorPanel` component

Plugipay ships `src/components/ui/error-panel.tsx`. Port a
**no-Tailwind** variant (matching the template's current inline-style
convention) — Tailwind adds too many deps for a template baseline.

### Tailwind config + brand tokens — **SKIP**

Plugipay has a rich Tailwind config with brand color tokens from the
Iro design pass. Template currently uses inline styles with CSS
custom properties (e.g. `var(--primary)`, `var(--border)`). Adding
Tailwind + PostCSS + `tailwindcss-animate` + `class-variance-authority`
is a heavy baseline to impose on every product. **Decision:** leave
styling choices to each product; document the Tailwind pattern in
CLAUDE.md as an optional follow-up.

### `.env.example`

Current template covers the baseline (`NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_OIDC_ISSUER`, `NEXT_PUBLIC_OIDC_CLIENT_ID`,
`NEXT_PUBLIC_BRAND_NAME`). No changes needed.

### Package.json scripts — UPDATE

Add `test` with `--passWithNoTests` + `test:watch` (prevents CI
failure when frontend has no unit tests yet, per plugipay's
`6766c41` fix).

---

## 4. CLI scaffolding

**Winner: current template + `saas-huudis` session store**

Template's `auth login/whoami/logout` matches LinkSnap + Plugipay
(all 4 products ship this shape). Only addition worth porting is
Huudis's `src/lib/session.ts` — a portable `~/.MALAPOS/session.json`
token store with `0600` perms. Every product will need this once
Huudis M1 ships.

### Scripts to add

Add `type-check` (alias of `lint`) so CI workflows can call it
explicitly.

---

## 5. E2E scaffolding

**Winner: `saas-linksnap/e2e/playwright.ci.config.ts`**

Current template has only `playwright.config.ts` (base config with
isRemote detection). Port LinkSnap's `playwright.ci.config.ts` as a
separate file for CI — workers=1, retries=2, longer timeouts (90s),
no webServer (CI connects to staging directly).

### Scripts to add

Add `test:staging` (env-override convenience for manual staging
testing, per Storlaunch).

---

## 6. Package.json scripts standardization

Target shape across `backend`, `frontend`, `cli`, `e2e`:

| Script | backend | frontend | cli | e2e |
|---|---|---|---|---|
| `dev` | ✓ | ✓ | ✓ | — |
| `build` | ✓ | ✓ | ✓ | — |
| `start` | ✓ | ✓ | — | — |
| `test` | ✓ | ✓ (w/ `--passWithNoTests`) | ✓ (w/ `--passWithNoTests`) | ✓ |
| `test:watch` | ✓ | ✓ | — | — |
| `test:staging` | — | — | — | ✓ |
| `lint` (= `tsc --noEmit`) | ✓ | ✓ | ✓ | ✓ |
| `type-check` (= `tsc --noEmit`) | ✓ | ✓ | ✓ | ✓ |

---

## 7. Deploy parameterization

LinkSnap hardcodes `linksnap` + `4514` + `3001` throughout
`ci-cd.yml`. In the template, replace with placeholders:

| Placeholder | Example value |
|---|---|
| `MALAPOS` | `huudis` |
| `staging-MALAPOS` | `staging-huudis` |
| `MALAPOS.com` | `huudis.com` |
| `MALAPOS.forjio.com` | `huudis.forjio.com` |
| `malapos` (DB name) | `huudis` |
| `BACKEND_PORT` | `4514`, `4054`, `4251`, etc. |
| `FRONTEND_PORT` | `3000`, `3001`, etc. |

---

## 8. CLAUDE.md updates

- Reference the shared staging E2E pattern (Tailscale + MagicDNS)
- Note Tailwind + brand-tokens as optional (not baseline)
- Point at `hachimi-cat/forjio-architecture` ADRs
- Keep existing `MALAPOS` placeholder guidance intact

---

## Skipped (with reason)

| Pattern | Skipped because |
|---|---|
| Plugipay `hmac-auth.ts` | Payment-API-specific (FORJIO4 SigV4). Products that need it add it; most don't. |
| Huudis `session.ts` backend middleware | OIDC-specific; Huudis is the identity provider, not a consumer. |
| Tailwind + `tailwindcss-animate` + `class-variance-authority` | Heavy baseline. Let products choose. Document in CLAUDE.md. |
| `@tanstack/react-query` | Same — too opinionated for template. |
| Plugipay's full Prisma model set (`Customer`, `Plan`, `Subscription`, etc.) | Product-specific; each service owns its bounded context. |
| Storlaunch's `github.run_id` E2E bypass rotation | Marginally better security but requires every product to read/rotate at runtime; secret-based is simpler. |
| LinkSnap's canvas native apt-deps | QR-specific — LinkSnap only. |
| `@forjio/engine-client` (used by LinkSnap + Storlaunch) | These are older products predating `@forjio/sdk`; template uses the SDK. |

---

## Porting plan

Six logical commits on branch `upgrade/battle-tested-patterns-2026-04-20`:

1. `docs: add TEMPLATE-UPGRADE-AUDIT.md`
2. `ci: add ci-cd.yml with LinkSnap staging pattern`
3. `backend: port app.ts/index.ts split, middleware, lib helpers`
4. `frontend: port api.ts/api-server.ts + error boundaries + ErrorPanel`
5. `e2e: add playwright.ci.config.ts + health smoke`
6. `cli: add session store helper + type-check script`
7. `docs: update CLAUDE.md with refs to the new patterns`

Each commit names its source product. PR opened against
`hachimi-cat/forjio-service-template`; no commits on `master`.
