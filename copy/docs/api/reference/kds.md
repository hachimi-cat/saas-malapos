---
title: Kds — reference
---

# Kds

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/kds` | [List kds](#list-kds) |
| `POST` | `/api/v1/kds/{id}/advance` | [Advance a kd](#advance-a-kd) |
| `POST` | `/api/v1/kds/{id}/back` | [Back a kd](#back-a-kd) |
| `GET` | `/api/v1/kds/counts` | [Nav-badge counts: active kitchen tickets + orders carrying a ready item (the serve board).](#nav-badge-counts-active-kitchen-tickets-orders-carrying-a-ready-item-the-serve-board) |
| `POST` | `/api/v1/kds/items/{itemId}/advance` | [Advance an item](#advance-an-item) |
| `POST` | `/api/v1/kds/items/{itemId}/back` | [Back an item](#back-an-item) |
| `GET` | `/api/v1/kds/ready` | [Every ACTIVE ticket's outstanding items, grouped by table, oldest-first.](#every-active-tickets-outstanding-items-grouped-by-table-oldest-first) |
| `POST` | `/api/v1/kds/tables/{tableId}/serve` | [Advance every currently-READY item across all of a table's active tickets to SERVED in one call, re-syncing each affected ticket's order state so a fully-served ticket drops off both boards.](#advance-every-currently-ready-item-across-all-of-a-tables-active-tickets-to-served-in-one-call-re-syncing-each-affected-tickets-order-state-so-a-fully-served-ticket-drops-off-both-boards) |

## List kds

```
GET /api/v1/kds
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/kds" \
  -H "Authorization: Bearer sk_live_…"
```

## Advance a kd

```
POST /api/v1/kds/{id}/advance
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/kds/:id/advance" \
  -H "Authorization: Bearer sk_live_…"
```

## Back a kd

```
POST /api/v1/kds/{id}/back
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/kds/:id/back" \
  -H "Authorization: Bearer sk_live_…"
```

## Nav-badge counts: active kitchen tickets + orders carrying a ready item (the serve board).

```
GET /api/v1/kds/counts
```

GET /counts — nav-badge counts: active kitchen tickets + orders carrying a
 ready item (the serve board). Account-wide; the nav is global.

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/kds/counts" \
  -H "Authorization: Bearer sk_live_…"
```

## Advance an item

```
POST /api/v1/kds/items/{itemId}/advance
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `itemId` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/kds/items/:itemId/advance" \
  -H "Authorization: Bearer sk_live_…"
```

## Back an item

```
POST /api/v1/kds/items/{itemId}/back
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `itemId` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/kds/items/:itemId/back" \
  -H "Authorization: Bearer sk_live_…"
```

## Every ACTIVE ticket's outstanding items, grouped by table, oldest-first.

```
GET /api/v1/kds/ready
```

GET /ready — every ACTIVE ticket's outstanding items, grouped by table,
oldest-first. Named /ready for its purpose (the expo/serve station), not
because it filters to READY items — it deliberately returns cooking ones
too, each tagged with its own kdsState so the board can dim them.
This is the WAITER's surface for the dine-in serve step: the kitchen has
cooked items to READY and the server now picks them up and delivers them to
the table (READY→SERVED). Dine-in items group under their table's `label`;
items on a table-less ticket (takeaway/counter) fall back to one group
per ticket keyed by its receipt number. Account- (and optionally outlet-)
scoped.
Shape: [{ tableId, tableLabel, tickets: [{ transactionId, number,
          items: [{ id, name, variantName, qty, modifiers, kdsState }] }] }]

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/kds/ready" \
  -H "Authorization: Bearer sk_live_…"
```

## Advance every currently-READY item across all of a table's active tickets to SERVED in one call, re-syncing each affected ticket's order state so a fully-served ticket drops off both boards.

```
POST /api/v1/kds/tables/{tableId}/serve
```

POST /tables/:tableId/serve — advance every currently-READY item across all
of a table's active tickets to SERVED in one call, re-syncing each affected
ticket's order state so a fully-served ticket drops off both boards. The
per-item serve reuses POST /items/:itemId/advance (READY→SERVED); this is the
convenience "Serve all" for a table. Account- (and optionally outlet-) scoped;
validates the table belongs to the account.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `tableId` | string | yes |  |

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/kds/tables/:tableId/serve" \
  -H "Authorization: Bearer sk_live_…"
```
