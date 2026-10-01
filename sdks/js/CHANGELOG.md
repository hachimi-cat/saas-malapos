# Changelog

## Unreleased
- `verifyWebhook({ rawBody, signature, secret })` checks a delivery's `Malapos-Signature` over the raw body (5-minute tolerance) and returns the event; throws `MalaposError` with code `INVALID_SIGNATURE`. Exports the `MalaposEventType` catalogue and `MalaposWebhookEvent`.
- `client.api`: the webhook delivery log — `webhookSubscriptionsDeliveries({ subscriptionId?, status?, type?, limit?, cursor? })`, `webhookSubscriptionsGetDeliveries(id)` (with every attempt), `webhookSubscriptionsDeliveriesRetry(id)` — and `webhookSubscriptionsEventTypes()`. `webhookSubscriptionsUpdate(id, …)` also takes `url` and `events`.
- Deliveries are now retried (1 min, 5 min, 25 min, 2 h, 12 h) and recorded; the envelope carries `accountId`, and each delivery has `Malapos-Event-Id`, `-Event-Type`, `-Delivery-Id` and `-Delivery-Attempt` headers. Subscriptions take prefixes (`malapos.kds.*`).

## 0.2.0
- A route read by id next to its list is named `get` + the list's name: `client.api.accountGetBlogPosts` (was `client.api.accountBlogPosts2`), `client.api.deliveryGetShipments` (was `client.api.deliveryShipments2`), `client.api.fulfillmentGetDeliveries` (was `client.api.fulfillmentDeliveries2`), `client.api.fulfillmentGetShipments` (was `client.api.fulfillmentShipments2`), `client.api.marketingGetDiscountCodes` (was `client.api.marketingDiscountCodes2`), `client.api.paymentsGetCheckoutSessions` (was `client.api.paymentsCheckoutSessions2`), `client.api.paymentsGetCustomers` (was `client.api.paymentsCustomers2`), `client.api.paymentsGetInvoices` (was `client.api.paymentsInvoices2`), `client.api.paymentsGetLedgerEntries` (was `client.api.paymentsLedgerEntries2`), `client.api.paymentsGetPayouts` (was `client.api.paymentsPayouts2`), `client.api.paymentsGetPlans` (was `client.api.paymentsPlans2`), `client.api.paymentsGetReceipts` (was `client.api.paymentsReceipts2`), `client.api.paymentsGetSubscriptions` (was `client.api.paymentsSubscriptions2`). Each old name stays as a deprecated alias.
- Query fields the API refuses a request without are now required: `outletId` on GET /api/v1/floors, `key` on GET /api/v1/fulfillment/licenses/validate, `outletId` on GET /api/v1/inventory/composites, `outletId` on GET /api/v1/shifts/current, `outletId` on GET /api/v1/tables, `outletId` on GET /api/v1/tables/floor.

## 0.1.0
- First release. `client.api`: every feature route of the Malapos API, one method each, generated from the API spec (`scripts/apigen.sh`); Bearer `sk_live_` key or Huudis token (`MALAPOS_TOKEN`); paging lists carry their cursor.
