---
title: Webhook subscriptions — reference
---

# Webhook subscriptions

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/webhook-subscriptions` | [List webhook subscriptions](#list-webhook-subscriptions) |
| `POST` | `/api/v1/webhook-subscriptions` | [Create a webhook subscription](#create-a-webhook-subscription) |
| `DELETE` | `/api/v1/webhook-subscriptions/{id}` | [Delete a webhook subscription](#delete-a-webhook-subscription) |
| `PATCH` | `/api/v1/webhook-subscriptions/{id}` | [Update a webhook subscription](#update-a-webhook-subscription) |

## List webhook subscriptions

```
GET /api/v1/webhook-subscriptions
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/webhook-subscriptions" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a webhook subscription

```
POST /api/v1/webhook-subscriptions
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string (uri) | yes | max length 2000 |
| `events` | array of string | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/webhook-subscriptions" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"url":"…","events":[]}'
```

## Delete a webhook subscription

```
DELETE /api/v1/webhook-subscriptions/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/webhook-subscriptions/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a webhook subscription

```
PATCH /api/v1/webhook-subscriptions/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `active` | boolean | yes |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/webhook-subscriptions/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"active":false}'
```
