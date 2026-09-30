---
title: Purchase orders — reference
---

# Purchase orders

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/purchase-orders` | [List purchase orders](#list-purchase-orders) |
| `POST` | `/api/v1/purchase-orders` | [Create a purchase order](#create-a-purchase-order) |
| `GET` | `/api/v1/purchase-orders/{id}` | [Get a purchase order](#get-a-purchase-order) |
| `PATCH` | `/api/v1/purchase-orders/{id}` | [Update a purchase order](#update-a-purchase-order) |
| `POST` | `/api/v1/purchase-orders/{id}/cancel` | [Cancel a purchase order](#cancel-a-purchase-order) |
| `POST` | `/api/v1/purchase-orders/{id}/order` | [Order a purchase order](#order-a-purchase-order) |
| `POST` | `/api/v1/purchase-orders/{id}/receive` | [Receive a purchase order](#receive-a-purchase-order) |

## List purchase orders

```
GET /api/v1/purchase-orders
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |
| `status` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/purchase-orders" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a purchase order

```
POST /api/v1/purchase-orders
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes |  |
| `supplierId` | string | no | may be null |
| `items` | array of object | yes |  |
| `note` | string | no | max length 1000; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/purchase-orders" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","supplierId":"…","items":[],"note":"…"}'
```

## Get a purchase order

```
GET /api/v1/purchase-orders/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/purchase-orders/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a purchase order

```
PATCH /api/v1/purchase-orders/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `supplierId` | string | no | may be null |
| `items` | array of object | yes |  |
| `note` | string | no | max length 1000; may be null |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/purchase-orders/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"supplierId":"…","items":[],"note":"…"}'
```

## Cancel a purchase order

```
POST /api/v1/purchase-orders/{id}/cancel
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/purchase-orders/:id/cancel" \
  -H "Authorization: Bearer sk_live_…"
```

## Order a purchase order

```
POST /api/v1/purchase-orders/{id}/order
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/purchase-orders/:id/order" \
  -H "Authorization: Bearer sk_live_…"
```

## Receive a purchase order

```
POST /api/v1/purchase-orders/{id}/receive
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/purchase-orders/:id/receive" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'
```
