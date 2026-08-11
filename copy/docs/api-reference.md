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

The API accepts four auth paths:

- **API key** — an `sk_live_…` bearer token you create under
  **Developer → API keys** in the dashboard. This is the path for your
  own integrations:

  ```
  Authorization: Bearer sk_live_…
  ```

  The plaintext key is shown once at creation — store it like a
  password (only a SHA-256 hash is kept server-side). Revoke it any
  time from the same screen.

- **Huudis JWT** — a Huudis-issued Bearer token, for callers that
  already hold a platform identity (see [SDKs & CLI](/docs/sdk)):

  ```
  Authorization: Bearer <jwt>
  ```

- **Delegation token** — `Authorization: Delegation <token>`, minted
  internally for embedded-assistant runs acting on behalf of a
  signed-in member. Delegated runs follow a per-path allowlist: the
  merchant's configuration (catalog, modifiers, outlets, tables and
  floors, suppliers, the customer book, settings, webhook
  subscriptions, marketing content, warehouses) is writable; the books
  (sales, shifts, stock levels and movements, gift cards, purchase
  orders) and money surfaces are readable but never writable — the
  assistant proposes those changes and the merchant applies them under
  their own session. Provider credentials and API keys return
  `403 FORBIDDEN` outright, and review-mode runs are refused any
  write. You don't mint these yourself; they exist so you can reason
  about what the assistant can and cannot touch.

- **Browser session cookie** — the dashboard's BFF cookie, set on
  sign-in. Server-side calls from the app use this path.

Every path resolves to your workspace. Requests without a valid
credential get `401 AUTH_REQUIRED`.

The unauthenticated endpoints are `GET /api/v1/health` (service status
+ dependency checks), `GET /api/v1/billing/tiers` (the public plan
catalog), the `/api/v1/auth/*` session routes (login, signup,
password reset, OIDC, `/me`, logout), and the inbound webhook
receivers `/api/v1/webhooks/plugipay` + `/api/v1/webhooks/fulkruma`
(signature-verified in the handler instead).

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

Common codes: `VALIDATION_ERROR` (400 or 422 — see below),
`AUTH_REQUIRED` (401), `PLAN_UPGRADE_REQUIRED` (402), `FORBIDDEN`
(403), `LIMIT_REACHED` (403, a plan cap), `NOT_FOUND` (404),
`CONFLICT` (409), `IDEMPOTENCY_KEY_IN_USE` (409),
`PAYMENT_MODULE_DISABLED` / `FULFILLMENT_MODULE_DISABLED` /
`MARKETING_MODULE_DISABLED` (409, the partner module is off),
`UNKNOWN_MODULE` (422), `INTERNAL_ERROR` (500).

**Validation errors come in two flavors.** A request body that fails
schema validation (wrong type, missing field, bad enum) returns
`400 VALIDATION_ERROR` with `param` naming the first offending field.
Domain validation inside a handler (empty cart, zero adjustment,
gift-card payment without a code, …) mostly returns
`422 VALIDATION_ERROR`. Treat any `VALIDATION_ERROR` as "fix the
request", whichever status carries it.

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

IDs are ULIDs with a type prefix. Money is whole IDR integers (no
decimals).

| Prefix | Resource | Prefix | Resource |
|---|---|---|---|
| `out_` | outlet | `txn_` | sale transaction |
| `flr_` | floor | `tli_` | transaction line item |
| `tbl_` | dine-in table | `pay_` | payment |
| `cat_` | category | `rfd_` | refund |
| `prd_` | product | `shf_` | cashier shift |
| `var_` | product variant | `sup_` | supplier |
| `rcp_` | recipe component | `pur_` | purchase order |
| `mdg_` | modifier group | `poi_` | purchase order item |
| `mod_` | modifier | `cus_` | customer |
| `lvl_` | stock level | `loy_` | loyalty ledger entry |
| `stk_` | stock movement | `gft_` | gift card |
| `bat_` | stock batch | `gce_` | gift card ledger entry |
| `pos_` | workspace settings | `bsub_` | billing subscription |
| `evt_` | event (outbox / audit log) | `ak_` | API key |
| | | `whs_` | webhook subscription |

## Idempotency

Mutating requests to locally-served resources accept an
`Idempotency-Key` header. Re-sending the same key returns the original
result instead of creating a duplicate; the replay window is 24 hours,
and reusing a key with a different body returns
`409 IDEMPOTENCY_KEY_IN_USE`.

