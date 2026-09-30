---
title: Inventory — reference
---

# Inventory

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/v1/inventory/adjust` | [Create an adjust](#create-an-adjust) |
| `GET` | `/api/v1/inventory/batches` | [── Batches (pharmacy) ──](#batches-pharmacy) |
| `POST` | `/api/v1/inventory/batches` | [Create a batche](#create-a-batche) |
| `GET` | `/api/v1/inventory/composites` | [Derived availability for COMPOSITE variants at an outlet.](#derived-availability-for-composite-variants-at-an-outlet) |
| `GET` | `/api/v1/inventory/expiring` | [List expiring](#list-expiring) |
| `GET` | `/api/v1/inventory/levels` | [── Levels ──](#levels) |
| `GET` | `/api/v1/inventory/movements` | [── Movement ledger ──](#movement-ledger) |
| `PUT` | `/api/v1/inventory/reorder` | [Set reorder](#set-reorder) |
| `POST` | `/api/v1/inventory/transfer` | [Create a transfer](#create-a-transfer) |

## Create an adjust

```
POST /api/v1/inventory/adjust
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes |  |
| `variantId` | string | yes |  |
| `qtyDelta` | integer | yes |  |
| `reason` | string | no | max length 300; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/inventory/adjust" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","variantId":"…","qtyDelta":1,"reason":"…"}'
```

## ── Batches (pharmacy) ──

```
GET /api/v1/inventory/batches
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `all` | any | no |  |
| `outletId` | any | no |  |
| `variantId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/inventory/batches" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a batche

```
POST /api/v1/inventory/batches
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes |  |
| `variantId` | string | yes |  |
| `batchNo` | string | no | max length 120; may be null |
| `expiryDate` | string (date-time) or string (date) | no | may be null |
| `qty` | integer | yes | above 0 |
| `cost` | integer | no | min 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/inventory/batches" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","variantId":"…","batchNo":"…","expiryDate":null,"qty":0,"cost":0}'
```

## Derived availability for COMPOSITE variants at an outlet.

```
GET /api/v1/inventory/composites
```

Derived availability for COMPOSITE variants at an outlet. Composites carry
 no StockLevel row, so their sellable count is computed from components:
 min over components of floor(componentStock / qty). ?outletId required.

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/inventory/composites" \
  -H "Authorization: Bearer sk_live_…"
```

## List expiring

```
GET /api/v1/inventory/expiring
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `days` | any | no |  |
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/inventory/expiring" \
  -H "Authorization: Bearer sk_live_…"
```

## ── Levels ──

```
GET /api/v1/inventory/levels
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `low` | any | no |  |
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/inventory/levels" \
  -H "Authorization: Bearer sk_live_…"
```

## ── Movement ledger ──

```
GET /api/v1/inventory/movements
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |
| `variantId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/inventory/movements" \
  -H "Authorization: Bearer sk_live_…"
```

## Set reorder

```
PUT /api/v1/inventory/reorder
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes |  |
| `variantId` | string | yes |  |
| `reorderPoint` | integer | yes | min 0 |

### Example

```bash
curl -X PUT "https://malapos.com/api/v1/inventory/reorder" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","variantId":"…","reorderPoint":0}'
```

## Create a transfer

```
POST /api/v1/inventory/transfer
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `fromOutletId` | string | yes |  |
| `toOutletId` | string | yes |  |
| `variantId` | string | yes |  |
| `qty` | integer | yes | above 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/inventory/transfer" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"fromOutletId":"…","toOutletId":"…","variantId":"…","qty":0}'
```
