---
title: Categories — reference
---

# Categories

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/categories` | [List categories](#list-categories) |
| `POST` | `/api/v1/categories` | [Create a category](#create-a-category) |
| `DELETE` | `/api/v1/categories/{id}` | [Delete a category](#delete-a-category) |
| `PATCH` | `/api/v1/categories/{id}` | [Update a category](#update-a-category) |
| `POST` | `/api/v1/categories/reorder` | [Create a reorder](#create-a-reorder) |

## List categories

```
GET /api/v1/categories
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/categories" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a category

```
POST /api/v1/categories
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 80 |
| `sortOrder` | integer | no | default `0`; min 0 |
| `isActive` | boolean | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/categories" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","sortOrder":0,"isActive":false}'
```

## Delete a category

```
DELETE /api/v1/categories/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/categories/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a category

```
PATCH /api/v1/categories/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 80 |
| `sortOrder` | integer | no | default `0`; min 0 |
| `isActive` | boolean | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/categories/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","sortOrder":0,"isActive":false}'
```

## Create a reorder

```
POST /api/v1/categories/reorder
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `ids` | array of string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/categories/reorder" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"ids":[]}'
```
