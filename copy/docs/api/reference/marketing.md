---
title: Marketing — reference
---

# Marketing

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/marketing/discount-codes` | [List discount codes](#list-discount-codes) |
| `POST` | `/api/v1/marketing/discount-codes` | [Create a discount code](#create-a-discount-code) |
| `DELETE` | `/api/v1/marketing/discount-codes/{id}` | [Delete a discount code](#delete-a-discount-code) |
| `GET` | `/api/v1/marketing/discount-codes/{id}` | [Get a discount code](#get-a-discount-code) |
| `PATCH` | `/api/v1/marketing/discount-codes/{id}` | [Update a discount code](#update-a-discount-code) |
| `POST` | `/api/v1/marketing/discount-codes/validate` | [Create a validate](#create-a-validate) |
| `GET` | `/api/v1/marketing/loyalty/members/{customerId}` | [Member lookup — balance + recent ledger for one customer.](#member-lookup-balance-recent-ledger-for-one-customer) |
| `GET` | `/api/v1/marketing/loyalty/program` | [List program](#list-program) |
| `PUT` | `/api/v1/marketing/loyalty/program` | [Set program](#set-program) |

## List discount codes

```
GET /api/v1/marketing/discount-codes
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `active` | any | no |  |
| `cursor` | any | no |  |
| `limit` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/marketing/discount-codes" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a discount code

```
POST /api/v1/marketing/discount-codes
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | min length 1; max length 50 |
| `description` | string | no | max length 500; may be null |
| `type` | `percent` or `fixed` or `shipping_percent` or `shipping_fixed` | yes |  |
| `value` | integer | yes | above 0 |
| `currency` | string | no | min length 3; max length 3 |
| `scope` | `cart` or `products` or `tags` | no |  |
| `productIds` | array of string | no |  |
| `tagFilter` | array of string | no |  |
| `minPurchaseAmount` | integer | no | min 0; may be null |
| `maxUsesTotal` | integer | no | above 0; may be null |
| `maxUsesPerCustomer` | integer | no | above 0; may be null |
| `startsAt` | string (date-time) | no | may be null |
| `expiresAt` | string (date-time) | no | may be null |
| `active` | boolean | no |  |
| `public` | boolean | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/marketing/discount-codes" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"code":"…","description":"…","type":"percent","value":1,"currency":"…","scope":"cart","productIds":[],"tagFilter":[],"minPurchaseAmount":0,"maxUsesTotal":1,"maxUsesPerCustomer":1,"startsAt":"2026-01-01T00:00:00Z","expiresAt":"2026-01-01T00:00:00Z","active":false,"public":false}'
```

## Delete a discount code

```
DELETE /api/v1/marketing/discount-codes/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/marketing/discount-codes/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a discount code

```
GET /api/v1/marketing/discount-codes/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/marketing/discount-codes/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a discount code

```
PATCH /api/v1/marketing/discount-codes/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | any | no |  |
| `description` | string | no | max length 500; may be null |
| `type` | `percent` or `fixed` or `shipping_percent` or `shipping_fixed` | no |  |
| `value` | integer | no | above 0 |
| `currency` | string | no | min length 3; max length 3 |
| `scope` | `cart` or `products` or `tags` | no |  |
| `productIds` | array of string | no |  |
| `tagFilter` | array of string | no |  |
| `minPurchaseAmount` | integer | no | min 0; may be null |
| `maxUsesTotal` | integer | no | above 0; may be null |
| `maxUsesPerCustomer` | integer | no | above 0; may be null |
| `startsAt` | string (date-time) | no | may be null |
| `expiresAt` | string (date-time) | no | may be null |
| `active` | boolean | no |  |
| `public` | boolean | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/marketing/discount-codes/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"code":null,"description":"…","type":"percent","value":1,"currency":"…","scope":"cart","productIds":[],"tagFilter":[],"minPurchaseAmount":0,"maxUsesTotal":1,"maxUsesPerCustomer":1,"startsAt":"2026-01-01T00:00:00Z","expiresAt":"2026-01-01T00:00:00Z","active":false,"public":false}'
```

## Create a validate

```
POST /api/v1/marketing/discount-codes/validate
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | min length 1; max length 50 |
| `subtotal` | integer | yes | min 0 |
| `customerId` | string | no | may be null |
| `shippingCost` | integer | no | min 0 |
| `items` | array of object | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/marketing/discount-codes/validate" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"code":"…","subtotal":0,"customerId":"…","shippingCost":0,"items":[]}'
```

## Member lookup — balance + recent ledger for one customer.

```
GET /api/v1/marketing/loyalty/members/{customerId}
```

Member lookup — balance + recent ledger for one customer. The POS
 uses this to show points at the till + offer redemption. customerId is
 the Malapos Customer id (Ripllo keys its member rows on it via the
 earn/redeem externalRef flow).

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `customerId` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/marketing/loyalty/members/:customerId" \
  -H "Authorization: Bearer sk_live_…"
```

## List program

```
GET /api/v1/marketing/loyalty/program
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/marketing/loyalty/program" \
  -H "Authorization: Bearer sk_live_…"
```

## Set program

```
PUT /api/v1/marketing/loyalty/program
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `enabled` | boolean | no |  |
| `earnRatePoints` | number | yes | min 0 |
| `redeemValueIdr` | number | yes | min 0 |
| `marketingCampaignId` | string | no | may be null |

### Example

```bash
curl -X PUT "https://malapos.com/api/v1/marketing/loyalty/program" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false,"earnRatePoints":0,"redeemValueIdr":0,"marketingCampaignId":"…"}'
```
