---
title: "API reference"
---

# API reference

The Malapos REST API. All resources are scoped to your workspace
(`accountId`, derived from your Huudis identity) — you never pass it
yourself.

## Base URL

```
https://malapos.com/api/v1
```

## Authentication

The API accepts two auth paths:

- **Bearer token** — a Huudis-issued JWT:

  ```
  Authorization: Bearer <jwt>
  ```

- **Browser session cookie** — the dashboard's BFF cookie, set on
  sign-in. Server-side calls from the app use this path.

Either way the request resolves to your workspace. There are no
separate per-workspace API keys in v1; programmatic callers use a
Huudis Bearer token (see [SDKs & CLI](/docs/sdk)). Requests without a
valid credential get `401 AUTH_REQUIRED`.

`GET /api/v1/health` is the one unauthenticated endpoint (service
status + dependency checks).

## Response envelope

Every response uses the family-standard envelope:

```json
{
  "data": { },
  "error": null,
  "meta": { "requestId": "req_...", "timestamp": "2026-01-01T00:00:00Z" }
}
```

On error, `data` is `null` and `error` carries an `UPPER_SNAKE_CASE`
`code` plus a human-readable `message` (and sometimes `param`):

```json
{
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "..." },
  "meta": { "requestId": "req_...", "timestamp": "..." }
}
```

