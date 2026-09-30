---
title: Fulfillment — reference
---

# Fulfillment

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/fulfillment/deliveries` | [List deliveries](#list-deliveries) |
| `GET` | `/api/v1/fulfillment/deliveries/{id}` | [Get a delivery](#get-a-delivery) |
| `POST` | `/api/v1/fulfillment/inventory/adjust` | [Create an adjust](#create-an-adjust) |
| `GET` | `/api/v1/fulfillment/inventory/movements` | [List movements](#list-movements) |
| `GET` | `/api/v1/fulfillment/inventory/products` | [Fulkruma-side products (with their variants) — the inventory grid lists a row per variant/warehouse pair from these.](#fulkruma-side-products-with-their-variants-the-inventory-grid-lists-a-row-per-variantwarehouse-pair-from-these) |
| `GET` | `/api/v1/fulfillment/inventory/stock` | [List stock](#list-stock) |
| `GET` | `/api/v1/fulfillment/licenses` | [List licenses](#list-licenses) |
| `POST` | `/api/v1/fulfillment/licenses` | [Create a licens](#create-a-licens) |
| `POST` | `/api/v1/fulfillment/licenses/{id}/revoke` | [Revoke a licens](#revoke-a-licens) |
| `GET` | `/api/v1/fulfillment/licenses/validate` | [List validate](#list-validate) |
| `GET` | `/api/v1/fulfillment/shipments` | [List shipments](#list-shipments) |
| `POST` | `/api/v1/fulfillment/shipments` | [Create a shipment](#create-a-shipment) |
| `GET` | `/api/v1/fulfillment/shipments/{id}` | [Get a shipment](#get-a-shipment) |
| `POST` | `/api/v1/fulfillment/shipments/{id}/cancel` | [Cancel a booking the courier hasn't collected.](#cancel-a-booking-the-courier-hasnt-collected) |
| `POST` | `/api/v1/fulfillment/shipments/{id}/confirm-pickup` | [Confirm pickup a shipment](#confirm-pickup-a-shipment) |
| `GET` | `/api/v1/fulfillment/shipments/{id}/label` | [List label](#list-label) |
| `POST` | `/api/v1/fulfillment/shipments/{id}/rebook` | [Rebook a shipment](#rebook-a-shipment) |
| `GET` | `/api/v1/fulfillment/shipping-credits` | [List shipping credits](#list-shipping-credits) |
| `POST` | `/api/v1/fulfillment/shipping-credits/topup` | [Create a topup](#create-a-topup) |
| `GET` | `/api/v1/fulfillment/shipping-credits/transactions` | [List transactions](#list-transactions) |
| `GET` | `/api/v1/fulfillment/shipping/couriers` | [List couriers](#list-couriers) |
| `GET` | `/api/v1/fulfillment/shipping/origin` | [List origin](#list-origin) |
| `PATCH` | `/api/v1/fulfillment/shipping/origin` | [Update origin](#update-origin) |
| `POST` | `/api/v1/fulfillment/shipping/rates` | [Create a rate](#create-a-rate) |
| `GET` | `/api/v1/fulfillment/shipping/track/{waybillId}` | [Public buyer tracking lives on fulkruma.com — keep the route present so the chrome never 404s, but redirect callers to the canonical tracker.](#public-buyer-tracking-lives-on-fulkrumacom-keep-the-route-present-so-the-chrome-never-404s-but-redirect-callers-to-the-canonical-tracker) |
| `GET` | `/api/v1/fulfillment/warehouses` | [List warehouses](#list-warehouses) |
| `POST` | `/api/v1/fulfillment/warehouses` | [Create a warehous](#create-a-warehous) |
| `DELETE` | `/api/v1/fulfillment/warehouses/{id}` | [Delete a warehous](#delete-a-warehous) |
| `PATCH` | `/api/v1/fulfillment/warehouses/{id}` | [Update a warehous](#update-a-warehous) |

## List deliveries

```
GET /api/v1/fulfillment/deliveries
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/deliveries" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a delivery

```
GET /api/v1/fulfillment/deliveries/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/deliveries/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Create an adjust

```
POST /api/v1/fulfillment/inventory/adjust
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `variantId` | string | yes | min length 1 |
| `warehouseId` | string | yes | min length 1 |
| `delta` | integer | yes |  |
| `reason` | `manual_adjust` or `refund_restock` or `transfer_in` or `transfer_out` or `damaged` or `returned_to_supplier` or `initial_stock` or `import` | yes |  |
| `note` | string | no | max length 500 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/inventory/adjust" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"variantId":"…","warehouseId":"…","delta":1,"reason":"manual_adjust","note":"…"}'
```

## List movements

```
GET /api/v1/fulfillment/inventory/movements
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `variantId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/inventory/movements" \
  -H "Authorization: Bearer sk_live_…"
```

## Fulkruma-side products (with their variants) — the inventory grid lists a row per variant/warehouse pair from these.

```
GET /api/v1/fulfillment/inventory/products
```

Fulkruma-side products (with their variants) — the inventory grid lists
a row per variant/warehouse pair from these.

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/inventory/products" \
  -H "Authorization: Bearer sk_live_…"
```

## List stock

```
GET /api/v1/fulfillment/inventory/stock
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `variantId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/inventory/stock" \
  -H "Authorization: Bearer sk_live_…"
```

## List licenses

```
GET /api/v1/fulfillment/licenses
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/licenses" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a licens

```
POST /api/v1/fulfillment/licenses
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `productId` | string | yes | min length 1 |
| `customerId` | string | yes | min length 1 |
| `maxActivations` | integer | no | min 1 |
| `expiresAt` | string | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/licenses" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"productId":"…","customerId":"…","maxActivations":1,"expiresAt":"…"}'
```

## Revoke a licens

```
POST /api/v1/fulfillment/licenses/{id}/revoke
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/licenses/:id/revoke" \
  -H "Authorization: Bearer sk_live_…"
