---
title: Sales — reference
---

# Sales

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/sales` | [List sales](#list-sales) |
| `POST` | `/api/v1/sales` | [Create a sale](#create-a-sale) |
| `GET` | `/api/v1/sales/{id}` | [Get a sale](#get-a-sale) |
| `POST` | `/api/v1/sales/{id}/discard` | [Abandon a PARKED sale (e.g. an unpaid dynamic-QRIS sale).](#abandon-a-parked-sale-eg-an-unpaid-dynamic-qris-sale) |
| `PATCH` | `/api/v1/sales/{id}/items` | [Edit an open bill (PARKED sale): replace its line items + recompute totals, optionally re-seat or attach a customer.](#edit-an-open-bill-parked-sale-replace-its-line-items-recompute-totals-optionally-re-seat-or-attach-a-customer) |
| `POST` | `/api/v1/sales/{id}/payments` | [Record ONE tender against an open bill (PARKED) for split-bill checkout.](#record-one-tender-against-an-open-bill-parked-for-split-bill-checkout) |
| `POST` | `/api/v1/sales/{id}/refund` | [Refund a sale](#refund-a-sale) |
| `POST` | `/api/v1/sales/{id}/settle` | [Charge an open bill (PARKED → COMPLETED) with manual tenders, reusing the shared completion side-effects (stock + loyalty + event).](#charge-an-open-bill-parked-completed-with-manual-tenders-reusing-the-shared-completion-side-effects-stock-loyalty-event) |
| `POST` | `/api/v1/sales/{id}/void` | [Void a sale](#void-a-sale) |

## List sales

```
GET /api/v1/sales
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `orderType` | any | no |  |
| `outletId` | any | no |  |
| `shiftId` | any | no |  |
| `status` | any | no |  |
| `tableId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/sales" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a sale

```
POST /api/v1/sales
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `outletId` | string | yes |  |
| `shiftId` | string | no | may be null |
| `customerId` | string | no | may be null |
| `tableId` | string | no | may be null |
| `orderType` | `DINE_IN` or `TAKEAWAY` or `DELIVERY` | no |  |
| `items` | array of object | yes |  |
| `orderDiscount` | integer | no | min 0 |
| `deliveryFee` | integer | no | min 0 |
| `deliveryDraft` | any | no |  |
| `payments` | array of object | no |  |
| `status` | `COMPLETED` or `PARKED` | no |  |
| `note` | string | no | max length 500; may be null |
| `discountCode` | string | no | max length 50; may be null |
| `redeemPoints` | integer | no | min 0; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/sales" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"outletId":"…","shiftId":"…","customerId":"…","tableId":"…","orderType":"DINE_IN","items":[],"orderDiscount":0,"deliveryFee":0,"deliveryDraft":null,"payments":[],"status":"COMPLETED","note":"…","discountCode":"…","redeemPoints":0}'
```

## Get a sale

```
GET /api/v1/sales/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/sales/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Abandon a PARKED sale (e.g. an unpaid dynamic-QRIS sale).

```
POST /api/v1/sales/{id}/discard
```

POST /:id/discard — abandon a PARKED sale (e.g. an unpaid dynamic-QRIS
 sale). Pure status flip → VOIDED; no stock return (parked sales never
 deducted). Distinct from /void, which reverses a COMPLETED sale.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | no | max length 300; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/sales/:id/discard" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"reason":"…"}'
```

## Edit an open bill (PARKED sale): replace its line items + recompute totals, optionally re-seat or attach a customer.

```
PATCH /api/v1/sales/{id}/items
```

PATCH /:id/items — edit an open bill (PARKED sale): replace its line
 items + recompute totals, optionally re-seat or attach a customer. The
 F&B "Hold" action on an already-open table.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of object | yes |  |
| `orderDiscount` | integer | no | min 0 |
| `note` | string | no | max length 500; may be null |
| `tableId` | string | no | may be null |
| `orderType` | `DINE_IN` or `TAKEAWAY` or `DELIVERY` | no |  |
| `customerId` | string | no | may be null |
| `deliveryDraft` | any | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/sales/:id/items" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"items":[],"orderDiscount":0,"note":"…","tableId":"…","orderType":"DINE_IN","customerId":"…","deliveryDraft":null}'
```

## Record ONE tender against an open bill (PARKED) for split-bill checkout.

```
POST /api/v1/sales/{id}/payments
```

POST /:id/payments — record ONE tender against an open bill (PARKED) for
 split-bill checkout. Accumulates into paidTotal; when it covers the total
 the bill completes (PARKED → COMPLETED) and the shared completion
 side-effects (stock + loyalty + event) run exactly once. Until then the
 bill stays PARKED with a returned remaining balance.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `method` | `CASH` or `QRIS` or `VA` or `CARD` or `TRANSFER` or `GIFT_CARD` or `OTHER` | yes |  |
| `amount` | integer | yes | above 0 |
| `tendered` | integer | no | min 0 |
| `reference` | string | no | max length 200 |
| `plugipayRef` | string | no | max length 120 |
| `status` | `PENDING` or `PAID` or `FAILED` | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/sales/:id/payments" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"method":"CASH","amount":1,"tendered":0,"reference":"…","plugipayRef":"…","status":"PENDING"}'
```

## Refund a sale

```
POST /api/v1/sales/{id}/refund
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `lines` | array of object | no |  |
| `amount` | integer | no | above 0 |
| `restock` | boolean | no |  |
| `refundToStoreCredit` | boolean | no |  |
| `reason` | string | no | max length 300; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/sales/:id/refund" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"lines":[],"amount":1,"restock":false,"refundToStoreCredit":false,"reason":"…"}'
```

## Charge an open bill (PARKED → COMPLETED) with manual tenders, reusing the shared completion side-effects (stock + loyalty + event).

```
POST /api/v1/sales/{id}/settle
```

POST /:id/settle — charge an open bill (PARKED → COMPLETED) with manual
 tenders, reusing the shared completion side-effects (stock + loyalty +
 event). The F&B "Charge" action on a held table.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `payments` | array of object | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/sales/:id/settle" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"payments":[]}'
```

## Void a sale

```
POST /api/v1/sales/{id}/void
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | no | max length 300; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/sales/:id/void" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"reason":"…"}'
```