Module-proxied surfaces (the Payments, Marketing, and Fulfillment
routes below) forward your request to the partner product, which
applies its own idempotency semantics — the key still travels with the
request, but the dedupe happens on the partner side.

## Endpoints

### Outlets — `/outlets`

| Method | Path | Description |
|---|---|---|
| GET | `/outlets` | List outlets in the workspace |
| POST | `/outlets` | Create an outlet (`name`, optional `address`, `phone`, `timezone`, `taxRateBps`, `taxInclusive`, `receiptHeader`, `receiptFooter`) |
| GET | `/outlets/:id` | Get one outlet |
| PATCH | `/outlets/:id` | Update an outlet |
| DELETE | `/outlets/:id` | Delete — hard-deletes when the outlet has no sales history (`{ id, deleted: true }`), deactivates otherwise (`{ outlet, deactivated: true }`) |

`taxRateBps` is basis points of 10000 (so 11% PPN = `1100`).

### Categories — `/categories`

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | List categories (each with `productCount`) |
| POST | `/categories` | Create a category (`name`, `sortOrder`) |
| POST | `/categories/reorder` | Bulk reorder: `{ ids }` — the full ordered id list; `sortOrder` is rewritten to match |
| PATCH | `/categories/:id` | Update a category |
| DELETE | `/categories/:id` | Delete (products keep a null `categoryId`) |

### Products — `/products`

| Method | Path | Description |
|---|---|---|
| GET | `/products` | List products with variants; `?categoryId=` `?active=` `?q=` |
| GET | `/products/lookup` | Sell-screen lookup: `?barcode=` (single variant) or `?q=` (name/SKU search) |
| POST | `/products` | Create a product with one or more `variants` |
| POST | `/products/bulk-category` | Assign a category to many products: `{ productIds, categoryId }` (`categoryId: null` clears) |
| GET | `/products/:id` | Get one product |
| PATCH | `/products/:id` | Update product fields; an optional `variants` list is reconciled (create/update/remove) against the existing set |
| DELETE | `/products/:id` | Hard-delete when no variant has sales history (`{ id, deleted: true }`), deactivate otherwise (`{ product, deactivated: true }`) |
| POST | `/products/:id/variants` | Add a variant |
| PATCH | `/products/:id/variants/:vid` | Update a variant |
| DELETE | `/products/:id/variants/:vid` | Hard-delete if unsold, deactivate if it has sales |

`kind` (`GOODS` \| `SERVICE`), `trackStock`, `requiresBatch`,
`categoryId`, and `imageUrl` are **product-level** fields (services
never track stock; goods default to tracked). A **variant** carries
`name`, `sku`, `barcode`, `price`, `cost`, `sortOrder`.

#### Composite items (recipes)

A variant can be a composite built from other variants
(bill-of-materials); selling it deducts component stock.

| Method | Path | Description |
|---|---|---|
| GET | `/products/:id/variants/:vid/recipe` | The variant's `isComposite` flag + components |
| PUT | `/products/:id/variants/:vid/recipe` | Replace-all: `{ isComposite, components: [{ componentVariantId, quantity, unit? }] }` |

A composite cannot contain itself or another composite
(`422 VALIDATION_ERROR`). Derived availability lives at
`GET /inventory/composites`.

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
| GET | `/sales` | List sales (cursor-paginated); `?outletId=` `?status=` `?shiftId=` `?tableId=` `?orderType=` |
| GET | `/sales/:id` | Full receipt (items + payments + customer + table + delivery status) |
| PATCH | `/sales/:id/items` | Edit an open bill (PARKED): replace line items + recompute totals; can re-seat (`tableId`, `orderType`) or attach a customer |
| POST | `/sales/:id/settle` | Charge an open bill (PARKED → COMPLETED): `{ payments }` |
| POST | `/sales/:id/payments` | Record ONE tender against an open bill (split-bill); completes the sale once `paidTotal` covers the total |
| POST | `/sales/:id/void` | Void a COMPLETED sale (returns stock); optional `reason` |
| POST | `/sales/:id/discard` | Abandon a PARKED sale (status → VOIDED, no stock return) |
| POST | `/sales/:id/refund` | Partial/full refund of a COMPLETED sale |

`POST /sales` body:

