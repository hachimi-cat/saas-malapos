---
title: Reports — reference
---

# Reports

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/reports/low-stock` | [List low stock](#list-low-stock) |
| `GET` | `/api/v1/reports/sales-by-day` | [List sales by day](#list-sales-by-day) |
| `GET` | `/api/v1/reports/summary` | [List summary](#list-summary) |
| `GET` | `/api/v1/reports/top-products` | [List top products](#list-top-products) |

## List low stock

```
GET /api/v1/reports/low-stock
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/reports/low-stock" \
  -H "Authorization: Bearer sk_live_…"
```

## List sales by day

```
GET /api/v1/reports/sales-by-day
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `days` | any | no |  |
| `from` | any | no |  |
| `to` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/reports/sales-by-day" \
  -H "Authorization: Bearer sk_live_…"
```

## List summary

```
GET /api/v1/reports/summary
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/reports/summary" \
  -H "Authorization: Bearer sk_live_…"
```

## List top products

```
GET /api/v1/reports/top-products
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/reports/top-products" \
  -H "Authorization: Bearer sk_live_…"
```
