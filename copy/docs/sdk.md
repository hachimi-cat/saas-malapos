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

### Resource commands

The shipped resource commands are read-only listers:

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

For anything beyond the CLI's listers, call the REST API directly with
a Huudis Bearer token. The full surface — sales, inventory, purchase
orders, customers, reports, and more — is documented in the
[API reference](/docs/api-reference). An `sk_live_…` API key (created
under **API keys** in the dashboard) works for the same calls — send
it as `Authorization: Bearer sk_live_…` in place of the token.

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
