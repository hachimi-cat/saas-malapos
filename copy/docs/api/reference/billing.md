---
title: Billing — reference
---

# Billing

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/billing` | [Current subscription (free default when no row) + effectiveTier (what enforcement honors: lapsed/canceled fall back to free) + the tier table.](#current-subscription-free-default-when-no-row-effectivetier-what-enforcement-honors-lapsedcanceled-fall-back-to-free-the-tier-table) |
| `POST` | `/api/v1/billing/cancel` | [Downgrade to Free.](#downgrade-to-free) |
| `POST` | `/api/v1/billing/checkout` | [POST /checkout {tier, currency?} — create a Plugipay hosted checkout session for a paid tier; the browser redirects to data.hostedUrl.](#post-checkout-tier-currency-create-a-plugipay-hosted-checkout-session-for-a-paid-tier-the-browser-redirects-to-datahostedurl) |
| `GET` | `/api/v1/billing/tiers` | [Public plan catalog.](#public-plan-catalog) |

## Current subscription (free default when no row) + effectiveTier (what enforcement honors: lapsed/canceled fall back to free) + the tier table.

```
GET /api/v1/billing
```

GET / — current subscription (free default when no row) +
 effectiveTier (what enforcement honors: lapsed/canceled fall back to
 free) + the tier table.

### Example

```bash
curl -X GET "https://malapos.com/api/v1/billing" \
  -H "Authorization: Bearer sk_live_…"
```

## Downgrade to Free.

```
POST /api/v1/billing/cancel
```

POST /cancel — downgrade to Free. No refunds and no auto-renew
 exist, so cancel = keep the paid period's entitlement, then lapse
 to free (effectiveTier handles the grace). Idempotent.

### Example

```bash
curl -X POST "https://malapos.com/api/v1/billing/cancel" \
  -H "Authorization: Bearer sk_live_…"
```

## POST /checkout {tier, currency?} — create a Plugipay hosted checkout session for a paid tier; the browser redirects to data.hostedUrl.

```
POST /api/v1/billing/checkout
```

POST /checkout {tier, currency?} — create a Plugipay hosted checkout
 session for a paid tier; the browser redirects to data.hostedUrl.
 `currency` is the buyer's saved preference (the billing page passes
 it so the charge matches the price they were shown); absent, the
 CF-IPCountry geo-route decides. IDR rides the local rails, USD
 settles through PayPal only — PayPal cannot settle IDR. The
 subscription itself is only written when the
 plugipay.checkout_session.completed.v1 webhook lands (the metadata
 carries {accountId, tier} and is currency-agnostic).

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `tier` | `free` or `starter` or `growth` or `business` | yes |  |
| `currency` | `IDR` or `USD` | no |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/billing/checkout" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"tier":"free","currency":"IDR"}'
```

## Public plan catalog.

```
GET /api/v1/billing/tiers
```

GET /tiers — public plan catalog. The /pricing page + the dashboard
 card read this so they never keep their own copy of the limits.

### Example

```bash
curl -X GET "https://malapos.com/api/v1/billing/tiers" \
  -H "Authorization: Bearer sk_live_…"
```
