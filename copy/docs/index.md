---
title: "Introduction"
---

# Malapos

Malapos is a point-of-sale (POS) system for Indonesian small and
medium businesses — retail counters, F&B outlets, and pharmacies. It
runs in the browser: open the **Sell** screen, ring up an order, take
cash, QRIS, or card, and Malapos keeps your catalog, stock, shifts,
and reports in sync behind it.

## Who it's for

- **Retail** — barcode lookup, product variants, stock tracking, and
  multi-outlet stores.
- **F&B** — item modifiers (sugar level, extra shot, add-ons), a
  dine-in floor with open table bills, a live kitchen display, plus
  takeaway and delivery orders.
- **Pharmacy** — dated stock batches with first-expiry-first-out (FEFO)
  selling and near-expiry alerts.

You pick a **business type** when you set up (`RETAIL`, `FNB`,
`PHARMACY`, or `GENERAL`); it tunes which sell-screen affordances show.

## Core capabilities

- **Sell screen** — cart, barcode/search lookup, line and order
  discounts, per-outlet tax (PPN / PB1), and split payments. Cash
  payments calculate change automatically. Payment methods: **cash,
  QRIS, card, and other** (bank transfer / voucher, recorded as a note).
- **Multi-outlet** — each outlet (store location) has its own stock,
  shifts, tax rate, and sequential receipt numbers. Stock can be
  transferred between outlets.
- **Catalog** — products with one or more **variants** (the sold SKU,
  carrying price, cost, SKU, and barcode), organized into categories.
  Products can be goods (stock-tracked) or services (no stock).
- **F&B modifiers** — modifier groups with selection bounds attach to
  products; chosen modifiers add surcharges to the line.
- **Inventory** — a denormalized on-hand level per outlet/variant
  backed by an append-only **stock movement ledger** (sales, returns,
  adjustments, receipts, transfers, waste). Reorder points drive
  low-stock alerts. Pharmacy adds **dated batches** sold FEFO with
  expiring-soon reporting.
- **Cashier shifts** — a cashier opens a shift with a cash float, rings
  sales against it, then closes with a counted-cash reconciliation
  (expected vs. counted, over/short).
- **Suppliers & purchasing** — suppliers plus **purchase orders** that
  move draft → ordered → received; receiving a PO stocks the goods in
  (with batch/expiry for pharmacy).
- **Customers & loyalty** — a walk-in customer directory with lifetime
  spend, visit count, and a points ledger (earn on sale, redeem at
  checkout).
- **Reports** — sales summary, top products, sales by day, and a
  low-stock report.
- **Order types & kitchen** — ring up a **counter** sale, seat a
  **dine-in** table on the floor map (layout or list view), or take a
  **takeaway** or **delivery**. F&B orders flow to a **kitchen display**
  (KDS, item-by-item) and a ready-to-serve expo board; each ticket is
  badged dine-in / takeaway / delivery.
- **Composite items** — a product can be a recipe whose components
  deduct from stock when it sells.
- **Gift cards & refunds** — gift cards and store credit work as a
  tender at the till; sales support full and partial refunds.
- **Add-on modules** — opt-in partner integrations toggled from
  Settings: **Payments** (live dynamic QRIS via Plugipay), **Marketing**
  (discount codes, loyalty & campaigns via Ripllo), and **Fulfillment**
  (book couriers for delivery via Fulkruma).
- **Developer** — `sk_live_…` API keys and webhooks for `malapos.*`
  events. See the [API reference](/docs/api-reference).

## How the docs are organized

- **[Getting started](/docs/getting-started)** — the 5-minute path from
  sign-in to your first sale.
- **[API reference](/docs/api-reference)** — the REST API: auth, the
  response envelope, pagination, error codes, and the resource
  endpoints.
- **[SDKs & CLI](/docs/sdk)** — the `@forjio/malapos-cli` command-line
  tool and programmatic access over REST.

## The Forjio family

Malapos shares one identity layer (Huudis) and one billing spine
(Plugipay) with the rest of the Forjio family. One account works
everywhere — see the product switcher at the top of these docs.
