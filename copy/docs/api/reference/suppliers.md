---
title: Suppliers — reference
---

# Suppliers

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/suppliers` | [List suppliers](#list-suppliers) |
| `POST` | `/api/v1/suppliers` | [Create a supplier](#create-a-supplier) |
| `DELETE` | `/api/v1/suppliers/{id}` | [Delete a supplier](#delete-a-supplier) |
| `GET` | `/api/v1/suppliers/{id}` | [Get a supplier](#get-a-supplier) |
| `PATCH` | `/api/v1/suppliers/{id}` | [Update a supplier](#update-a-supplier) |

## List suppliers

```
GET /api/v1/suppliers
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `q` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/suppliers" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a supplier

```
POST /api/v1/suppliers
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 160 |
| `contact` | string | no | max length 160; may be null |
| `phone` | string | no | max length 40; may be null |
| `email` | string | no | max length 160; may be null |
| `address` | string | no | max length 500; may be null |
| `note` | string | no | max length 1000; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/suppliers" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","contact":"…","phone":"…","email":"…","address":"…","note":"…"}'
```

## Delete a supplier

```
DELETE /api/v1/suppliers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/suppliers/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a supplier

```
GET /api/v1/suppliers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/suppliers/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a supplier

```
PATCH /api/v1/suppliers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 160 |
| `contact` | string | no | max length 160; may be null |
| `phone` | string | no | max length 40; may be null |
| `email` | string | no | max length 160; may be null |
| `address` | string | no | max length 500; may be null |
| `note` | string | no | max length 1000; may be null |
| `isActive` | boolean | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/suppliers/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","contact":"…","phone":"…","email":"…","address":"…","note":"…","isActive":false}'
```
