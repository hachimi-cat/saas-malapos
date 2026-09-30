---
title: Products — reference
---

# Products

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/products` | [List products](#list-products) |
| `POST` | `/api/v1/products` | [Create a product](#create-a-product) |
| `DELETE` | `/api/v1/products/{id}` | [Delete a product](#delete-a-product) |
| `GET` | `/api/v1/products/{id}` | [Get a product](#get-a-product) |
| `PATCH` | `/api/v1/products/{id}` | [Update a product](#update-a-product) |
| `POST` | `/api/v1/products/{id}/variants` | [── Variants ──](#variants) |
| `DELETE` | `/api/v1/products/{id}/variants/{vid}` | [Delete a variant](#delete-a-variant) |
| `PATCH` | `/api/v1/products/{id}/variants/{vid}` | [Update a variant](#update-a-variant) |
| `GET` | `/api/v1/products/{id}/variants/{vid}/recipe` | [List recipe](#list-recipe) |
| `PUT` | `/api/v1/products/{id}/variants/{vid}/recipe` | [Replace-all the components of a variant + set its isComposite flag.](#replace-all-the-components-of-a-variant-set-its-iscomposite-flag) |
| `POST` | `/api/v1/products/bulk-category` | [Bulk-assign a category to many products at once.](#bulk-assign-a-category-to-many-products-at-once) |
| `GET` | `/api/v1/products/lookup` | [Sell-screen lookup: exact barcode match first, else fuzzy name/sku.](#sell-screen-lookup-exact-barcode-match-first-else-fuzzy-namesku) |

## List products

```
GET /api/v1/products
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `active` | any | no |  |
| `categoryId` | any | no |  |
| `q` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/products" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a product

```
POST /api/v1/products
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 160 |
| `description` | string | no | max length 2000; may be null |
| `categoryId` | string | no | may be null |
| `kind` | `GOODS` or `SERVICE` | no | default `"GOODS"` |
| `trackStock` | boolean | no |  |
| `requiresBatch` | boolean | no | default `false` |
| `imageUrl` | string | no | max length 600; may be null |
| `isActive` | boolean | no | default `true` |
| `variants` | array of object | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/products" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","description":"…","categoryId":"…","kind":"GOODS","trackStock":false,"requiresBatch":false,"imageUrl":"…","isActive":true,"variants":[]}'
```

## Delete a product

```
DELETE /api/v1/products/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/products/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a product

```
GET /api/v1/products/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/products/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a product

```
PATCH /api/v1/products/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 160 |
| `description` | string | no | max length 2000; may be null |
| `categoryId` | string | no | may be null |
| `kind` | `GOODS` or `SERVICE` | no |  |
| `trackStock` | boolean | no |  |
| `requiresBatch` | boolean | no |  |
| `imageUrl` | string | no | max length 600; may be null |
| `isActive` | boolean | no |  |
| `variants` | array of object | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/products/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","description":"…","categoryId":"…","kind":"GOODS","trackStock":false,"requiresBatch":false,"imageUrl":"…","isActive":false,"variants":[]}'
```

## ── Variants ──

```
POST /api/v1/products/{id}/variants
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | default `"Default"`; min length 1; max length 80 |
| `sku` | string | no | max length 64; may be null |
| `barcode` | string | no | max length 64; may be null |
| `price` | integer | yes | min 0; max 1000000000 |
| `cost` | integer | no | default `0`; min 0; max 1000000000 |
| `sortOrder` | integer | no | default `0`; min 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/products/:id/variants" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"Default","sku":"…","barcode":"…","price":0,"cost":0,"sortOrder":0}'
```

## Delete a variant

```
DELETE /api/v1/products/{id}/variants/{vid}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `vid` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/products/:id/variants/:vid" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a variant

```
PATCH /api/v1/products/{id}/variants/{vid}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `vid` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | default `"Default"`; min length 1; max length 80 |
| `sku` | string | no | max length 64; may be null |
| `barcode` | string | no | max length 64; may be null |
| `price` | integer | no | min 0; max 1000000000 |
| `cost` | integer | no | default `0`; min 0; max 1000000000 |
| `sortOrder` | integer | no | default `0`; min 0 |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/products/:id/variants/:vid" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"Default","sku":"…","barcode":"…","price":0,"cost":0,"sortOrder":0}'
```

## List recipe

```
GET /api/v1/products/{id}/variants/{vid}/recipe
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `vid` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/products/:id/variants/:vid/recipe" \
  -H "Authorization: Bearer sk_live_…"
```

## Replace-all the components of a variant + set its isComposite flag.

```
PUT /api/v1/products/{id}/variants/{vid}/recipe
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `vid` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `isComposite` | boolean | yes |  |
| `components` | array of object | no | default `[]` |

### Example

```bash
curl -X PUT "https://malapos.com/api/v1/products/:id/variants/:vid/recipe" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"isComposite":false,"components":[]}'
```

## Bulk-assign a category to many products at once.

```
POST /api/v1/products/bulk-category
```

Bulk-assign a category to many products at once. Categorizing an existing
catalog one product-editor dialog at a time is the slow path; the products
table multi-selects rows and posts them here. `categoryId: null` clears.

### Example

```bash
curl -X POST "https://malapos.com/api/v1/products/bulk-category" \
  -H "Authorization: Bearer sk_live_…"
```

## Sell-screen lookup: exact barcode match first, else fuzzy name/sku.

```
GET /api/v1/products/lookup
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `barcode` | any | no |  |
| `q` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/products/lookup" \
  -H "Authorization: Bearer sk_live_…"
```