```json
{
  "outletId": "out_...",
  "shiftId": "shf_...",
  "customerId": "cus_...",
  "tableId": "tbl_...",
  "orderType": "DINE_IN",
  "items": [
    {
      "variantId": "var_...",
      "quantity": 2,
      "unitPrice": 15000,
      "discount": 0,
      "modifiers": [{ "name": "Less sugar", "price": 0 }],
      "note": "no onions"
    }
  ],
  "orderDiscount": 0,
  "deliveryFee": 0,
  "deliveryDraft": null,
  "payments": [
    { "method": "CASH", "amount": 30000, "tendered": 50000 }
  ],
  "status": "COMPLETED",
  "note": null,
  "discountCode": null,
  "redeemPoints": null
}
```

- `status` is `COMPLETED` or `PARKED` (a held bill). `shiftId` is
  optional/nullable.
- Payment `method` is one of `CASH`, `QRIS`, `VA`, `CARD`, `TRANSFER`,
  `GIFT_CARD`, `OTHER`; for cash, `tendered` drives the change
  calculation. A `GIFT_CARD` payment requires the card code in
  `reference` (`422` without it).
- `tableId` seats the sale at a dine-in table; `orderType` is
  `DINE_IN`, `TAKEAWAY`, or `DELIVERY`. A `DELIVERY` order can carry
  `deliveryFee` (the chosen courier rate, added to the total) and a
  `deliveryDraft` (destination + courier + parcel) for deferred
  dispatch via `POST /delivery/sales/:id/dispatch`.
- `discountCode` and `redeemPoints` route through the Marketing module
  and are ignored when it is off. A per-item `note` shows on the KDS
  and serve boards.
- `unitPrice` is optional (defaults to the variant's catalog price).
  The transaction totals (`subtotal`, `taxTotal`, `total`,
  `changeTotal`) are computed server-side.

`POST /sales/:id/refund` body — `lines`
(`[{ transactionItemId, qty }]`) for line-item refunds and/or `amount`
for an amount-only refund, plus optional `restock` (return refunded
quantities to stock), `refundToStoreCredit` (issue a gift card instead
of cash), and `reason`. Returns the updated sale + `refundId`.

### Tables — `/tables`

F&B dine-in tables. A table is "occupied" when it carries an open bill
(a PARKED sale with its `tableId`).

| Method | Path | Description |
|---|---|---|
| GET | `/tables` | List tables (`?outletId=` required; `?floorId=` `?includeInactive=`) |
| GET | `/tables/floor` | Live floor view: each active table + its open bill (`?outletId=` required; `?floorId=`) |
| POST | `/tables` | Create a table (`outletId`, `label`; optional `floorId`, `zone`, `seats`, `sortOrder`, `posX`, `posY`, `shape`, `width`, `height`) |
| PATCH | `/tables/:id` | Edit a table (incl. moving it to another floor) |
| PUT | `/tables/layout` | Bulk-save the floor map: `{ outletId, floorId?, tables: [{ id, posX, posY, shape?, width?, height? }] }` |
| DELETE | `/tables/:id` | Hard-delete when no sales reference it (`{ id, deleted: true }`), deactivate otherwise (`{ table, deactivated: true }`) |

A duplicate `label` at the same outlet is `409 CONFLICT`. `shape` is
`SQUARE` \| `ROUND` \| `RECT`; a table created without a `floorId`
lands on the outlet's first floor (a "Main floor" is created if none
exists).

### Floors — `/floors`

Layout canvases within an outlet (Ground Floor / Rooftop / …).

| Method | Path | Description |
|---|---|---|
| GET | `/floors` | List floors (`?outletId=` required) |
| POST | `/floors` | Create a floor (`outletId`, `name`, `sortOrder`) |
| PATCH | `/floors/:id` | Rename / reorder |
| DELETE | `/floors/:id` | Delete — `409 CONFLICT` while the floor still has tables |

### Kitchen Display — `/kds`

A ticket is any sale with a kitchen state; each line item advances
`NEW → PREPARING → READY → SERVED` on its own, and the ticket's state
is the least-advanced active item. Fully-served tickets drop off the
board.

| Method | Path | Description |
|---|---|---|
| GET | `/kds` | Active tickets (NEW/PREPARING/READY) with items; `?outletId=` |
| GET | `/kds/ready` | The expo/serve board: outstanding items grouped by table; `?outletId=` |
| GET | `/kds/counts` | Nav badges: `{ active, ready }`; `?outletId=` |
| POST | `/kds/:id/advance` | Advance ALL of a ticket's items one step |
| POST | `/kds/:id/back` | Move ALL of a ticket's items back one step (undo) |
| POST | `/kds/items/:itemId/advance` | Advance ONE item (READY→SERVED = "serve") |
| POST | `/kds/items/:itemId/back` | Move ONE item back one step |
| POST | `/kds/tables/:tableId/serve` | Serve every READY item across a table's tickets |

