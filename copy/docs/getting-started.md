---
title: "Getting started"
---

# Getting started

The 5-minute path from "I just signed up" to your first sale on the
**Sell** screen.

## 1. Sign in

Auth is managed by Huudis — one account works across every Forjio
product. Go to [/login](/login) and sign in, or sign up at
[/signup](/signup). When you land in the dashboard you're inside a
**workspace** (your merchant account); everything below is scoped to it.

## 2. Set your business profile

Open **Settings**. Pick your **business type** — `Retail`, `F&B`,
`Pharmacy`, or `General` — and set your business name. The type tunes
the sell screen (barcode for retail, modifiers for F&B, batch/expiry
for pharmacy). Currency is IDR.

## 3. Create your first outlet

Open **Outlets** and add a store location: name, optional address and
phone, and a tax rate if you charge PPN/PB1 (entered as a percentage,
e.g. 11%). Each outlet keeps its own stock, shifts, and receipt
numbering. You need at least one outlet — the sell screen makes you
pick one.

## 4. Add products

Open **Products** and create a few items:

- Give each product a **name** and category (optional).
- Every product has at least one **variant** — the sold unit that
  carries **price** (IDR), and optionally cost, SKU, and barcode. A
  simple item has one variant; size/color items have several.
- Choose **Goods** (stock-tracked) or **Service** (no stock).
- **F&B:** create modifier groups (e.g. "Sugar level") under modifiers
  and attach them to products.
- **Pharmacy:** mark a product as batch-tracked so it sells FEFO.

If you track stock, set opening quantities under **Inventory** (stock
adjustment) or receive them via a purchase order under **Purchasing**.

## 5. Open a cashier shift

On the **Sell** screen, open a shift for your outlet and enter the
**opening cash float** (the cash already in the drawer). Sales ring up
against the open shift; at the end of the day you close it and count
the drawer — Malapos shows expected vs. counted cash (over/short).

## 6. Ring up a sale

Still on **Sell**:

1. Add items to the cart — scan a barcode, search by name/SKU, or tap a
   product. Pick modifiers for F&B items; adjust quantity and line
   discounts as needed.
2. Take payment — **cash**, **QRIS**, or **card**. For cash, enter the
   amount tendered and Malapos calculates the change. You can split
   across multiple payments.
3. Complete the sale. Stock is deducted, a receipt number is assigned,
   and (if a customer is attached) loyalty points are earned.

You can also **park** a bill to hold an open table or layaway and
complete it later.

## 7. See it in reports

Open **Reports** for the sales summary, top products, sales by day, and
low-stock list. Every sale also appears under **Sales** (filterable by
outlet, status, and shift), where you can open the full receipt or void
a transaction (which returns stock).

## What's next

- The [API reference](/docs/api-reference) — automate the same flow
  over REST.
- The [SDKs & CLI](/docs/sdk) — the `@forjio/malapos-cli` tool.
