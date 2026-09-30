---
title: "SDKs & CLI"
---

# SDKs & CLI

Every Malapos API route is reachable from three SDKs and the CLI, all generated from the
API spec (the backend's own code), so none of them falls behind the
[API reference](/docs/api/reference):

| | Package | Every route |
|---|---|---|
| JavaScript / TypeScript | `npm install @forjio/malapos` | `client.api.<area><Action>()` |
| Python | `pip install forjio-malapos` | `client.api.<area>_<action>()` |
| Go | `go get github.com/hachimi-cat/malapos-go` | `client.API.<Area><Action>(ctx, …)` |
| CLI | `npm install -g @forjio/malapos-cli` | `malapos api <area> <action>` |

The SDKs authenticate with `Authorization: Bearer <token>`: an `sk_live_…` API key
(created under **API keys** in the dashboard; it acts in the workspace it was created in)
or a Huudis access token. Each reads `MALAPOS_TOKEN` (and `MALAPOS_BASE_URL`, default
`https://malapos.com`) when no token is passed.

## SDKs

**JavaScript / TypeScript:**

```ts
import { MalaposClient } from '@forjio/malapos';

const client = new MalaposClient({ token: process.env.MALAPOS_TOKEN });
const products = await client.api.productsList({ q: 'kopi' });
await client.api.salesVoid(saleId, { reason: 'wrong item' });
```

**Python:**

```python
from forjio_malapos import MalaposClient

client = MalaposClient(token=os.environ["MALAPOS_TOKEN"])
products = client.api.products_list(q="kopi")
client.api.sales_void(sale_id, reason="wrong item")
```

**Go:**

```go
import malapos "github.com/hachimi-cat/malapos-go"

c := malapos.New(malapos.Config{Token: os.Getenv("MALAPOS_TOKEN")})
products, err := c.API.ProductsList(ctx, &malapos.ProductsListArgs{Q: "kopi"})
```

Each call returns the response envelope's `data` and raises the SDK's error type
(`MalaposError` / `*malapos.Error`) with the envelope's `error.code`, HTTP status and
request id. List routes that page return their `cursor` and `hasMore`: on the returned
array in JS (`page.cursor`), as a `Page` in Python (`page.cursor`, `page.has_more`), and
through `c.DoEnvelope` in Go.

## CLI

```bash
npm install -g @forjio/malapos-cli
```

Then sign in — with your Huudis account in the browser, or with an API
key on a server or in CI:

```bash
malapos auth login                           # Huudis device flow
malapos auth login --api-key - < key.txt     # or an sk_live_… API key, read from stdin
malapos auth whoami
```

Either way the credential is saved to `~/.malapos/credentials` (one
section per profile, mirroring the AWS CLI's `~/.aws/credentials`
convention; readable only by you). A Huudis session refreshes itself.

### Auth commands

| Command | What it does |
|---|---|
| `malapos auth login` | Sign in via the OIDC device flow: the CLI prints a code and opens the browser; approve it there. `--no-browser` only prints the link. |
| `malapos auth login --api-key <key>` | Save an `sk_live_…` API key (created under **API keys** in the dashboard) to the profile instead. Pass `-` as the key to read it from stdin, so it stays out of your shell history. |
| `malapos auth whoami` | Show what the CLI is signed in as: the Huudis user, or which key |
| `malapos auth logout` | Remove the active profile (session or key) from `~/.malapos/credentials` |

Use `--profile <name>` to keep several sign-ins side by side (for
example `malapos --profile ci auth login --api-key -`). The
`MALAPOS_TOKEN` environment variable — an API key or a Huudis access
token — wins over any saved profile, so CI can skip `auth login`
entirely:

```bash
export MALAPOS_TOKEN=sk_live_…
malapos outlets list
```

### Every route: `malapos api`

`malapos api <area> <action>` has a command for every API route, with flags typed from
the API spec (`malapos api --help` lists the areas, `malapos api products --help` their
actions):

```bash
malapos api products list --q kopi
malapos api sales void <saleId> --reason "wrong item"
```

### Resource commands

The hand-written resource commands are read-only listers:

```bash
malapos outlets list      # store locations in your workspace
malapos products list     # products (with variants) in your workspace
```

`malapos products list` takes filters:

```bash
malapos products list --category <id> --active true --q kopi
```

### Global flags

Every subcommand accepts:

| Flag | What it does |
|---|---|
| `--json` | Machine-readable JSON output |
| `--profile <name>` | Pick a credential profile in `~/.malapos/credentials` |
| `--base-url <url>` | Override the API base URL |
| `--no-color` | Disable ANSI colors |

### Configuration

The CLI talks to `https://malapos.com` by default. Override it with the
`MALAPOS_BASE_URL` environment variable (useful for staging):

```bash
MALAPOS_BASE_URL=https://staging-malapos.forjio.com malapos outlets list
```

Two more environment variables tune the device-flow login:
`MALAPOS_HUUDIS_ISSUER` (default `https://huudis.com`) and
`MALAPOS_CLI_CLIENT_ID` (default `malapos-cli`); `auth login` also
takes them as `--issuer <url>` and `--client-id <id>`.

## Programmatic access (REST)

Any HTTP client works too: send the token as `Authorization: Bearer …`.

```bash
curl https://malapos.com/api/v1/outlets \
  -H "Authorization: Bearer $MALAPOS_TOKEN"
```

Responses are the Forjio envelope `{ data, error, meta }`. Every route, its parameters
and body fields: [API reference](/docs/api/reference).