Acting on a non-kitchen sale, an already-served ticket, or a table
with nothing ready returns `409 CONFLICT`.

### Realtime events — `/events`

| Method | Path | Description |
|---|---|---|
| GET | `/events/stream` | Long-lived Server-Sent Events stream; `?outletId=` pins one outlet |

Emits `event: change` frames with `{"topic":"kds"|"floor"|"serve"}`
whenever a mutation touches one of your live boards, plus a `: ping`
heartbeat every ~25s. `EventSource` auto-reconnects; refetch the
affected board on each `change`.

### Gift cards — `/gift-cards`

Issue and manage gift cards / store credit. Redemption happens in the
sell flow (a `GIFT_CARD` payment whose `reference` is the code).
Module-aware: with the Payment module on, cards live in your connected
Plugipay workspace; off, they're stored locally — the API shape is the
same either way.

| Method | Path | Description |
|---|---|---|
| GET | `/gift-cards` | List (cursor-paginated); `?customerId=` `?status=` |
| POST | `/gift-cards` | Issue: `{ amount, customerId?, code?, note? }` (code generated when absent; a supplied code must be free — `409 CONFLICT`) |
| GET | `/gift-cards/:code` | Look up a card by code (balance + status) |
| POST | `/gift-cards/:id/void` | Cancel a card (writes off the remaining balance) |

### Inventory — `/inventory`

| Method | Path | Description |
|---|---|---|
| GET | `/inventory/levels` | On-hand levels per outlet/variant; `?outletId=` `?low=true` |
| GET | `/inventory/composites` | Derived availability for composite variants (`?outletId=` required) |
| POST | `/inventory/adjust` | Manual stock adjustment (writes a movement); zero `qtyDelta` is `422` |
| PUT | `/inventory/reorder` | Set a variant's reorder point |
| POST | `/inventory/transfer` | Transfer stock between outlets |
| GET | `/inventory/movements` | The stock movement ledger (cursor-paginated); `?outletId=` `?variantId=` |
| GET | `/inventory/batches` | List pharmacy stock batches; `?outletId=` `?variantId=` `?all=` |
| POST | `/inventory/batches` | Create a dated batch (+ PURCHASE movement) |
| GET | `/inventory/expiring` | Batches expiring within `?days=` (default 30) |

### Shifts — `/shifts`

| Method | Path | Description |
|---|---|---|
| GET | `/shifts/current` | The **caller's** open shift at an outlet (`?outletId=` required; `422` without it); `shift` is `null` when none |
| POST | `/shifts/open` | Open a shift with an `openingFloat` (one open shift per cashier per outlet — `409` otherwise) |
| POST | `/shifts/:id/close` | Close a shift with `countedCash` (reconciliation) |
| GET | `/shifts` | List shifts (cursor-paginated); `?outletId=` `?status=` |
| GET | `/shifts/:id` | Shift detail + sales/cash summary |

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

All four endpoints accept `?outletId=`. `summary` and `top-products`
also accept `?from=` and `?to=` (ISO datetimes; default: the last 30
days).

| Method | Path | Description |
|---|---|---|
| GET | `/reports/summary` | Headline KPIs (`salesCount`, `gross`, `discounts`, `tax`, `net`, `avgTicket`) + a `byMethod` payment-method breakdown |
| GET | `/reports/top-products` | Best sellers by quantity (`?limit=`, 1–100, default 10) |
| GET | `/reports/sales-by-day` | Daily sales series (`?days=`, 1–365, default 30) |
| GET | `/reports/low-stock` | Variants at or below reorder point |

### Settings — `/settings`

| Method | Path | Description |
|---|---|---|
| GET | `/settings` | The workspace business profile (auto-created on first read) |
| PUT | `/settings` | Update `businessName`, `businessType` (`RETAIL` \| `FNB` \| `PHARMACY` \| `GENERAL`), `currency`, and the store bank account shown for `TRANSFER` payments: `transferBankName`, `transferBankAccountNumber`, `transferBankAccountHolder` |

### Uploads — `/uploads`

| Method | Path | Description |
|---|---|---|
| POST | `/uploads/sign` | Presign a direct-to-storage image upload: `{ contentType, ext? }` → `{ key, url, publicUrl, contentType }` |

