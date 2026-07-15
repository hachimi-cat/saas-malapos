# Malapos

[![pipeline status](https://depllo.forjio.com/api/v1/public/badges/93ae2f262c5dcffe78cc5f6b433ab6da/pipeline.svg)](https://depllo.forjio.com/dashboard/projects/proj_01kxjmg5ks7zw6bt18p5wse5s6)

Malapos is a Forjio family product. Served at
[malapos.com](https://malapos.com) and mirrored at
[malapos.forjio.com](https://malapos.forjio.com).

## What this repo contains

- `backend/` — Express + Prisma API
- `frontend/` — Next.js 15 App Router (marketing site + dashboard)
- `cli/` — `@forjio/malapos-cli` Commander-based CLI
- `e2e/` — Playwright suite (local + CI-against-staging)
- `copy/docs/` — markdown docs rendered at `/docs`
- `scripts/` — bootstrap, seed-demo, provision-do, standardize, codegen-sdk

## Develop

```bash
cd backend  && npm install && npm run dev   # :4191
cd frontend && npm install && npm run dev   # :3190
```

See [CLAUDE.md](./CLAUDE.md) for in-repo conventions and the wider
Forjio family architecture.