Common codes: `VALIDATION_ERROR` (400), `AUTH_REQUIRED` (401),
`FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
`IDEMPOTENCY_KEY_IN_USE` (409), `INTERNAL_ERROR` (500). A paid-plan
limit returns `LIMIT_REACHED`.

## Pagination

List endpoints that grow unbounded (e.g. sales) are cursor-paginated.
Pass `?limit=` (1–100, default 20) and `?cursor=`. The response's
`meta` carries the next page:

```json
"meta": { "requestId": "...", "timestamp": "...", "cursor": "<next>", "hasMore": true }
```

When `hasMore` is `false`, `cursor` is `null`. Smaller collections
(outlets, categories, etc.) return the full set under a named key.

## IDs

IDs are ULIDs with a type prefix: `out_` (outlet), `cat_` (category),
`prd_` (product), `var_` (variant), `mdg_`/`mod_` (modifier group /
modifier), `txn_` (transaction), `shf_` (shift), `sup_` (supplier),
`pur_` (purchase order), `cus_` (customer). Money is whole IDR integers
(no decimals).

## Idempotency

Mutating requests accept an `Idempotency-Key` header. Re-sending the
same key returns the original result instead of creating a duplicate;
reusing a key with a different body returns `IDEMPOTENCY_KEY_IN_USE`.

## Endpoints

### Outlets — `/outlets`

| Method | Path | Description |
|---|---|---|
| GET | `/outlets` | List outlets in the workspace |
| POST | `/outlets` | Create an outlet (`name`, optional `address`, `phone`, `timezone`, `taxRateBps`, `taxInclusive`, `receiptHeader`, `receiptFooter`) |
| GET | `/outlets/:id` | Get one outlet |
| PATCH | `/outlets/:id` | Update an outlet |
| DELETE | `/outlets/:id` | Deactivate an outlet |

`taxRateBps` is basis points of 10000 (so 11% PPN = `1100`).

### Categories — `/categories`

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | List categories |
| POST | `/categories` | Create a category |
| PATCH | `/categories/:id` | Update a category |
| DELETE | `/categories/:id` | Delete / deactivate a category |

### Products — `/products`

| Method | Path | Description |
|---|---|---|
| GET | `/products` | List products with variants |
| GET | `/products/lookup` | Sell-screen lookup: `?barcode=` (single variant) or `?q=` (name/SKU search) |
| POST | `/products` | Create a product with one or more `variants` (`kind`, `trackStock`, `requiresBatch`, `categoryId`, `imageUrl`) |
| GET | `/products/:id` | Get one product |
| PATCH | `/products/:id` | Update a product |
| DELETE | `/products/:id` | Deactivate a product |
| POST | `/products/:id/variants` | Add a variant |
| PATCH | `/products/:id/variants/:vid` | Update a variant |
| DELETE | `/products/:id/variants/:vid` | Deactivate a variant |

A variant carries `name`, `price`, `cost`, `sku`, `barcode`,
`sortOrder`.

### Modifiers — `/modifiers`

| Method | Path | Description |
|---|---|---|
| GET | `/modifiers` | List modifier groups (with their modifiers) |
| POST | `/modifiers` | Create a group (`name`, `minSelect`, `maxSelect`) |
| GET | `/modifiers/:id` | Get one group |
| PATCH | `/modifiers/:id` | Update a group |
| DELETE | `/modifiers/:id` | Delete a group |
| POST | `/modifiers/:id/items` | Add a modifier (`name`, `price`) to a group |
| PATCH | `/modifiers/:id/items/:modId` | Update a modifier |
| DELETE | `/modifiers/:id/items/:modId` | Delete a modifier |
| GET | `/modifiers/product/:productId` | Groups attached to a product |
| PUT | `/modifiers/product/:productId` | Set which groups attach to a product |

### Sales — `/sales`

| Method | Path | Description |
|---|---|---|
| POST | `/sales` | Ring up a sale |
| GET | `/sales` | List sales (cursor-paginated); `?outletId=` `?status=` `?shiftId=` |
| GET | `/sales/:id` | Full receipt (items + payments + customer) |
| POST | `/sales/:id/void` | Void a sale (returns stock); optional `reason` |

`POST /sales` body:

```json
{
  "outletId": "out_...",
  "shiftId": "shf_...",
  "customerId": "cus_...",
  "items": [
    {
      "variantId": "var_...",
      "quantity": 2,
      "unitPrice": 15000,
      "discount": 0,
      "modifiers": [{ "name": "Less sugar", "price": 0 }]
    }
  ],
  "orderDiscount": 0,
  "payments": [
    { "method": "CASH", "amount": 30000, "tendered": 50000 }
  ],
  "status": "COMPLETED",
  "note": null
}
```

`status` is `COMPLETED` or `PARKED` (a held bill). Payment `method` is
one of `CASH`, `QRIS`, `CARD`, `OTHER`; for cash, `tendered` drives the
change calculation. `unitPrice` is optional (defaults to the variant's
catalog price). The transaction totals (`subtotal`, `taxTotal`,
`total`, `changeTotal`) are computed server-side.

### Inventory — `/inventory`

| Method | Path | Description |
|---|---|---|
| GET | `/inventory/levels` | On-hand levels per outlet/variant |
| POST | `/inventory/adjust` | Manual stock adjustment (writes a movement) |
| PUT | `/inventory/reorder` | Set a variant's reorder point |
| POST | `/inventory/transfer` | Transfer stock between outlets |
| GET | `/inventory/movements` | The stock movement ledger |
| GET | `/inventory/batches` | List pharmacy stock batches |
| POST | `/inventory/batches` | Create a dated batch |
| GET | `/inventory/expiring` | Batches expiring soon |

### Shifts — `/shifts`

| Method | Path | Description |
|---|---|---|
| GET | `/shifts/current` | The open shift for an outlet, if any |
| POST | `/shifts/open` | Open a shift with an `openingFloat` |
| POST | `/shifts/:id/close` | Close a shift with `countedCash` (reconciliation) |
| GET | `/shifts` | List shifts |
| GET | `/shifts/:id` | Get one shift |

### Suppliers — `/suppliers`

| Method | Path | Description |
|---|---|---|
| GET | `/suppliers` | List suppliers |
| POST | `/suppliers` | Create a supplier |
| GET | `/suppliers/:id` | Get one supplier |
| PATCH | `/suppliers/:id` | Update a supplier |
| DELETE | `/suppliers/:id` | Deactivate a supplier |

### Purchase orders — `/purchase-orders`

| Method | Path | Description |
|---|---|---|
| GET | `/purchase-orders` | List purchase orders |
| POST | `/purchase-orders` | Create a draft PO |
| GET | `/purchase-orders/:id` | Get one PO |
| PATCH | `/purchase-orders/:id` | Update a draft PO |
| POST | `/purchase-orders/:id/order` | Mark a PO as ordered |
| POST | `/purchase-orders/:id/receive` | Receive lines (stocks goods in; batch/expiry for pharmacy) |
| POST | `/purchase-orders/:id/cancel` | Cancel a PO |

### Customers — `/customers`

| Method | Path | Description |
|---|---|---|
| GET | `/customers` | List / search customers |
| POST | `/customers` | Create a customer |
| GET | `/customers/:id` | Get one customer |
| PATCH | `/customers/:id` | Update a customer |
| DELETE | `/customers/:id` | Delete a customer |
| GET | `/customers/:id/loyalty` | A customer's loyalty ledger |
| POST | `/customers/:id/loyalty/adjust` | Manually adjust points |
| POST | `/customers/:id/loyalty/redeem` | Redeem points |

### Reports — `/reports`

| Method | Path | Description |
|---|---|---|
| GET | `/reports/summary` | Sales summary for a period |
| GET | `/reports/top-products` | Top products (`?limit=`, 1–100, default 10) |
| GET | `/reports/sales-by-day` | Daily sales series (`?days=`, 1–365, default 30) |
| GET | `/reports/low-stock` | Variants at or below reorder point (`?outletId=`) |

### Settings — `/settings`

| Method | Path | Description |
|---|---|---|
| GET | `/settings` | The workspace business profile (auto-created on first read) |
| PUT | `/settings` | Update `businessName`, `businessType`, `currency` |

### Billing — `/billing`

| Method | Path | Description |
|---|---|---|
| GET | `/billing/tiers` | The plan catalog (public) |
| GET | `/billing` | Your workspace's current plan |
| POST | `/billing/checkout` | Start a Plugipay checkout for a paid tier |
| POST | `/billing/cancel` | Cancel the subscription (keeps the paid period, then lapses to free) |

Tiers are **Free** (Rp 0), **Starter** (Rp 99.000/mo), **Growth**
(Rp 199.000/mo), and **Business** (Rp 449.000/mo) — see the
[pricing page](/pricing) for what each includes. Paid plans are billed
through Plugipay.
