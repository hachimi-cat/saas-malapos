---
title: Api keys — reference
---

# Api keys

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/api-keys` | [List api keys](#list-api-keys) |
| `POST` | `/api/v1/api-keys` | [Create an api key](#create-an-api-key) |
| `DELETE` | `/api/v1/api-keys/{id}` | [Delete an api key](#delete-an-api-key) |

## List api keys

```
GET /api/v1/api-keys
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/api-keys" \
  -H "Authorization: Bearer sk_live_…"
```

## Create an api key

```
POST /api/v1/api-keys
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 120 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/api-keys" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…"}'
```

## Delete an api key

```
DELETE /api/v1/api-keys/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/api-keys/:id" \
  -H "Authorization: Bearer sk_live_…"
```
