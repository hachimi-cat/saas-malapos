---
title: Tables — reference
---

# Tables

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/tables` | [List tables](#list-tables) |
| `POST` | `/api/v1/tables` | [Create a table](#create-a-table) |
| `DELETE` | `/api/v1/tables/{id}` | [Delete a table](#delete-a-table) |
| `PATCH` | `/api/v1/tables/{id}` | [Update a table](#update-a-table) |
| `GET` | `/api/v1/tables/floor` | [The live floor: every active table with its current open bill (the most-recent PARKED transaction seated at it, if any).](#the-live-floor-every-active-table-with-its-current-open-bill-the-most-recent-parked-transaction-seated-at-it-if-any) |
| `PUT` | `/api/v1/tables/layout` | [Bulk-save the floor map.](#bulk-save-the-floor-map) |

## List tables

```
GET /api/v1/tables
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `floorId` | any | no |  |
| `includeInactive` | any | no |  |
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/tables" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a table

```
POST /api/v1/tables
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes | min length 1 |
| `floorId` | string | no | min length 1; may be null |
| `label` | string | yes | min length 1; max length 60 |
| `zone` | string | no | max length 60; may be null |
| `seats` | integer | no | min 0; max 1000; may be null |
| `sortOrder` | integer | no | min 0 |
| `posX` | integer | no | min 0; max 1000; may be null |
| `posY` | integer | no | min 0; max 1000; may be null |
| `shape` | `SQUARE` or `ROUND` or `RECT` | no |  |
| `width` | integer | no | min 1; max 12 |
| `height` | integer | no | min 1; max 12 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/tables" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","floorId":"…","label":"…","zone":"…","seats":0,"sortOrder":0,"posX":0,"posY":0,"shape":"SQUARE","width":1,"height":1}'
```

## Delete a table

```
DELETE /api/v1/tables/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/tables/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a table

```
PATCH /api/v1/tables/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `label` | string | no | min length 1; max length 60 |
| `floorId` | string | no | min length 1 |
| `zone` | string | no | max length 60; may be null |
| `seats` | integer | no | min 0; max 1000; may be null |
| `sortOrder` | integer | no | min 0 |
| `isActive` | boolean | no |  |
| `posX` | integer | no | min 0; max 1000; may be null |
| `posY` | integer | no | min 0; max 1000; may be null |
| `shape` | `SQUARE` or `ROUND` or `RECT` | no |  |
| `width` | integer | no | min 1; max 12 |
| `height` | integer | no | min 1; max 12 |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/tables/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"label":"…","floorId":"…","zone":"…","seats":0,"sortOrder":0,"isActive":false,"posX":0,"posY":0,"shape":"SQUARE","width":1,"height":1}'
```

## The live floor: every active table with its current open bill (the most-recent PARKED transaction seated at it, if any).

```
GET /api/v1/tables/floor
```

GET /floor?outletId= — the live floor: every active table with its current
open bill (the most-recent PARKED transaction seated at it, if any).
`openBill` is null for an available table.

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `floorId` | any | no |  |
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/tables/floor" \
  -H "Authorization: Bearer sk_live_…"
```

## Bulk-save the floor map.

```
PUT /api/v1/tables/layout
```

PUT /layout — bulk-save the floor map. Repositions many tables in one
request (the editor's "Save layout"). Account + outlet scoped: every id
must belong to a table at this outlet, or the whole save 404s (no partial
writes). Returns the refreshed table set.

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes | min length 1 |
| `floorId` | string | no | min length 1; may be null |
| `tables` | array of object | yes |  |

### Example

```bash
curl -X PUT "https://malapos.com/api/v1/tables/layout" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","floorId":"…","tables":[]}'
```
