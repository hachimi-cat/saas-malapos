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
pick one. Free and Starter include a single outlet; more outlets (and
stock transfers between them) are Growth and up.

## 4. Add products

Open **Products** and create a few items:

- Give each product a **name** and category (optional).
- Every product has at least one **variant** — the sold unit that
  carries **price** (IDR), and optionally cost, SKU, and barcode. A
  simple item has one variant; size/color items have several.
- Choose **Goods** (stock-tracked) or **Service** (no stock).
- **F&B:** create modifier groups (e.g. "Sugar level") under modifiers
  and attach them to products.
- **Pharmacy:** mark a product as batch-tracked so it sells FEFO
  (Growth and up).

If you track stock (Starter and up), set opening quantities under
**Inventory** (stock adjustment) or receive them via a purchase order
under **Purchasing** (Growth and up).

## 5. Open a cashier shift (Starter and up)

On the **Sell** screen, open a shift for your outlet and enter the
**opening cash float** (the cash already in the drawer). Sales ring up
against the open shift; at the end of the day you close it and count
the drawer — Malapos shows expected vs. counted cash (over/short).
Shifts come with the Starter plan; on Free, skip this step — a sale
doesn't need an open shift.

## 6. Ring up a sale

Still on **Sell**:

1. Add items to the cart — scan a barcode, search by name/SKU, or tap a
   product. Pick modifiers for F&B items; adjust quantity and line
   discounts as needed.
2. Take payment — **cash**, **QRIS**, **virtual account (VA)**,
   **card**, **bank transfer**, **gift card**, or **other**. For cash,
   enter the amount tendered and Malapos calculates the change; for
   bank transfer, the customer sees the store account details you
   saved in Settings. You can split a bill across multiple payments —
   keep adding tenders until the total is covered.
3. Complete the sale. Stock is deducted, a receipt number is assigned,
   and (if a customer is attached) loyalty points are earned (Starter
   and up).

You can also **park** a bill to hold an open table or layaway and
complete it later.

## 7. See it in reports

Open **Reports** for the sales summary, top products, sales by day, and
low-stock list (Free includes the daily sales summary; the full report
set and the low-stock list are Starter and up). Every sale also appears
under **Sales** (filterable by outlet, status, and shift), where you can
open the full receipt, void a transaction (which returns stock), or
issue a full or partial **refund** — optionally restocking the returned
goods, or refunding to the customer's store credit instead of the
original tender.

## Running F&B: tables, kitchen, serve

Everything above still applies — F&B layers dine-in service on top of
the same catalog, sell screen, and reports.

1. **Switch the business type.** In **Settings**, set the business
   type to `F&B`. The sell screen picks up modifiers and the order
   types — counter, dine-in, takeaway, delivery.
2. **Build the floor map.** Open **Tables**
   ([/dashboard/tables](/dashboard/tables)) and create your floors and
   tables. Each floor (Ground Floor, Rooftop, …) is its own layout
   canvas; view it as a map or a list.
3. **Seat tables and hold bills.** Ring up on **Sell** and seat the
   order at a table — the bill stays parked (open) while the table
   eats. Reopen it from the sell screen to add rounds or edit items,
   then settle it at the end; a table splitting the bill can pay in
   several partial payments until the total is covered.
4. **Watch the kitchen.** Tickets flow to the **Kitchen display**
   ([/dashboard/kds](/dashboard/kds)), where the kitchen advances each
   item New → Preparing → Ready. The **Serve display**
   ([/dashboard/serve](/dashboard/serve)) is the expo board: mark
   ready items served (or serve a whole table at once) until the
   order clears.

## What's next

- The [API reference](/docs/api-reference) — automate the same flow
  over REST.
- The [SDKs & CLI](/docs/sdk) — the `@forjio/malapos-cli` tool.