```

## List validate

```
GET /api/v1/fulfillment/licenses/validate
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `key` | any | no |  |
| `productId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/licenses/validate" \
  -H "Authorization: Bearer sk_live_…"
```

## List shipments

```
GET /api/v1/fulfillment/shipments
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `status` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/shipments" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a shipment

```
POST /api/v1/fulfillment/shipments
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `transactionId` | string | no |  |
| `customerId` | string | no |  |
| `customerEmail` | string (email) | no |  |
| `courierCode` | string | yes | min length 1 |
| `courierServiceCode` | string | yes | min length 1 |
| `courierType` | string | no |  |
| `price` | integer | no | min 0 |
| `insured` | boolean | no |  |
| `insurance` | integer | no | min 0 |
| `destination` | object | yes |  |
| `items` | array of object | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/shipments" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"…","customerId":"…","customerEmail":"…","courierCode":"…","courierServiceCode":"…","courierType":"…","price":0,"insured":false,"insurance":0,"destination":{},"items":[]}'
```

## Get a shipment

```
GET /api/v1/fulfillment/shipments/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/shipments/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Cancel a booking the courier hasn't collected.

```
POST /api/v1/fulfillment/shipments/{id}/cancel
```

Cancel a booking the courier hasn't collected. Fulkruma calls it off
at Biteship and refunds the shipping credit confirm-pickup debited;
the sale that dispatched it follows the new status.

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
curl -X POST "https://malapos.com/api/v1/fulfillment/shipments/:id/cancel" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"reason":null}'
```

## Confirm pickup a shipment

```
POST /api/v1/fulfillment/shipments/{id}/confirm-pickup
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/shipments/:id/confirm-pickup" \
  -H "Authorization: Bearer sk_live_…"
```

## List label

```
GET /api/v1/fulfillment/shipments/{id}/label
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `size` | `a4` or `thermal-80x100` or `thermal-100x150` | no | default `"thermal-100x150"` |
| `showSenderPhone` | `true` or `false` | no |  |
| `showRecipientPhone` | `true` or `false` | no |  |
| `maskRecipientName` | `true` or `false` | no |  |
| `showShippingCost` | `true` or `false` | no |  |
| `showInsurance` | `true` or `false` | no |  |
| `showItems` | `true` or `false` | no |  |
| `showItemDescriptions` | `true` or `false` | no |  |
| `showItemSkus` | `true` or `false` | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/shipments/:id/label" \
  -H "Authorization: Bearer sk_live_…"
```

## Rebook a shipment

```
POST /api/v1/fulfillment/shipments/{id}/rebook
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `courierCode` | string | no | min length 1 |
| `courierServiceCode` | string | no | min length 1 |
| `courierType` | string | no | min length 1 |
| `price` | integer | no | min 0 |
| `insured` | boolean | no |  |
| `insurance` | integer | no | min 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/shipments/:id/rebook" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"courierCode":"…","courierServiceCode":"…","courierType":"…","price":0,"insured":false,"insurance":0}'
```

## List shipping credits

```
GET /api/v1/fulfillment/shipping-credits
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/shipping-credits" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a topup

```
POST /api/v1/fulfillment/shipping-credits/topup
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | integer | yes | min 10000; max 10000000 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/shipping-credits/topup" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"amount":10000}'
```

## List transactions

```
GET /api/v1/fulfillment/shipping-credits/transactions
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | any | no |  |
| `limit` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/shipping-credits/transactions" \
  -H "Authorization: Bearer sk_live_…"
```

## List couriers

```
GET /api/v1/fulfillment/shipping/couriers
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/shipping/couriers" \
  -H "Authorization: Bearer sk_live_…"
```

## List origin

```
GET /api/v1/fulfillment/shipping/origin
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/shipping/origin" \
  -H "Authorization: Bearer sk_live_…"
```

## Update origin

```
PATCH /api/v1/fulfillment/shipping/origin
```

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/fulfillment/shipping/origin" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a rate

```
POST /api/v1/fulfillment/shipping/rates
```

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/shipping/rates" \
  -H "Authorization: Bearer sk_live_…"
```

## Public buyer tracking lives on fulkruma.com — keep the route present so the chrome never 404s, but redirect callers to the canonical tracker.

```
GET /api/v1/fulfillment/shipping/track/{waybillId}
```

Public buyer tracking lives on fulkruma.com — keep the route present so
the chrome never 404s, but redirect callers to the canonical tracker.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `waybillId` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/shipping/track/:waybillId" \
  -H "Authorization: Bearer sk_live_…"
```

## List warehouses

```
GET /api/v1/fulfillment/warehouses
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/fulfillment/warehouses" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a warehous

```
POST /api/v1/fulfillment/warehouses
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 100 |
| `address` | string | no | max length 500; may be null |
| `city` | string | no | max length 100; may be null |
| `postal` | string | no | max length 20; may be null |
| `phone` | string | no | max length 30; may be null |
| `isDefault` | boolean | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/fulfillment/warehouses" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","address":"…","city":"…","postal":"…","phone":"…","isDefault":false}'
```

## Delete a warehous

```
DELETE /api/v1/fulfillment/warehouses/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/fulfillment/warehouses/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a warehous

```
PATCH /api/v1/fulfillment/warehouses/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 100 |
| `address` | string | no | max length 500; may be null |
| `city` | string | no | max length 100; may be null |
| `postal` | string | no | max length 20; may be null |
| `phone` | string | no | max length 30; may be null |
| `isDefault` | boolean | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/fulfillment/warehouses/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","address":"…","city":"…","postal":"…","phone":"…","isDefault":false}'
```
