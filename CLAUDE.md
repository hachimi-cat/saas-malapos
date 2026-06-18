# CLAUDE.md — Forjio Service Template

This repo is the **template**. When a Forjio product is forked from it,
copy this file into the forked repo and replace `MALAPOS` /
`malapos` / `Malapos` with the actual product identity.

## For Claude working inside a product repo forked from this template

### Product identity

- Brand: `MALAPOS` (e.g., "huudis")
- Domain: `brand.com` + `brand.forjio.com`
- Repo: `hachimi-cat/MALAPOS`
- CLI package: `@forjio/MALAPOS-cli`

### Non-negotiable

- **Use `@forjio/sdk`.** Never reinvent JWT verify, ARN parse, event
  envelope, API response envelope, policy eval. If it's in the SDK,
  import it.
- **Follow ADRs.** Load-bearing decisions live in
  [hachimi-cat/forjio-architecture/adr/](https://github.com/hachimi-cat/forjio-architecture/tree/master/adr).
  Read before inventing new patterns.
- **One DB per service.** This repo's DB belongs only to this product.
  No cross-service SQL. Cross-service data comes via REST or events.
- **Outbox for state changes.** See ADR-0006. Write to `outbox_events`
  inside the same transaction as the state change.
- **Idempotent consumers.** Every event handler guards on
  `processed_events(event_id)` unique.
- **Three family integrations are baseline, not optional.** Every product
  wires into **Huudis** (auth/SSO — `routes/auth.ts` + `huudis-proxy.ts`),
  **Plugipay** (billing — partner checkout + `webhooks/plugipay`), and
  **Suppuo** (helpdesk — the support widget + hosted help center). The
  Suppuo touchpoints ship in the scaffold: the live-chat `widget.js`
  `<Script>` in the marketing + dashboard layouts, the "Help center" footer
  link + contact-page CTA → `suppuo.com/support/<brand>`, and the "Support"
  dashboard nav item → `suppuo.com/portal/<brand>`. All keyed off the brand
  slug (`rename.sh` rewrites it); claim the slug in the Suppuo workspace once
  so the URLs resolve (TEMPLATE.md Step 2). Don't strip these on a fork.

### Repo shape

| Dir | Purpose |
|---|---|
| `backend/` | Express + Prisma. `app.ts` (`createApp` factory) + `index.ts` (listener) split. Auth: `routes/auth.ts` (cookie-first Huudis SSO — login/signup/OIDC) is a thin `createAuthRouter` over the shared `@forjio/sdk/auth-server` BFF kit; product-specific config (cookie name, client id, scope, accountId derivation, roles, sign-in gate) lives in `src/auth-config.ts` — which ships two roles: the open multi-tenant `merchant` and the workspace-gated `admin`. `routes/huudis-proxy.ts` (`createHuudisProxy`, mounted `/api/v1/huudis`) proxies account + workspace management to Huudis. JWT verify for API callers via `@forjio/sdk/auth`. Shared `src/lib/` (http envelope helpers, ids, cursor, async-handler, zod-error, test-keys) + `src/middleware/` (request-id, rate-limit, idempotency, zod-error, auth, **admin-guard** — guards `/api/v1/admin/*` on an admin session or `X-Forjio-Admin-Secret`). Add product routes under `backend/src/routes/`; mount admin routers under `/admin` behind `adminGuard`. |
| `frontend/` | Next.js 15 App Router. Marketing at `/`, dashboard at `/dashboard`, OIDC at `/callback`. Built-in admin portal at `/admin/*` (the `(admin)` route group: login/forgot/reset + a gated `(portal)` dashboard via `@forjio/portal-ui` `brandTag="Admin"`; admin BFF proxy at `app/api/v1/console/[...path]`). `src/lib/api.ts` (client fetch) + `src/lib/api-server.ts` (RSC cookie forwarding). Error + loading boundaries at `src/app/(dashboard)/` and `src/app/(admin)/admin/(portal)/`. |
| `deploy/` | `nginx/<brand>.conf` — reference vhost. `^~ /api/v1/console/` → frontend (admin BFF proxy), everything else under `/api/v1/` → backend, default → frontend. `scripts/install.sh` symlinks it into `sites-enabled`. |
| `cli/` | Commander-based CLI. `auth login/whoami/logout` ship; session stored via `src/lib/session.ts` at `~/.MALAPOS/session.json`. |
| `e2e/` | Playwright. `playwright.config.ts` (local dev) + `playwright.ci.config.ts` (CI against staging — see ci-cd.yml). Health smoke ships; add per-flow tests per milestone. |

### CI/CD — shared staging E2E pattern

- `.github/workflows/ci-cd.yml` carries the `malapos` /
  `malapos` / `:4191` / `:3190` placeholders — `scripts/rename.sh`
  rewrites them when forking; the rest is mechanical.
- Job sequence: `lint → test → build → deploy-staging → e2e-staging →
  deploy-production → release`.
- **Frontend deploys as a dynamic Next app** (`next start` under pm2,
  the pawpado/ripllo model): the Build job ships `.next/`
  (`include-hidden-files: true` on upload-artifact — without it the
  dotdir is silently dropped) and the deploy step runs
  `npm ci --omit=dev` + `pm2 start npm -- start`. No static `out/`.
- **E2E reaches staging at `http://${{ secrets.STAGING_HOST }}/`** over
  PUBLIC http — set the secret to **`staging-<brand>.forjio.com`** (an A
  record → the SHARED staging box; nginx :80, UFW open), with
  `E2E_BYPASS_SECRET` gating auth. Staging lives on the shared box (the
  2026-06-15 consolidation), NOT a per-product droplet, and NOT Tailscale.
  Requires secrets `E2E_BYPASS_SECRET` + `SSH_PRIVATE_KEY` +
  `STAGING_HOST` + `PRODUCTION_HOST`. (No `TS_AUTHKEY`.) Register the
  product on the shared box per the spawn-product skill's Phase 1 step 8.

### Backend conventions

- **API envelope**: `{ data, error, meta: { requestId, timestamp,
  cursor?, hasMore? } }`. Wire shape matches `@forjio/sdk/http`.
  Compose via `src/lib/http.ts` helpers (`sendOk`, `sendCreated`,
  `sendList`, `sendErr`).
- **Error codes**: UPPER_SNAKE_CASE (`NOT_FOUND`, `CONFLICT`,
  `VALIDATION_ERROR`, `AUTH_REQUIRED`, `FORBIDDEN`, `INVALID_SIGNATURE`,
  `IDEMPOTENCY_KEY_IN_USE`, `INTERNAL_ERROR`). Use the `ApiError`
  class from `src/lib/http.ts` so routes throw instead of branching.
- **IDs**: ULID via `newId(prefix)` from `src/lib/ids.ts`. ARNs via
  `buildArn(accountId, resource, id)` — see ADR-0002.
- **Pagination**: base64url cursor `{createdAt, id}` via
  `src/lib/cursor.ts`.
- **Route factory**: `routes/index.ts` exports a factory accepting
  `RoutesOptions.enableTestOnlyRoutes`. Tests opt in;
  production never does.
- **Outbox writes inside the same transaction** as the state change.
  Consumer guards on `processed_events(event_id)` PK. See ADR-0006.

### Frontend conventions

- **Data access**: `src/lib/api.ts` for client components (fetch,
  auto Idempotency-Key on mutating calls, throws `ApiRequestError`).
  `src/lib/api-server.ts` (`'server-only'`) for RSCs that need to
  forward cookies into the backend.
- **Error boundaries**: `error.tsx` + `loading.tsx` at each route
  group. Use `<ErrorPanel />` from `src/components/ui/error-panel.tsx`.
- **Admin pages fetch via `adminFetch`** from
  `src/components/admin/ui.tsx` — defensive (content-type check before
  JSON.parse, so HTML error pages never surface raw parse errors).
- **Server-side fetch origins**: never use `NEXT_PUBLIC_API_URL` raw as
  a server-side origin — CI builds set it to the RELATIVE `/api/v1`
  and Node fetch throws. Strip the suffix + fall back to
  `http://127.0.0.1:<backend-port>` (see the dashboard/admin layouts
  and the console proxy).
- **Admin role resolution**: the auth kit's `/me` + `/logout` take the
  role from the QUERY param (`?role=admin`), not the role header — the
  admin gate and the console proxy's `auth/*` passthrough must stamp it.
- **Styling**: Tailwind + CSS custom properties (HSL triplets in
  `app/globals.css`). Required — the `@forjio/*-ui` packages ship
  Tailwind classes, so `tailwind.config.ts` must include the content
  globs for ALL THREE: `website-ui` (marketing), `portal-ui` (dashboard
  + buyer-portal Sidebar/shell), and `auth-ui` (login/signup). Omitting
  portal-ui left the Sidebar `position: sticky` with `top: auto` — no
  anchor, so it scrolled with the body instead of staying fixed
  (2026-06-15). Retune `--primary` / `--ring` after forking.
- **Marketing site**: hand-coded TSX under `src/app/(marketing)/`,
  built from `@forjio/website-ui` primitives — same as every shipped
  product (linksnap is the reference). The home page has a locked
  9-section structure (Hero → How it works → Features → Pricing →
  Comparison → For developers → Forjio family → FAQ → CTA). Docs are
  the exception: they render from markdown in `copy/docs/*.md` via
  `src/lib/markdown.tsx` (add a page → drop a `.md` + a `DOC_NAV` entry).

### Testing conventions

- Unit + integration in `backend/src/__tests__/` (Vitest). `npm test`
  runs with `--passWithNoTests` so scaffolding doesn't break CI
  before coverage ramps.
- E2E in `e2e/tests/` (Playwright). Run locally against
  `localhost:3190/4000`; CI hits `${{ secrets.STAGING_HOST }}` =
  `staging-<brand>.forjio.com` (the shared box, public http).
  `e2e/package-lock.json` is committed — CI's `npm ci` requires it.
- CLI tests in `cli/src/__tests__/`.
- `npm run type-check` at each dir = `tsc --noEmit`. CI's
  Lint & Type Check job invokes this explicitly.

### Conventions from Storlaunch/Plugipay/LinkSnap worth keeping

- API envelope shape (as above).
- Prisma migrations named `YYYYMMDDHHMMSS_<snake_case>`.
- Semver bumps on CLI on every feature commit.
- Gojo log + memory update per session.
- Backend adapter convention (from plugipay) — **optional**. When a
  service integrates external providers, put them under
  `backend/src/adapters/<provider>/` with a shared interface. Not
  every service needs this.

### DO NOT

- Copy Prisma models from Storlaunch/Plugipay without adapting to
  this service's bounded context.
- Add auth tables — they live in Huudis.
- Add a `Customer` model without thinking about whether it should be in
  Plugipay (payment customer) vs. Fulkruma (buyer address book) vs.
  Suppuo (support contact). Most likely: reference a Huudis identity +
  your own thin context-specific record.
- Add `@tanstack/react-query`, state libraries, component kits etc. to
  the template just because plugipay has them. Tailwind + `lucide-react`
  + `@forjio/website-ui` ARE baseline (the marketing site needs them);
  anything beyond that is a per-product choice — keep the template lean.
- Add FORJIO4 HMAC middleware from plugipay unless you're actually
  building a payment-style API with signed requests.

### See also

- [`TEMPLATE-UPGRADE-AUDIT.md`](./TEMPLATE-UPGRADE-AUDIT.md) — the
  2026-04-20 audit that established the current scaffolding. Names
  each pattern's source product and the rationale for each pick.
