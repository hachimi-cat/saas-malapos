---
title: "SDKs & CLI"
---

# SDKs & CLI

Malapos does **not** ship a product-specific JS, Python, or Go SDK yet.
Programmatic access is the [REST API](/docs/api-reference) plus two
things you can use today:

- **`@forjio/malapos-cli`** — the official command-line tool.
- **`@forjio/sdk`** — the shared Forjio client (`ApiClient`), which the
  CLI itself uses under the hood, pointed at the Malapos base URL.

## CLI

```bash
npm install -g @forjio/malapos-cli
```

Then sign in via the Huudis device flow:

```bash
malapos auth login
```

This opens a device-flow login and saves your credentials to
`~/.malapos/credentials` (one section per profile, mirroring the AWS
CLI's `~/.aws/credentials` convention).

### Auth commands

| Command | What it does |
|---|---|
| `malapos auth login` | Sign in via the OIDC device flow and save credentials |
| `malapos auth whoami` | Show the currently signed-in identity |
| `malapos auth logout` | Remove the active profile from `~/.malapos/credentials` |

### Resource commands

The shipped resource commands are read-only listers:

```bash
malapos outlets list      # store locations in your workspace
malapos products list     # products (with variants) in your workspace
```

### Configuration

The CLI talks to `https://malapos.com` by default. Override it with the
`MALAPOS_BASE_URL` environment variable (useful for staging):

```bash
MALAPOS_BASE_URL=https://staging-malapos.forjio.com malapos outlets list
```

## Programmatic access (REST)

For anything beyond the CLI's listers, call the REST API directly with
a Huudis Bearer token. The full surface — sales, inventory, purchase
orders, customers, reports, and more — is documented in the
[API reference](/docs/api-reference).

```bash
curl https://malapos.com/api/v1/outlets \
  -H "Authorization: Bearer $MALAPOS_TOKEN"
```

```ts
const res = await fetch("https://malapos.com/api/v1/products", {
  headers: { Authorization: `Bearer ${process.env.MALAPOS_TOKEN}` },
});
const { data, error, meta } = await res.json();
```

If you already use `@forjio/sdk` elsewhere, you can point its
`ApiClient` at `https://malapos.com` and call the same `/api/v1/*`
paths — that's exactly what the CLI does internally.
