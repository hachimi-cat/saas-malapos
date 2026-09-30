---
title: Modules — reference
---

# Modules

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/modules` | [List modules](#list-modules) |
| `POST` | `/api/v1/modules` | [Create a module](#create-a-module) |

## List modules

```
GET /api/v1/modules
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/modules" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a module

```
POST /api/v1/modules
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `enabled` | any | no |  |
| `module` | any | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/modules" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"enabled":null,"module":null}'
```
