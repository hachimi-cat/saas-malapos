---
title: Floors — reference
---

# Floors

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/floors` | [List floors](#list-floors) |
| `POST` | `/api/v1/floors` | [Create a floor](#create-a-floor) |
| `DELETE` | `/api/v1/floors/{id}` | [Remove a floor.](#remove-a-floor) |
| `PATCH` | `/api/v1/floors/{id}` | [Update a floor](#update-a-floor) |

## List floors

```
GET /api/v1/floors
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/floors" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a floor

```
POST /api/v1/floors
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes | min length 1 |
| `name` | string | yes | min length 1; max length 60 |
| `sortOrder` | integer | no | min 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/floors" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","name":"…","sortOrder":0}'
```

## Remove a floor.

```
DELETE /api/v1/floors/{id}
```

DELETE /:id — remove a floor. Safe: a floor that still has ANY table
(active or inactive) blocks with 409, so a table is never orphaned. Move or
delete the floor's tables first.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/floors/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a floor

```
PATCH /api/v1/floors/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 60 |
| `sortOrder` | integer | no | min 0 |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/floors/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","sortOrder":0}'
```
