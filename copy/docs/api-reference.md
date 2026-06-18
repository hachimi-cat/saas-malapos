---
title: "API reference"
---

# API reference

The Malapos REST API. Replace the placeholders below with your
product's real endpoints.

## Base URL

```
https://malapos.com/api/v1
```

## Authentication

Every request carries an API key as a bearer token:

```
Authorization: Bearer <your-api-key>
```

Create per-workspace API keys in the dashboard under Settings → API
keys. Keys are scoped to a single workspace.

## Response envelope

Every response uses the family-standard envelope:

```json
{
  "data": { },
  "error": null,
  "meta": { "requestId": "req_...", "timestamp": "2026-01-01T00:00:00Z" }
}
```

On error, `data` is `null` and `error` carries an UPPER_SNAKE_CASE
`code` plus a human-readable `message`.

## Idempotency

Mutating requests accept an `Idempotency-Key` header. Re-sending the
same key returns the original result instead of creating a duplicate.

## Endpoints

Document each resource here — one `## ` section per resource, `### ` per
operation (list / create / get / update / delete).
