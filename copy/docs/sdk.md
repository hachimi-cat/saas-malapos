---
title: "SDKs"
---

# SDKs

Malapos ships typed SDKs in three languages, all wrapping the same
REST API. Scaffold them with `scripts/codegen-sdk.sh`.

## JavaScript / TypeScript

```bash
npm install @forjio/malapos
```

```ts
import { ForjioBrand } from "@forjio/malapos";

const client = new ForjioBrand({ apiKey: process.env.MALAPOS_KEY! });
const items = await client.things.list();
```

## Python

```bash
pip install forjio-malapos
```

```python
from forjio_malapos import ForjioBrandClient

client = ForjioBrandClient(api_key="...")
items = client.list()
```

## Go

```bash
go get github.com/hachimi-cat/malapos-go
```

```go
import forjiobrand "github.com/hachimi-cat/malapos-go"

c := forjiobrand.New(forjiobrand.Config{APIKey: "..."})
items, err := c.List(ctx, nil)
```

## CLI

```bash
npm install -g @forjio/malapos-cli
malapos auth login
```

The CLI authenticates via the Huudis device flow and stores its session
at `~/.malapos/session.json`.