`PUT` the file to `url` with the same `Content-Type` that was signed.
Images only (`400 VALIDATION_ERROR` otherwise); used for product
images.

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

### Modules — `/modules`

Partner-module registry: `payment` (Plugipay), `fulfillment`
(Fulkruma), `marketing` (Ripllo). Enabling a module the first time
auto-provisions the partner workspace.

| Method | Path | Description |
|---|---|---|
| GET | `/modules` | Registry: each module's state + what your plan allows |
| POST | `/modules` | Toggle: `{ module, enabled }` |

Free plans can't enable modules (`402 PLAN_UPGRADE_REQUIRED`);
disabling is always allowed. An unrecognized module name is
`422 UNKNOWN_MODULE`. While a module is off, its routes below return
`409` with the matching `*_MODULE_DISABLED` code.

### Payments module — `/payments`

Requires the Payment module (`409 PAYMENT_MODULE_DISABLED` when off).
Dynamic QRIS/VA at the sell screen:

| Method | Path | Description |
|---|---|---|
| POST | `/payments/qris` | Mint a checkout session: `{ transactionId }` (settles a PARKED sale's PENDING QRIS/VA payment) or `{ amount }` (ad-hoc); `method` is `qris` (default) or `va` |
| GET | `/payments/qris/:sessionId` | Poll session status |
| GET | `/payments/overview` | Balance + recent checkout sessions + payouts |

The rest of the surface mirrors the Plugipay merchant API through your
connected workspace — same resources, wrapped in the Malapos envelope:

- `/payments/checkout-sessions` — create/list/get, `POST /:id/confirm`
- `/payments/plans` — CRUD + `POST /:id/prices`, `PATCH /prices/:priceId`
- `/payments/subscriptions` — create/list/get/update/cancel
- `/payments/invoices` — list (+ `/export.csv`), get, `/:id/pdf`, `/:id/html`
- `/payments/receipts` — list/get, `POST /:id/email`, `/:id/pdf`, `/:id/html`, `/:id/escpos`
- `/payments/customers` — create/list/get/update
- `/payments/payouts` — balance, bank account, list/get/create + status transitions
- `/payments/ledger` — `/entries` (+ `.csv`), `/entries/:id`, `/balance`
- `/payments/reports` — `/pnl`, `/cash-flow`

See the [Plugipay API reference](https://plugipay.com/docs) for the
resource shapes.

### Delivery module — `/delivery`

Requires the Fulfillment module (`409 FULFILLMENT_MODULE_DISABLED`
when off). The POS sell-flow courier surface (Fulkruma → Biteship):

| Method | Path | Description |
|---|---|---|
| GET | `/delivery/origin` | The merchant's saved shipping origin |
| PATCH | `/delivery/origin` | Update the shipping origin |
| GET | `/delivery/couriers` | Courier catalog |
| POST | `/delivery/rates` | Rate quotes: `{ destination, items, insurance? }` |
| GET | `/delivery/shipments` | List shipments; `?status=` |
| GET | `/delivery/shipments/:id` | Get one shipment |
| POST | `/delivery/shipments` | Create a shipment (`destination`, `courierCode`, `courierServiceCode`, `items` required; optional `transactionId` stamps the sale) |
| POST | `/delivery/shipments/:id/confirm-pickup` | Book the courier (driver allocation starts) |
| POST | `/delivery/shipments/:id/cancel` | Cancel a shipment |
| POST | `/delivery/sales/:id/dispatch` | Deferred dispatch: create the shipment from a DELIVERY sale's saved `deliveryDraft`; `409 CONFLICT` if the sale has no dispatchable draft |

One shipment per sale: re-posting for a sale that already carries a
shipment returns the existing one.

### Fulfillment surface — `/fulfillment/*`

The full Fulkruma merchant menu, proxied through your connected
workspace (same module gate as `/delivery`):

- `/fulfillment/shipments` — list/get, `/:id/label`, create,
  `/:id/confirm-pickup`, `/:id/cancel`
- `/fulfillment/shipping` — `GET|PATCH /origin`, `/couriers`,
  `POST /rates`
- `/fulfillment/shipping-credits` — balance, `/transactions`,
  `POST /topup`
- `/fulfillment/warehouses` — CRUD
- `/fulfillment/inventory` — `/products`, `/stock`, `/movements`,
  `POST /adjust`
- `/fulfillment/licenses` — list, `/validate`, create,
  `POST /:id/revoke`
- `/fulfillment/deliveries` — digital deliveries: list/get

### Marketing module — `/marketing`

Requires the Marketing module (`409 MARKETING_MODULE_DISABLED` when
off). Discount codes + POS loyalty, backed by Ripllo:

| Method | Path | Description |
|---|---|---|
| GET | `/marketing/discount-codes` | List; `?limit=` `?cursor=` `?active=` |
| POST | `/marketing/discount-codes` | Create (`code`, `type`, `value`; `type` is `percent` \| `fixed` \| `shipping_percent` \| `shipping_fixed`) |
| GET | `/marketing/discount-codes/:id` | Get one code |
| PATCH | `/marketing/discount-codes/:id` | Update a code |
| DELETE | `/marketing/discount-codes/:id` | Archive a code |
| POST | `/marketing/discount-codes/validate` | Dry-run a code against a cart: `{ code, subtotal, customerId?, items? }` |
| GET | `/marketing/loyalty/program` | The points program config |
| PUT | `/marketing/loyalty/program` | Update it (`enabled`, `earnRatePoints`, `redeemValueIdr`) |
| GET | `/marketing/loyalty/members/:customerId` | A customer's balance + ledger history |

The binding redemption happens at sale completion (`discountCode` /
`redeemPoints` on `POST /sales`); `validate` is the preview.

The wider Ripllo merchant surface lives under `/account/*` (same
module gate): `/account/marketing/*` is a generic passthrough of the
whole Ripllo merchant API (campaigns, creators, funnels, audience, …),
plus typed routes at `/account/blog/posts`, `/account/feeds`,
`/account/pixels`, `/account/abandoned-cart`, and
`/account/referrals`. See the
[Ripllo API reference](https://ripllo.com/docs) for the resource
shapes.

### Audit log — `/audit-log`

| Method | Path | Description |
|---|---|---|
| GET | `/audit-log` | Cursor-paginated feed of the domain events your workspace has emitted, newest first; `?type=` filters to one event type |

The feed is the same append-only event store that drives webhook
delivery, so it never drifts from what was actually delivered.

### API keys — `/api-keys`

Programmatic access tokens. The plaintext `sk_live_…` key is returned
**once** at creation (only a SHA-256 hash is stored); pass it as a
`Authorization: Bearer` token. IDs are `ak_`-prefixed.

| Method | Path | Description |
|---|---|---|
| GET | `/api-keys` | List your keys (prefix + last-used only) |
| POST | `/api-keys` | Create a key (`{ name }`) — response carries the one-time `key` |
| DELETE | `/api-keys/:id` | Revoke a key immediately |

### Webhooks — `/webhook-subscriptions`

Get an HTTPS POST whenever something happens in your workspace. The
signing secret (`whsec_…`) is shown **once** at creation. IDs are
`whs_`-prefixed.

| Method | Path | Description |
|---|---|---|
| GET | `/webhook-subscriptions` | List your endpoints |
| POST | `/webhook-subscriptions` | Add an endpoint (`{ url, events }`) — response carries the one-time `secret` |
| PATCH | `/webhook-subscriptions/:id` | Pause/resume (`{ active }`) |
| DELETE | `/webhook-subscriptions/:id` | Remove an endpoint |

Subscribe to specific events or `["*"]` for all. Event types:

- `malapos.sale.completed.v1` — a sale was finalized and paid
- `malapos.sale.voided.v1` — a recorded sale was voided
- `malapos.sale.refunded.v1` — a sale was partially or fully refunded
- `malapos.purchase_order.received.v1` — PO lines were received into stock
- `malapos.kds.advanced.v1` — a kitchen ticket moved forward a step
- `malapos.kds.reverted.v1` — a kitchen ticket moved back a step
- `malapos.kds.item_advanced.v1` — one ticket item moved forward
- `malapos.kds.item_reverted.v1` — one ticket item moved back
- `malapos.kds.served.v1` — a table's ready items were served
- `malapos.shipping_credit.topped_up.v1` — fulfillment shipping credit was topped up
- `malapos.billing.subscribed.v1` — a workspace started/upgraded a paid plan
- `malapos.billing.canceled.v1` — a workspace canceled its subscription

Each delivery is a POST of `{ id, type, occurredAt, data }` with a
`Malapos-Signature: t=<unix>,v1=<hex>` header. Recompute the HMAC-SHA256
of `` `${t}.${rawBody}` `` with your signing secret and compare; reject
anything older than ~5 minutes. Delivery is at-most-once in v1 (failures
are logged, not retried) — reconcile with `GET /sales` if you need
certainty.
