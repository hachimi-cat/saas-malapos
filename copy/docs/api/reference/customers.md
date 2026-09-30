---
title: Customers — reference
---

# Customers

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/customers` | [List customers](#list-customers) |
| `POST` | `/api/v1/customers` | [Create a customer](#create-a-customer) |
| `DELETE` | `/api/v1/customers/{id}` | [Delete a customer](#delete-a-customer) |
| `GET` | `/api/v1/customers/{id}` | [Get a customer](#get-a-customer) |
| `PATCH` | `/api/v1/customers/{id}` | [Update a customer](#update-a-customer) |
| `GET` | `/api/v1/customers/{id}/loyalty` | [List loyalty](#list-loyalty) |
| `POST` | `/api/v1/customers/{id}/loyalty/adjust` | [Create an adjust](#create-an-adjust) |
| `POST` | `/api/v1/customers/{id}/loyalty/redeem` | [Create a redeem](#create-a-redeem) |

## List customers

```
GET /api/v1/customers
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `q` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/customers" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a customer

```
POST /api/v1/customers
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 120 |
| `phone` | string | no | max length 40; may be null |
| `email` | string (email) | no | max length 200; may be null |
| `note` | string | no | max length 500; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/customers" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","phone":"…","email":"…","note":"…"}'
```

## Delete a customer

```
DELETE /api/v1/customers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/customers/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a customer

```
GET /api/v1/customers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/customers/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a customer

```
PATCH /api/v1/customers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 120 |
| `phone` | string | no | max length 40; may be null |
| `email` | string (email) | no | max length 200; may be null |
| `note` | string | no | max length 500; may be null |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/customers/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","phone":"…","email":"…","note":"…"}'
```

## List loyalty

```
GET /api/v1/customers/{id}/loyalty
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/customers/:id/loyalty" \
  -H "Authorization: Bearer sk_live_…"
```

## Create an adjust

```
POST /api/v1/customers/{id}/loyalty/adjust
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `points` | integer | yes |  |
| `reason` | string | no | max length 200 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/customers/:id/loyalty/adjust" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"points":1,"reason":"…"}'
```

## Create a redeem

```
POST /api/v1/customers/{id}/loyalty/redeem
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `points` | integer | yes | above 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/customers/:id/loyalty/redeem" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"points":1}'
```
