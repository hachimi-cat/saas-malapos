---
title: Payments — reference
---

# Payments

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/payments/checkout-sessions` | [List checkout sessions](#list-checkout-sessions) |
| `POST` | `/api/v1/payments/checkout-sessions` | [Create a checkout session](#create-a-checkout-session) |
| `GET` | `/api/v1/payments/checkout-sessions/{id}` | [Get a checkout session](#get-a-checkout-session) |
| `POST` | `/api/v1/payments/checkout-sessions/{id}/confirm` | [Manual-adapter confirm — flips a pending_review session to completed.](#manual-adapter-confirm-flips-a-pendingreview-session-to-completed) |
| `GET` | `/api/v1/payments/customers` | [List customers](#list-customers) |
| `POST` | `/api/v1/payments/customers` | [Create a customer](#create-a-customer) |
| `GET` | `/api/v1/payments/customers/{id}` | [Get a customer](#get-a-customer) |
| `PATCH` | `/api/v1/payments/customers/{id}` | [Update a customer](#update-a-customer) |
| `GET` | `/api/v1/payments/invoices` | [List invoices](#list-invoices) |
| `GET` | `/api/v1/payments/invoices/{id}` | [Get an invoice](#get-an-invoice) |
| `GET` | `/api/v1/payments/invoices/{id}/html` | [List html](#list-html) |
| `GET` | `/api/v1/payments/invoices/{id}/pdf` | [PDF / HTML preview — streamed straight from Plugipay's hosted endpoints.](#pdf-html-preview-streamed-straight-from-plugipays-hosted-endpoints) |
| `GET` | `/api/v1/payments/invoices/export.csv` | [CSV export — up to 10k rows via paginated SDK fetch.](#csv-export-up-to-10k-rows-via-paginated-sdk-fetch) |
| `GET` | `/api/v1/payments/ledger/balance` | [List balance](#list-balance) |
| `GET` | `/api/v1/payments/ledger/entries` | [List entries](#list-entries) |
| `GET` | `/api/v1/payments/ledger/entries.csv` | [CSV export — up to 10k rows.](#csv-export-up-to-10k-rows) |
| `GET` | `/api/v1/payments/ledger/entries/{id}` | [Get an entry](#get-an-entry) |
| `GET` | `/api/v1/payments/overview` | [A workspace payments dashboard via the merchant client: available balance, recent QRIS checkout sessions, and recent payouts.](#a-workspace-payments-dashboard-via-the-merchant-client-available-balance-recent-qris-checkout-sessions-and-recent-payouts) |
| `GET` | `/api/v1/payments/payouts` | [List payouts](#list-payouts) |
| `POST` | `/api/v1/payments/payouts` | [Create a payout](#create-a-payout) |
| `GET` | `/api/v1/payments/payouts/{id}` | [Get a payout](#get-a-payout) |
| `POST` | `/api/v1/payments/payouts/{id}/cancel` | [Cancel a payout](#cancel-a-payout) |
| `POST` | `/api/v1/payments/payouts/{id}/mark-failed` | [Mark failed a payout](#mark-failed-a-payout) |
| `POST` | `/api/v1/payments/payouts/{id}/mark-in-transit` | [Mark in transit a payout](#mark-in-transit-a-payout) |
| `POST` | `/api/v1/payments/payouts/{id}/mark-paid` | [Mark paid a payout](#mark-paid-a-payout) |
| `GET` | `/api/v1/payments/payouts/balance` | [List balance](#list-balance-2) |
| `GET` | `/api/v1/payments/payouts/bank-account` | [List bank account](#list-bank-account) |
| `PATCH` | `/api/v1/payments/payouts/bank-account` | [Update bank account](#update-bank-account) |
| `GET` | `/api/v1/payments/plans` | [List plans](#list-plans) |
| `POST` | `/api/v1/payments/plans` | [Create a plan](#create-a-plan) |
| `DELETE` | `/api/v1/payments/plans/{id}` | [Delete a plan](#delete-a-plan) |
| `GET` | `/api/v1/payments/plans/{id}` | [Get a plan](#get-a-plan) |
| `PATCH` | `/api/v1/payments/plans/{id}` | [Update a plan](#update-a-plan) |
| `POST` | `/api/v1/payments/plans/{id}/prices` | [Add a new price (currency variant) to an existing plan.](#add-a-new-price-currency-variant-to-an-existing-plan) |
| `PATCH` | `/api/v1/payments/plans/prices/{priceId}` | [Archive/unarchive an individual price.](#archiveunarchive-an-individual-price) |
| `POST` | `/api/v1/payments/plugipay-settings/templates/preview` | [Template preview returns raw HTML (not envelope JSON) — route through the raw-passthrough helper so the catch-all below doesn't JSON-parse it.](#template-preview-returns-raw-html-not-envelope-json-route-through-the-raw-passthrough-helper-so-the-catch-all-below-doesnt-json-parse-it) |
| `POST` | `/api/v1/payments/qris` | [Mint a dynamic-QRIS checkout session.](#mint-a-dynamic-qris-checkout-session) |
| `GET` | `/api/v1/payments/qris/{sessionId}` | [Poll the session status so the sell screen can wait for the customer's scan to confirm.](#poll-the-session-status-so-the-sell-screen-can-wait-for-the-customers-scan-to-confirm) |
| `GET` | `/api/v1/payments/receipts` | [List receipts](#list-receipts) |
| `GET` | `/api/v1/payments/receipts/{id}` | [Get a receipt](#get-a-receipt) |
| `POST` | `/api/v1/payments/receipts/{id}/email` | [Email a receipt to the customer.](#email-a-receipt-to-the-customer) |
| `GET` | `/api/v1/payments/receipts/{id}/escpos` | [List escpos](#list-escpos) |
| `GET` | `/api/v1/payments/receipts/{id}/html` | [List html](#list-html-2) |
| `GET` | `/api/v1/payments/receipts/{id}/pdf` | [Binary passthroughs — PDF, HTML, ESC/POS thermal.](#binary-passthroughs-pdf-html-escpos-thermal) |
| `GET` | `/api/v1/payments/reports/cash-flow` | [List cash flow](#list-cash-flow) |
| `GET` | `/api/v1/payments/reports/pnl` | [List pnl](#list-pnl) |
| `GET` | `/api/v1/payments/subscriptions` | [List subscriptions](#list-subscriptions) |
| `POST` | `/api/v1/payments/subscriptions` | [Create a subscription](#create-a-subscription) |
| `DELETE` | `/api/v1/payments/subscriptions/{id}` | [Delete a subscription](#delete-a-subscription) |
| `GET` | `/api/v1/payments/subscriptions/{id}` | [Get a subscription](#get-a-subscription) |
| `PATCH` | `/api/v1/payments/subscriptions/{id}` | [Update a subscription](#update-a-subscription) |

## List checkout sessions

```
GET /api/v1/payments/checkout-sessions
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | min 1; max 100 |
| `status` | string | no |  |
| `customerId` | string | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/checkout-sessions" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a checkout session

