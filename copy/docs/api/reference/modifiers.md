---
title: Modifiers — reference
---

# Modifiers

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/modifiers` | [── Modifier groups ──](#modifier-groups) |
| `POST` | `/api/v1/modifiers` | [Create a modifier](#create-a-modifier) |
| `DELETE` | `/api/v1/modifiers/{id}` | [Delete a modifier](#delete-a-modifier) |
| `GET` | `/api/v1/modifiers/{id}` | [Get a modifier](#get-a-modifier) |
| `PATCH` | `/api/v1/modifiers/{id}` | [Update a modifier](#update-a-modifier) |
| `POST` | `/api/v1/modifiers/{id}/items` | [── Modifiers (items within a group) ──](#modifiers-items-within-a-group) |
| `DELETE` | `/api/v1/modifiers/{id}/items/{modId}` | [Delete an item](#delete-an-item) |
| `PATCH` | `/api/v1/modifiers/{id}/items/{modId}` | [Update an item](#update-an-item) |
| `GET` | `/api/v1/modifiers/product/{productId}` | [── Product attachments (ProductModifierGroup join) ──](#product-attachments-productmodifiergroup-join) |
| `PUT` | `/api/v1/modifiers/product/{productId}` | [Replace a product](#replace-a-product) |

## ── Modifier groups ──

```
GET /api/v1/modifiers
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/modifiers" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a modifier

```
POST /api/v1/modifiers
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 80 |
| `minSelect` | integer | no | default `0`; min 0 |
| `maxSelect` | integer | no | default `1`; min 1 |
| `sortOrder` | integer | no | default `0`; min 0 |
| `modifiers` | array of object | no | default `[]` |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/modifiers" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","minSelect":0,"maxSelect":1,"sortOrder":0,"modifiers":[]}'
```

## Delete a modifier

```
DELETE /api/v1/modifiers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/modifiers/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a modifier

```
GET /api/v1/modifiers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/modifiers/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a modifier

```
PATCH /api/v1/modifiers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 80 |
| `minSelect` | integer | no | min 0 |
| `maxSelect` | integer | no | min 1 |
| `sortOrder` | integer | no | min 0 |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/modifiers/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","minSelect":0,"maxSelect":1,"sortOrder":0}'
```

## ── Modifiers (items within a group) ──

```
POST /api/v1/modifiers/{id}/items
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 80 |
| `price` | integer | no | default `0`; min 0 |
| `sortOrder` | integer | no | min 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/modifiers/:id/items" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","price":0,"sortOrder":0}'
```

## Delete an item

```
DELETE /api/v1/modifiers/{id}/items/{modId}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `modId` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/modifiers/:id/items/:modId" \
  -H "Authorization: Bearer sk_live_…"
```

## Update an item

```
PATCH /api/v1/modifiers/{id}/items/{modId}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `modId` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 80 |
| `price` | integer | no | min 0 |
| `sortOrder` | integer | no | min 0 |
| `isActive` | boolean | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/modifiers/:id/items/:modId" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","price":0,"sortOrder":0,"isActive":false}'
```

## ── Product attachments (ProductModifierGroup join) ──

```
GET /api/v1/modifiers/product/{productId}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `productId` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/modifiers/product/:productId" \
  -H "Authorization: Bearer sk_live_…"
```

## Replace a product

```
PUT /api/v1/modifiers/product/{productId}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `productId` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `groupIds` | array of string | yes |  |

### Example

```bash
curl -X PUT "https://malapos.com/api/v1/modifiers/product/:productId" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"groupIds":[]}'
```
