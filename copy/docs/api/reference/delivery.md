---
title: Delivery — reference
---

# Delivery

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/delivery/couriers` | [List couriers](#list-couriers) |
| `GET` | `/api/v1/delivery/origin` | [List origin](#list-origin) |
| `PATCH` | `/api/v1/delivery/origin` | [Update origin](#update-origin) |
| `POST` | `/api/v1/delivery/rates` | [Create a rate](#create-a-rate) |
| `POST` | `/api/v1/delivery/sales/{id}/dispatch` | [Deferred dispatch.](#deferred-dispatch) |
| `GET` | `/api/v1/delivery/shipments` | [List shipments](#list-shipments) |
| `POST` | `/api/v1/delivery/shipments` | [Create a delivery shipment for a sale.](#create-a-delivery-shipment-for-a-sale) |
| `GET` | `/api/v1/delivery/shipments/{id}` | [Get a shipment](#get-a-shipment) |
| `POST` | `/api/v1/delivery/shipments/{id}/cancel` | [Cancel a shipment](#cancel-a-shipment) |
| `POST` | `/api/v1/delivery/shipments/{id}/confirm-pickup` | [F-004 equivalent — "Book courier": flip the draft into a real Biteship order once the parcel is packed.](#f-004-equivalent-book-courier-flip-the-draft-into-a-real-biteship-order-once-the-parcel-is-packed) |

## List couriers

```
GET /api/v1/delivery/couriers
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/delivery/couriers" \
  -H "Authorization: Bearer sk_live_…"
```

## List origin

```
GET /api/v1/delivery/origin
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/delivery/origin" \
  -H "Authorization: Bearer sk_live_…"
```

## Update origin

```
PATCH /api/v1/delivery/origin
```

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/delivery/origin" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a rate

```
POST /api/v1/delivery/rates
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `destination` | any | no |  |
| `insurance` | any | no |  |
| `items` | any | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/delivery/rates" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"destination":null,"insurance":null,"items":null}'
```

## Deferred dispatch.

```
POST /api/v1/delivery/sales/{id}/dispatch
```

POST /sales/:id/dispatch — deferred dispatch. Create the Fulkruma shipment
for a DELIVERY sale from its persisted `deliveryDraft`, instead of at
completion. Lets the operator dispatch from the sale-detail page or the serve
board once they're ready. Idempotent on fulkrumaShipmentId (one shipment per
sale); 409 if the sale has no dispatchable draft.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/delivery/sales/:id/dispatch" \
  -H "Authorization: Bearer sk_live_…"
```

## List shipments

```
GET /api/v1/delivery/shipments
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `status` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/delivery/shipments" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a delivery shipment for a sale.

```
POST /api/v1/delivery/shipments
```

POST /shipments — create a delivery shipment for a sale.
Body: { transactionId?, destination, courierCode, courierServiceCode,
        courierType?, price, items, insured?, insurance?, customerId?,
        customerEmail? }. Origin is left empty so Fulkruma fills it
from the merchant's saved shipping origin (BiteshipConfig). On success
the shipment id + status are stamped onto the Transaction (when a
transactionId is supplied) so the POS can track delivery progress.

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `courierCode` | any | no |  |
| `courierServiceCode` | any | no |  |
| `courierType` | any | no |  |
| `customerEmail` | any | no |  |
| `customerId` | any | no |  |
| `destination` | any | no |  |
| `insurance` | any | no |  |
| `insured` | any | no |  |
| `items` | any | no |  |
| `price` | any | no |  |
| `transactionId` | any | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/delivery/shipments" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"courierCode":null,"courierServiceCode":null,"courierType":null,"customerEmail":null,"customerId":null,"destination":null,"insurance":null,"insured":null,"items":null,"price":null,"transactionId":null}'
```

## Get a shipment

```
GET /api/v1/delivery/shipments/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/delivery/shipments/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Cancel a shipment

```
POST /api/v1/delivery/shipments/{id}/cancel
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | any | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/delivery/shipments/:id/cancel" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"reason":null}'
```

## F-004 equivalent — "Book courier": flip the draft into a real Biteship order once the parcel is packed.

```
POST /api/v1/delivery/shipments/{id}/confirm-pickup
```

F-004 equivalent — "Book courier": flip the draft into a real Biteship
order once the parcel is packed. Driver allocation begins after this.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/delivery/shipments/:id/confirm-pickup" \
  -H "Authorization: Bearer sk_live_…"
```