```
POST /api/v1/payments/checkout-sessions
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | integer | yes | above 0 |
| `currency` | `IDR` or `USD` | no | default `"IDR"` |
| `paymentMethods` | array of string | no |  |
| `successUrl` | string (uri) | yes |  |
| `cancelUrl` | string (uri) | yes |  |
| `customerId` | string | no | may be null |
| `expiresInMinutes` | integer | no | above 0 |
| `metadata` | object | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/checkout-sessions" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"amount":0,"currency":"IDR","paymentMethods":[],"successUrl":"…","cancelUrl":"…","customerId":"…","expiresInMinutes":0,"metadata":{}}'
```

## Get a checkout session

```
GET /api/v1/payments/checkout-sessions/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/checkout-sessions/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Manual-adapter confirm — flips a pending_review session to completed.

```
POST /api/v1/payments/checkout-sessions/{id}/confirm
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/checkout-sessions/:id/confirm" \
  -H "Authorization: Bearer sk_live_…"
```

## List customers

```
GET /api/v1/payments/customers
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | min 1; max 100 |
| `cursor` | string | no |  |
| `email` | string | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/customers" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a customer

```
POST /api/v1/payments/customers
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | yes |  |
| `name` | string | no | max length 200; may be null |
| `metadata` | object | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/customers" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"email":"…","name":"…","metadata":{}}'
```

## Get a customer

```
GET /api/v1/payments/customers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/customers/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a customer

```
PATCH /api/v1/payments/customers/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | no |  |
| `name` | string | no | max length 200; may be null |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/payments/customers/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"email":"…","name":"…"}'
```

## List invoices

```
GET /api/v1/payments/invoices
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | min 1; max 100 |
| `cursor` | string | no |  |
| `status` | string | no |  |
| `customerId` | string | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/invoices" \
  -H "Authorization: Bearer sk_live_…"
```

## Get an invoice

```
GET /api/v1/payments/invoices/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/invoices/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## List html

```
GET /api/v1/payments/invoices/{id}/html
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/invoices/:id/html" \
  -H "Authorization: Bearer sk_live_…"
```

## PDF / HTML preview — streamed straight from Plugipay's hosted endpoints.

```
GET /api/v1/payments/invoices/{id}/pdf
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/invoices/:id/pdf" \
  -H "Authorization: Bearer sk_live_…"
```

