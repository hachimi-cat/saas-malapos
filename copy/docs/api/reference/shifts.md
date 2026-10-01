---
title: Shifts — reference
---

# Shifts

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/shifts` | [List shifts](#list-shifts) |
| `GET` | `/api/v1/shifts/{id}` | [Get a shift](#get-a-shift) |
| `POST` | `/api/v1/shifts/{id}/close` | [Close a shift](#close-a-shift) |
| `GET` | `/api/v1/shifts/current` | [List current](#list-current) |
| `POST` | `/api/v1/shifts/open` | [Create an open](#create-an-open) |

## List shifts

```
GET /api/v1/shifts
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |
| `status` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/shifts" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a shift

```
GET /api/v1/shifts/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/shifts/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Close a shift

```
POST /api/v1/shifts/{id}/close
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `countedCash` | integer | yes | min 0 |
| `notes` | string | no | max length 1000; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/shifts/:id/close" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"countedCash":0,"notes":"…"}'
```

## List current

```
GET /api/v1/shifts/current
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/shifts/current" \
  -H "Authorization: Bearer sk_live_…"
```

## Create an open

```
POST /api/v1/shifts/open
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes |  |
| `openingFloat` | integer | yes | min 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/shifts/open" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","openingFloat":0}'
```
