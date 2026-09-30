---
title: Gift cards — reference
---

# Gift cards

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/gift-cards` | [List gift cards](#list-gift-cards) |
| `POST` | `/api/v1/gift-cards` | [Create a gift card](#create-a-gift-card) |
| `GET` | `/api/v1/gift-cards/{code}` | [Get a gift card](#get-a-gift-card) |
| `POST` | `/api/v1/gift-cards/{id}/void` | [Void a gift card](#void-a-gift-card) |

## List gift cards

```
GET /api/v1/gift-cards
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `customerId` | any | no |  |
| `status` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/gift-cards" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a gift card

```
POST /api/v1/gift-cards
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | integer | yes | above 0 |
| `customerId` | string | no | may be null |
| `code` | string | no | max length 60; may be null |
| `note` | string | no | max length 300; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/gift-cards" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"amount":0,"customerId":"…","code":"…","note":"…"}'
```

## Get a gift card

```
GET /api/v1/gift-cards/{code}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/gift-cards/:code" \
  -H "Authorization: Bearer sk_live_…"
```

## Void a gift card

```
POST /api/v1/gift-cards/{id}/void
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/gift-cards/:id/void" \
  -H "Authorization: Bearer sk_live_…"
```