## CSV export — up to 10k rows via paginated SDK fetch.

```
GET /api/v1/payments/invoices/export.csv
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/invoices/export.csv" \
  -H "Authorization: Bearer sk_live_…"
```

## List balance

```
GET /api/v1/payments/ledger/balance
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/ledger/balance" \
  -H "Authorization: Bearer sk_live_…"
```

## List entries

```
GET /api/v1/payments/ledger/entries
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `code` | any | no |  |
| `cursor` | any | no |  |
| `limit` | any | no |  |
| `sourceId` | any | no |  |
| `sourceType` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/ledger/entries" \
  -H "Authorization: Bearer sk_live_…"
```

## CSV export — up to 10k rows.

```
GET /api/v1/payments/ledger/entries.csv
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/ledger/entries.csv" \
  -H "Authorization: Bearer sk_live_…"
```

## Get an entry

```
GET /api/v1/payments/ledger/entries/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/ledger/entries/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## A workspace payments dashboard via the merchant client: available balance, recent QRIS checkout sessions, and recent payouts.

```
GET /api/v1/payments/overview
```

GET /overview — a workspace payments dashboard via the merchant client:
available balance, recent QRIS checkout sessions, and recent payouts.
Each piece is best-effort (a workspace with no provider configured may
404/empty individual calls) but the gate itself (409) short-circuits
when the module is off.

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/overview" \
  -H "Authorization: Bearer sk_live_…"
```

## List payouts

```
GET /api/v1/payments/payouts
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | any | no |  |
| `limit` | any | no |  |
| `status` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/payouts" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a payout

```
POST /api/v1/payments/payouts
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | integer | yes | above 0 |
| `currency` | `IDR` or `USD` | no | default `"IDR"` |
| `bankCode` | string | no | max length 32; may be null |
| `bankName` | string | no | max length 100 |
| `bankAccountNumber` | string | no | max length 50 |
| `bankAccountHolder` | string | no | max length 100 |
| `note` | string | no | max length 500; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/payouts" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"amount":0,"currency":"IDR","bankCode":"…","bankName":"…","bankAccountNumber":"…","bankAccountHolder":"…","note":"…"}'
```

## Get a payout

```
GET /api/v1/payments/payouts/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/payouts/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Cancel a payout

```
POST /api/v1/payments/payouts/{id}/cancel
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/payouts/:id/cancel" \
  -H "Authorization: Bearer sk_live_…"
```

## Mark failed a payout

```
POST /api/v1/payments/payouts/{id}/mark-failed
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `failureReason` | string | yes | min length 1; max length 500 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/payouts/:id/mark-failed" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"failureReason":"…"}'
```

## Mark in transit a payout

```
POST /api/v1/payments/payouts/{id}/mark-in-transit
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `reference` | string | no | max length 200; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/payouts/:id/mark-in-transit" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"reference":"…"}'
```

## Mark paid a payout

```
POST /api/v1/payments/payouts/{id}/mark-paid
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `reference` | string | no | max length 200; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/payouts/:id/mark-paid" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"reference":"…"}'
```

## List balance

```
GET /api/v1/payments/payouts/balance
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/payouts/balance" \
  -H "Authorization: Bearer sk_live_…"
```

## List bank account

```
GET /api/v1/payments/payouts/bank-account
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/payouts/bank-account" \
  -H "Authorization: Bearer sk_live_…"
```

## Update bank account

```
PATCH /api/v1/payments/payouts/bank-account
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `bankCode` | string | no | max length 32; may be null |
| `bankName` | string | yes | min length 1; max length 100 |
| `bankAccountNumber` | string | yes | min length 1; max length 50 |
| `bankAccountHolder` | string | yes | min length 1; max length 100 |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/payments/payouts/bank-account" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"bankCode":"…","bankName":"…","bankAccountNumber":"…","bankAccountHolder":"…"}'
```

## List plans

```
GET /api/v1/payments/plans
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | min 1; max 100 |
| `cursor` | string | no |  |
| `active` | `true` or `false` or boolean | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/plans" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a plan

```
POST /api/v1/payments/plans
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 200 |
| `amount` | integer | yes | min 0 |
| `currency` | `IDR` or `USD` | no | default `"IDR"` |
| `interval` | string | no | default `"monthly"` |
| `trialDays` | integer | no | min 0 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/plans" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","amount":0,"currency":"IDR","interval":"monthly","trialDays":0}'
```

## Delete a plan

```
DELETE /api/v1/payments/plans/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/payments/plans/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a plan

