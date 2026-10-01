# Changelog

## 0.3.0
- `VerifyWebhook(rawBody, signature, secret, opts)` checks a delivery's `Malapos-Signature` over the raw body (5-minute tolerance) and returns the `*WebhookEvent`; an `*Error` with Code `INVALID_SIGNATURE` otherwise. `SignatureHeader` and `EventTypes` (the catalogue).
- `client.API`: the webhook delivery log — `WebhookSubscriptionsDeliveries`, `WebhookSubscriptionsGetDeliveries` (with every attempt), `WebhookSubscriptionsDeliveriesRetry` — and `WebhookSubscriptionsEventTypes`. `WebhookSubscriptionsUpdate` also takes `URL` and `Events`.
- Deliveries are now retried (1 min, 5 min, 25 min, 2 h, 12 h) and recorded; the envelope carries `accountId`, and each delivery has `Malapos-Event-Id`, `-Event-Type`, `-Delivery-Id` and `-Delivery-Attempt` headers. Subscriptions take prefixes (`malapos.kds.*`).

## 0.2.0
- A route read by id next to its list is named `get` + the list's name: `client.API.AccountGetBlogPosts` (was `client.API.AccountBlogPosts2`), `client.API.DeliveryGetShipments` (was `client.API.DeliveryShipments2`), `client.API.FulfillmentGetDeliveries` (was `client.API.FulfillmentDeliveries2`), `client.API.FulfillmentGetShipments` (was `client.API.FulfillmentShipments2`), `client.API.MarketingGetDiscountCodes` (was `client.API.MarketingDiscountCodes2`), `client.API.PaymentsGetCheckoutSessions` (was `client.API.PaymentsCheckoutSessions2`), `client.API.PaymentsGetCustomers` (was `client.API.PaymentsCustomers2`), `client.API.PaymentsGetInvoices` (was `client.API.PaymentsInvoices2`), `client.API.PaymentsGetLedgerEntries` (was `client.API.PaymentsLedgerEntries2`), `client.API.PaymentsGetPayouts` (was `client.API.PaymentsPayouts2`), `client.API.PaymentsGetPlans` (was `client.API.PaymentsPlans2`), `client.API.PaymentsGetReceipts` (was `client.API.PaymentsReceipts2`), `client.API.PaymentsGetSubscriptions` (was `client.API.PaymentsSubscriptions2`). Each old name stays as a deprecated alias.
- Query fields the API refuses a request without are now required: `outletId` on GET /api/v1/floors, `key` on GET /api/v1/fulfillment/licenses/validate, `outletId` on GET /api/v1/inventory/composites, `outletId` on GET /api/v1/shifts/current, `outletId` on GET /api/v1/tables, `outletId` on GET /api/v1/tables/floor.

## 0.1.0
- First release. `client.API`: every feature route of the Malapos API, one method each, generated from the API spec (`scripts/apigen.sh`); Bearer `sk_live_` key or Huudis token; `Do` / `DoEnvelope` (paging meta).
