# Changelog

## 0.3.0
- `verify_webhook(raw_body, signature, secret)` checks a delivery's `Malapos-Signature` over the raw body (5-minute tolerance) and returns the event; raises `MalaposError` with code `INVALID_SIGNATURE`. `EVENT_TYPES` lists the catalogue.
- `client.api`: the webhook delivery log — `webhook_subscriptions_deliveries(subscription_id=, status=, type_=, limit=, cursor=)`, `webhook_subscriptions_get_deliveries(id_)` (with every attempt), `webhook_subscriptions_deliveries_retry(id_)` — and `webhook_subscriptions_event_types()`. `webhook_subscriptions_update` also takes `url` and `events`.
- Deliveries are now retried (1 min, 5 min, 25 min, 2 h, 12 h) and recorded; the envelope carries `accountId`, and each delivery has `Malapos-Event-Id`, `-Event-Type`, `-Delivery-Id` and `-Delivery-Attempt` headers. Subscriptions take prefixes (`malapos.kds.*`).

## 0.2.0
- A route read by id next to its list is named `get` + the list's name: `client.api.account_get_blog_posts` (was `client.api.account_blog_posts_2`), `client.api.delivery_get_shipments` (was `client.api.delivery_shipments_2`), `client.api.fulfillment_get_deliveries` (was `client.api.fulfillment_deliveries_2`), `client.api.fulfillment_get_shipments` (was `client.api.fulfillment_shipments_2`), `client.api.marketing_get_discount_codes` (was `client.api.marketing_discount_codes_2`), `client.api.payments_get_checkout_sessions` (was `client.api.payments_checkout_sessions_2`), `client.api.payments_get_customers` (was `client.api.payments_customers_2`), `client.api.payments_get_invoices` (was `client.api.payments_invoices_2`), `client.api.payments_get_ledger_entries` (was `client.api.payments_ledger_entries_2`), `client.api.payments_get_payouts` (was `client.api.payments_payouts_2`), `client.api.payments_get_plans` (was `client.api.payments_plans_2`), `client.api.payments_get_receipts` (was `client.api.payments_receipts_2`), `client.api.payments_get_subscriptions` (was `client.api.payments_subscriptions_2`). Each old name stays as a deprecated alias.
- Query fields the API refuses a request without are now required: `outletId` on GET /api/v1/floors, `key` on GET /api/v1/fulfillment/licenses/validate, `outletId` on GET /api/v1/inventory/composites, `outletId` on GET /api/v1/shifts/current, `outletId` on GET /api/v1/tables, `outletId` on GET /api/v1/tables/floor.

## 0.1.0
- First release. `client.api`: every feature route of the Malapos API, one method each, generated from the API spec (`scripts/apigen.sh`); Bearer `sk_live_` key or Huudis token (`MALAPOS_TOKEN`); paging lists carry their cursor.