```
GET /api/v1/payments/plans/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/plans/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a plan

```
PATCH /api/v1/payments/plans/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 200 |
| `description` | string | no | max length 1000 |
| `active` | boolean | no |  |
| `metadata` | object | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/payments/plans/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","description":"…","active":false,"metadata":{}}'
```

## Add a new price (currency variant) to an existing plan.

```
POST /api/v1/payments/plans/{id}/prices
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/plans/:id/prices" \
  -H "Authorization: Bearer sk_live_…"
```

## Archive/unarchive an individual price.

```
PATCH /api/v1/payments/plans/prices/{priceId}
```

Archive/unarchive an individual price. PATCH on the price, not the plan.
No SDK method for this, so proxy raw to Plugipay's /prices/:id.
Registered BEFORE `PATCH /:id`: Express matches in order, so with the
generic route first a PATCH to /plans/prices/<x> bound `id='prices'`
and never reached this handler.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `priceId` | string | yes |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/payments/plans/prices/:priceId" \
  -H "Authorization: Bearer sk_live_…"
```

## Template preview returns raw HTML (not envelope JSON) — route through the raw-passthrough helper so the catch-all below doesn't JSON-parse it.

```
POST /api/v1/payments/plugipay-settings/templates/preview
```

Template preview returns raw HTML (not envelope JSON) — route through
the raw-passthrough helper so the catch-all below doesn't JSON-parse it.

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/plugipay-settings/templates/preview" \
  -H "Authorization: Bearer sk_live_…"
```

## Mint a dynamic-QRIS checkout session.

```
POST /api/v1/payments/qris
```

POST /qris — mint a dynamic-QRIS checkout session.
For a transactionId: the sale must be PARKED in this workspace with a
PENDING QRIS payment; the minted session amount is that payment's
amount, and the session id is stamped onto the payment so the webhook
settles the right sale. For an ad-hoc amount: a standalone session,
not tied to a sale (the cashier reconciles manually).

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `transactionId` | string | no |  |
| `amount` | integer | no | above 0 |
| `method` | `qris` or `va` | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/qris" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"…","amount":0,"method":"qris"}'
```

## Poll the session status so the sell screen can wait for the customer's scan to confirm.

```
GET /api/v1/payments/qris/{sessionId}
```

GET /qris/:sessionId — poll the session status so the sell screen can
 wait for the customer's scan to confirm.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `sessionId` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/qris/:sessionId" \
  -H "Authorization: Bearer sk_live_…"
```

## List receipts

```
GET /api/v1/payments/receipts
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | any | no |  |
| `customerId` | any | no |  |
| `limit` | any | no |  |
| `sourceType` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/receipts" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a receipt

```
GET /api/v1/payments/receipts/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/receipts/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Email a receipt to the customer.

```
POST /api/v1/payments/receipts/{id}/email
```

Email a receipt to the customer. `to` optional — falls back to the
receipt's customer email on the Plugipay side.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | any | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/receipts/:id/email" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"to":null}'
```

## List escpos

```
GET /api/v1/payments/receipts/{id}/escpos
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `width` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/receipts/:id/escpos" \
  -H "Authorization: Bearer sk_live_…"
```

## List html

```
GET /api/v1/payments/receipts/{id}/html
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/receipts/:id/html" \
  -H "Authorization: Bearer sk_live_…"
```

## Binary passthroughs — PDF, HTML, ESC/POS thermal.

```
GET /api/v1/payments/receipts/{id}/pdf
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/receipts/:id/pdf" \
  -H "Authorization: Bearer sk_live_…"
```

## List cash flow

```
GET /api/v1/payments/reports/cash-flow
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/reports/cash-flow" \
  -H "Authorization: Bearer sk_live_…"
```

## List pnl

```
GET /api/v1/payments/reports/pnl
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/reports/pnl" \
  -H "Authorization: Bearer sk_live_…"
```

## List subscriptions

```
GET /api/v1/payments/subscriptions
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | min 1; max 100 |
| `status` | string | no |  |
| `customerId` | string | no |  |
| `planId` | string | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/subscriptions" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a subscription

```
POST /api/v1/payments/subscriptions
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `customerId` | string | yes | min length 1 |
| `planId` | string | yes | min length 1 |
| `priceId` | string | no | min length 1 |
| `trialEnd` | string (date-time) | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/payments/subscriptions" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"…","planId":"…","priceId":"…","trialEnd":"2026-01-01T00:00:00Z"}'
```

## Delete a subscription

```
DELETE /api/v1/payments/subscriptions/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `immediate` | any | no |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/payments/subscriptions/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a subscription

```
GET /api/v1/payments/subscriptions/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/payments/subscriptions/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a subscription

```
PATCH /api/v1/payments/subscriptions/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | `active` or `paused` | no |  |
| `action` | `pause` or `resume` | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/payments/subscriptions/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"status":"active","action":"pause"}'
```
