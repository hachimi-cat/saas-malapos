import type { CrudResource, CrudSchemaField } from '@forjio/agent-ui';
import { api } from '@/lib/api';
import { discountCodesApi, referralsApi } from '@/lib/marketing-api';
import type { Fields, ResourceBuilder } from '../resource-helpers';
import { buildAgentPrompt, bool, defined, num, numOrNull, str } from '../resource-helpers';

/**
 * The "books" group — money and stock in motion. Every resource here is
 * `approvalRequired: true` in backend/src/lib/catentio-profile.ts: the
 * agent works the whole thing out and PROPOSES it on a card; the apply
 * below runs under the MERCHANT's own session, so approving the card is
 * the merchant moving the money or the stock. The sheet's Manual tab is
 * the same thing without the agent — the merchant filling in the exact
 * fields and applying directly, which is precisely the intended review
 * path. Nothing extra to enforce here; the auth gate does that.
 *
 * Field names mirror the profile's keys per resource — the plan
 * sanitizer drops anything else, so a field that is not in the profile
 * cannot appear here either. Where a hand-built dialog and the profile
 * disagree, the profile wins and the difference is noted at the
 * descriptor:
 *
 *  - refunds: the RefundPanel (sales/[id]) never sends
 *    `refundToStoreCredit`; the profile and POST /sales/{id}/refund
 *    both carry it, so the sheet offers it.
 *  - gift-cards: the IssueModal has no customer picker; the profile and
 *    POST /gift-cards accept `customerId`, so the sheet offers it.
 *  - inventory-transfers / stock-batches: the inventory page has no
 *    transfer or batch-add form at all (the batches section is
 *    read-only "expiring soon"); these mirror the backend routes
 *    (routes/inventory.ts POST /transfer, POST /batches) directly.
 *  - discount-codes: the EditorModal also shows `currency` and a
 *    campaign picker; the profile declares neither (the route defaults
 *    currency to IDR and its zod strips marketingCampaignId), so
 *    neither is rendered here.
 */

// ── local helpers (chat-actions.ts / storlaunch resources.ts style) ──

/** Kinds the package does not know about — 'date'. agentic-sheet.tsx
 *  registers the host renderer (`<input type="date">`, yyyy-mm-dd), and
 *  the package degrades any unknown kind to a text input, so widening
 *  the descriptor type is safe. */
const customKind = (kind: string) => kind as CrudSchemaField['kind'];

/** '' → null for the nullable text columns, mirroring the hand-built
 *  forms' `value.trim() || null`. Callers guard with `!== undefined`
 *  so an untouched field stays absent (sparse edit). */
function textOrNull(v: unknown): string | null {
  return str(v) ?? null;
}

/** Multi-value fields: the combobox hands back an array, a plan (or a
 *  pasted value) may be a comma string. Empty in, undefined out. */
function strArr(v: unknown): string[] | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const arr = v.map((x) => String(x).trim()).filter(Boolean);
    return arr.length ? arr : undefined;
  }
  const s = String(v).trim();
  if (!s) return undefined;
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** The record id for an edit — the sheet passes the row the USER picked
 *  in `initial`; the apply writes THAT record, never one named inside
 *  `fields`. */
function requireId(initial: Partial<Fields> | undefined, what: string): string {
  const id = str(initial?.id);
  if (!id) throw new Error(`Missing ${what} id`);
  return id;
}

/** Repeater rows as plain objects; anything else is an empty list. */
function rowsOf(v: unknown): Fields[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).filter((r): r is Fields => typeof r === 'object' && r !== null);
}

/** The discount-code date inputs are yyyy-mm-dd; the wire wants a full
 *  ISO instant (the route's zod is `z.string().datetime()`). Mirror the
 *  EditorModal exactly: starts at midnight UTC, expires at end of day
 *  UTC. A full instant from a plan passes through normalised; '' clears
 *  (callers guard with `!== undefined`). */
function isoDay(v: unknown, edge: 'start' | 'end'): string | null {
  const s = str(v);
  if (!s) return null;
  if (s.length > 10) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }
  return new Date(`${s}T${edge === 'start' ? '00:00:00' : '23:59:59'}Z`).toISOString();
}

// ── option loaders ──────────────────────────────────────────────────

/** Every loader is scoped to the merchant's own workspace, so the list
 *  is also the only set of ids that can succeed. A fetch failure leaves
 *  an empty list rather than blocking the sheet. */
async function loadOptions<T>(
  fetcher: () => Promise<T[]>,
  toOption: (row: T) => { value: string; label: string },
): Promise<{ value: string; label: string }[]> {
  try {
    return (await fetcher()).map(toOption);
  } catch {
    return [];
  }
}

const loadOutletOptions = () =>
  loadOptions(
    async () => {
      const res = await api.get<{ outlets?: { id: string; name: string }[] }>('/outlets');
      return res.data?.outlets ?? [];
    },
    (o) => ({ value: o.id, label: o.name }),
  );

const loadSupplierOptions = () =>
  loadOptions(
    async () => {
      const res = await api.get<{ suppliers?: { id: string; name: string; isActive: boolean }[] }>(
        '/suppliers',
      );
      // The POBuilderModal only offers active suppliers.
      return (res.data?.suppliers ?? []).filter((s) => s.isActive);
    },
    (s) => ({ value: s.id, label: s.name }),
  );

/** Stock is tracked per VARIANT, not per product — the POBuilderModal
 *  picks a product then one of its variants; a single searchable select
 *  is the sheet's closest mirror. A Default-only product reads as just
 *  the product name, so searching the product name always matches. */
const loadVariantOptions = () =>
  loadOptions(
    async () => {
      const res = await api.get<{
        products?: { id: string; name: string; variants: { id: string; name: string }[] }[];
      }>('/products?active=true');
      return (res.data?.products ?? []).flatMap((p) =>
        (p.variants ?? []).map((v) => ({
          id: v.id,
          label: v.name && v.name !== 'Default' ? `${p.name} — ${v.name}` : p.name,
        })),
      );
    },
    (v) => ({ value: v.id, label: v.label }),
  );

const loadCustomerOptions = () =>
  loadOptions(
    async () => {
      const res = await api.get<
        { items?: { id: string; name: string; phone: string | null }[] } | { id: string; name: string; phone: string | null }[]
      >('/customers');
      const data = res.data;
      return Array.isArray(data) ? data : (data?.items ?? []);
    },
    (c) => ({ value: c.id, label: c.phone ? `${c.name} — ${c.phone}` : c.name }),
  );

/** Only ORDERED / PARTIAL orders can be received — the purchasing page
 *  shows the Receive button on exactly those rows, and the route answers
 *  CONFLICT for anything else. Filtering here means the merchant never
 *  picks one that cannot work. */
const loadReceivablePoOptions = () =>
  loadOptions(
    async () => {
      const res = await api.get<
        { items?: { id: string; number: string; status: string }[] } | { id: string; number: string; status: string }[]
      >('/purchase-orders');
      const data = res.data;
      const rows = Array.isArray(data) ? data : (data?.items ?? []);
      return rows.filter((po) => po.status === 'ORDERED' || po.status === 'PARTIAL');
    },
    (po) => ({
      value: po.id,
      label: `${po.number} · ${po.status.charAt(0)}${po.status.slice(1).toLowerCase()}`,
    }),
  );

// ── purchase orders ─────────────────────────────────────────────────

/** PO lines from the repeater (or a plan's items array) → the wire
 *  shape POST/PATCH /purchase-orders wants. Rows without a variant or a
 *  positive quantity are dropped, exactly like the POBuilderModal's
 *  `lines.filter((l) => l.variantId && l.quantity > 0)`. */
function poLines(v: unknown): Record<string, unknown>[] {
  return rowsOf(v)
    .map((r) =>
      defined({
        variantId: str(r.variantId),
        quantity: num(r.quantity),
        cost: num(r.cost) ?? 0,
        batchNo: str(r.batchNo),
        expiryDate: str(r.expiryDate),
      }),
    )
    .filter((r) => r.variantId !== undefined && typeof r.quantity === 'number' && r.quantity > 0);
}

function purchaseOrdersResource(mode: 'create' | 'edit'): CrudResource<Fields> {
  return {
    slug: 'purchase-orders',
    label: 'purchase order',
    fields: [
      ...(mode === 'create'
        ? [
            {
              name: 'outletId',
              label: 'Outlet',
              kind: 'select',
              required: true,
              group: 'head',
              loadOptions: loadOutletOptions,
              placeholder: '— pick an outlet —',
              description: 'The outlet the stock is being ordered for.',
            } satisfies CrudSchemaField,
          ]
        : []),
      {
        name: 'supplierId',
        label: 'Supplier',
        kind: 'select',
        group: 'head',
        loadOptions: loadSupplierOptions,
        placeholder: '— none —',
        description: 'Optional — leave empty for no supplier.',
      },
      {
        name: 'items',
        label: 'Line items',
        kind: 'repeater',
        addLabel: '+ Add line',
        rowColumns: 6,
        itemFields: [
          { name: 'variantId', label: 'Product', kind: 'select', loadOptions: loadVariantOptions, placeholder: 'Pick product…', colSpan: 2 },
          { name: 'quantity', label: 'Qty', kind: 'number', placeholder: '1' },
          { name: 'cost', label: 'Unit cost', kind: 'number', placeholder: '0', description: 'Whole rupiah.' },
          { name: 'batchNo', label: 'Batch no.', placeholder: 'Optional' },
          { name: 'expiryDate', label: 'Expiry', kind: customKind('date') },
        ],
        description:
          mode === 'edit'
            ? 'Editing REPLACES the whole line list — keep every line you are not changing. Only DRAFT orders can be edited.'
            : 'At least one line with a product and quantity. Batch/expiry are for pharmacy stock.',
      },
      {
        name: 'note',
        label: 'Note',
        kind: 'textarea',
        description: 'Internal note for this order (max 1000 characters).',
      },
    ],
    groups: [{ id: 'head', tone: 'plain', columns: 2 }],
    examplePrompts:
      mode === 'create'
        ? [
            'Raise a PO to PT Sumber Sehat for 50 boxes of paracetamol at Rp 12.000 each',
            'Restock everything under its reorder point at the main outlet',
            'Order 20 kg of house-blend beans for the Bandung outlet',
          ]
        : [
            'Add 10 more units of the syrup line',
            'Change the supplier to PT Sumber Sehat',
            'Set the note to "confirm price before ordering"',
          ],
    buildAgentPrompt,
    apply: async ({ mode: applyMode, fields, initial }) => {
      if (applyMode === 'edit') {
        // PATCH /purchase-orders/{id} is DRAFT-only (the route answers
        // CONFLICT otherwise) and its zod REQUIRES items — the whole
        // line list is replaced. The sheet seeds the repeater from
        // `initial`, so untouched lines round-trip; if the draft
        // somehow carries none, fall back to the record's own lines
        // rather than failing validation server-side.
        const id = requireId(initial, 'purchase order');
        const items = (() => {
          const fromDraft = poLines(fields.items);
          if (fromDraft.length) return fromDraft;
          return poLines(initial?.items);
        })();
        if (!items.length) {
          throw new Error('A purchase-order edit replaces every line — send the full line list back.');
        }
        const body = defined({
          supplierId: fields.supplierId !== undefined ? textOrNull(fields.supplierId) : undefined,
          note: fields.note !== undefined ? textOrNull(fields.note) : undefined,
          items,
        });
        await api.patch(`/purchase-orders/${encodeURIComponent(id)}`, body);
        return;
      }
      const outletId = str(fields.outletId);
      if (!outletId) throw new Error('Pick an outlet.');
      const items = poLines(fields.items);
      if (!items.length) throw new Error('Add at least one line item with a product and quantity.');
      await api.post(
        '/purchase-orders',
        defined({
          outletId,
          supplierId: str(fields.supplierId),
          note: str(fields.note),
          items,
        }),
      );
    },
  };
}

// ── PO receipts ─────────────────────────────────────────────────────

/**
 * Receiving MOVES STOCK into the outlet — mirrors the purchasing page's
 * ReceiveModal. Create-only: a receipt is an event, not a record you
 * edit. `purchaseOrderId` arrives in `initial` when the sheet opens off
 * a PO row, and is also a field so a chat plan can propose it.
 */
function poReceiptsResource(): CrudResource<Fields> {
  return {
    slug: 'po-receipts',
    label: 'purchase-order receipt',
    fields: [
      {
        name: 'purchaseOrderId',
        label: 'Purchase order',
        kind: 'select',
        required: true,
        loadOptions: loadReceivablePoOptions,
        placeholder: '— pick an ordered PO —',
        description: 'Only ORDERED or partially received orders can be received.',
      },
      {
        name: 'items',
        label: 'What arrived',
        kind: 'repeater',
        addLabel: '+ Add line',
        rowColumns: 6,
        itemFields: [
          { name: 'itemId', label: 'PO line id', placeholder: 'poi_…', colSpan: 2, description: 'From the order detail.' },
          { name: 'receivedQty', label: 'Received qty', kind: 'number', placeholder: '0' },
          { name: 'batchNo', label: 'Batch no.', placeholder: 'Optional', colSpan: 2 },
          { name: 'expiryDate', label: 'Expiry', kind: customKind('date') },
        ],
        description:
          'One row per purchase-order LINE that physically arrived. Lines with 0 received are skipped; batch/expiry are for pharmacy stock.',
      },
    ],
    examplePrompts: [
      'Receive everything outstanding on PO-000012',
      'We got 30 of the 50 boxes — receive the rest later',
      'Receive the syrup line with batch B-2231, expiring next March',
    ],
    buildAgentPrompt,
    apply: async ({ fields, initial }) => {
      // Prefer the explicit field (a $n cross-ref resolved by chat wins);
      // the sheet's `initial` carries the PO row the merchant opened.
      const purchaseOrderId =
        str(fields.purchaseOrderId) ?? str(initial?.purchaseOrderId) ?? str(initial?.id);
      if (!purchaseOrderId) throw new Error('Which purchase order is being received?');
      const items = rowsOf(fields.items)
        .map((r) =>
          defined({
            itemId: str(r.itemId),
            receivedQty: num(r.receivedQty),
            batchNo: str(r.batchNo),
            expiryDate: str(r.expiryDate),
          }),
        )
        .filter(
          (r) => r.itemId !== undefined && typeof r.receivedQty === 'number' && r.receivedQty > 0,
        );
      if (!items.length) throw new Error('Enter a received quantity for at least one line.');
      await api.post(`/purchase-orders/${encodeURIComponent(purchaseOrderId)}/receive`, { items });
    },
  };
}

// ── refunds ─────────────────────────────────────────────────────────

/**
 * Mirrors the sale detail page's RefundPanel: item-level lines OR a
 * flat amount, never both. Create-only — a refund is irreversible.
 * NOTE: the panel does not offer `refundToStoreCredit`; the profile and
 * POST /sales/{id}/refund both accept it, so the sheet does too.
 */
function refundsResource(): CrudResource<Fields> {
  return {
    slug: 'refunds',
    label: 'refund',
    fields: [
      {
        name: 'saleId',
        label: 'Sale',
        required: true,
        placeholder: 'txn_…',
        description:
          'The completed sale to refund, by transaction id. Filled in for you when opened from a sale.',
      },
      {
        name: 'lines',
        label: 'Items to refund',
        kind: 'repeater',
        addLabel: '+ Add item',
        rowColumns: 4,
        itemFields: [
          { name: 'transactionItemId', label: 'Sale line id', placeholder: 'From the sale detail', colSpan: 3 },
          { name: 'qty', label: 'Qty', kind: 'number', placeholder: '1' },
        ],
        description: 'Item-level refund. Use EITHER items here OR the amount below, not both.',
      },
      {
        name: 'amount',
        label: 'Amount',
        kind: 'number',
        placeholder: '50000',
        description:
          'Amount-only refund in whole rupiah (50000 = Rp 50.000), when not refunding specific items.',
      },
      {
        name: 'restock',
        label: 'Return items to stock',
        kind: 'checkbox',
        defaultValue: 'true',
        description: 'Only meaningful with an item-level refund.',
      },
      {
        name: 'refundToStoreCredit',
        label: 'Refund to store credit',
        kind: 'checkbox',
        description: 'Issue the refund as a gift-card balance instead of cash back.',
      },
      { name: 'reason', label: 'Reason', placeholder: 'Optional (max 300 characters)' },
    ],
    examplePrompts: [
      'Refund the whole sale — the customer returned everything',
      'Refund 2 of the lattes and put them back in stock',
      'Refund Rp 50.000 as store credit, we shipped one item short',
    ],
    buildAgentPrompt,
    apply: async ({ fields, initial }) => {
      const saleId = str(fields.saleId) ?? str(initial?.saleId) ?? str(initial?.id);
      if (!saleId) throw new Error('Which sale should be refunded?');
      const lines = rowsOf(fields.lines)
        .map((r) => ({ transactionItemId: str(r.transactionItemId), qty: num(r.qty) }))
        .filter(
          (r): r is { transactionItemId: string; qty: number } =>
            r.transactionItemId !== undefined && typeof r.qty === 'number' && r.qty > 0,
        )
        .map((r) => ({ transactionItemId: r.transactionItemId, qty: Math.round(r.qty) }));
      const amount = num(fields.amount);
      if (lines.length && amount !== undefined) {
        throw new Error('Use either item lines or a flat amount, not both.');
      }
      if (!lines.length && amount === undefined) {
        throw new Error('Pick the items to refund, or enter an amount.');
      }
      await api.post(
        `/sales/${encodeURIComponent(saleId)}/refund`,
        defined({
          lines: lines.length ? lines : undefined,
          amount,
          restock: lines.length ? bool(fields.restock) : undefined,
          refundToStoreCredit: bool(fields.refundToStoreCredit),
          reason: str(fields.reason),
        }),
      );
    },
  };
}

// ── sale voids ──────────────────────────────────────────────────────

/** Mirrors the sale detail page's void confirmation: reason only.
 *  Voiding reverses the WHOLE sale and restocks its items. */
function saleVoidsResource(): CrudResource<Fields> {
  return {
    slug: 'sale-voids',
    label: 'sale void',
    fields: [
      {
        name: 'saleId',
        label: 'Sale',
        required: true,
        placeholder: 'txn_…',
        description:
          'The completed sale to cancel entirely, by transaction id. Voiding reverses the whole sale and returns its stock — this cannot be undone.',
      },
      { name: 'reason', label: 'Reason', placeholder: 'Optional (max 300 characters)' },
    ],
    examplePrompts: [
      'Void this sale — it was rung up twice',
      'Cancel the last transaction, wrong table',
    ],
    buildAgentPrompt,
    apply: async ({ fields, initial }) => {
      const saleId = str(fields.saleId) ?? str(initial?.saleId) ?? str(initial?.id);
      if (!saleId) throw new Error('Which sale should be voided?');
      await api.post(
        `/sales/${encodeURIComponent(saleId)}/void`,
        defined({ reason: str(fields.reason) }),
      );
    },
  };
}

// ── gift cards ──────────────────────────────────────────────────────

/**
 * Mirrors the gift-cards page's IssueModal (amount / code / note).
 * NOTE: the modal has no customer picker — the profile and POST
 * /gift-cards accept `customerId` (store credit), so the sheet offers
 * the select the modal is missing.
 */
function giftCardsResource(): CrudResource<Fields> {
  return {
    slug: 'gift-cards',
    label: 'gift card',
    fields: [
      {
        name: 'amount',
        label: 'Amount',
        kind: 'number',
        required: true,
        placeholder: '100000',
        description: 'Face value in whole rupiah (100000 = Rp 100.000). This becomes real spendable balance.',
      },
      {
        name: 'customerId',
        label: 'Customer',
        kind: 'select',
        loadOptions: loadCustomerOptions,
        placeholder: '— bearer card —',
        description: 'Issue it to a customer from the POS book as store credit, or leave empty for a bearer card.',
      },
      {
        name: 'code',
        label: 'Code',
        placeholder: '— generate one —',
        description: 'The code the cashier types or scans (e.g. a printed-card code). Leave empty to auto-generate.',
      },
      { name: 'note', label: 'Note', placeholder: 'Optional (max 300 characters)' },
    ],
    examplePrompts: [
      'Issue a Rp 100.000 gift card',
      'Rp 250.000 store credit for Dewi',
      'Ten Rp 50.000 cards for the giveaway',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const amount = num(fields.amount);
      if (amount === undefined || amount <= 0) throw new Error('Enter a positive amount.');
      await api.post(
        '/gift-cards',
        defined({
          amount: Math.round(amount),
          customerId: str(fields.customerId),
          code: str(fields.code),
          note: str(fields.note),
        }),
      );
    },
  };
}

// ── inventory adjustments ───────────────────────────────────────────

/** Mirrors the inventory page's AdjustModal: a signed delta with a
 *  reason, kept non-zero exactly like the modal's guard. */
function inventoryAdjustmentsResource(): CrudResource<Fields> {
  return {
    slug: 'inventory-adjustments',
    label: 'stock adjustment',
    fields: [
      {
        name: 'outletId',
        label: 'Outlet',
        kind: 'select',
        required: true,
        group: 'where',
        loadOptions: loadOutletOptions,
        placeholder: '— pick an outlet —',
      },
      {
        name: 'variantId',
        label: 'Product',
        kind: 'select',
        required: true,
        group: 'where',
        loadOptions: loadVariantOptions,
        placeholder: '— pick a product —',
        description: 'Stock is tracked per variant.',
      },
      {
        name: 'qtyDelta',
        label: 'Quantity change',
        kind: 'number',
        required: true,
        placeholder: '+5 or -3',
        description: 'Signed whole number: +5 adds five units, -3 removes three. Must be non-zero.',
      },
      {
        name: 'reason',
        label: 'Reason',
        placeholder: 'e.g. Stock count, received delivery, damage',
      },
    ],
    groups: [{ id: 'where', tone: 'plain', columns: 2 }],
    examplePrompts: [
      'Remove 3 damaged bottles of syrup at the main outlet',
      'Stock count found 12 extra cups — correct it',
      'Write off everything expired at the pharmacy outlet',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const outletId = str(fields.outletId);
      const variantId = str(fields.variantId);
      if (!outletId) throw new Error('Pick an outlet.');
      if (!variantId) throw new Error('Pick a product.');
      const raw = num(fields.qtyDelta);
      const qtyDelta = raw === undefined ? undefined : Math.round(raw);
      if (!qtyDelta) throw new Error('Enter a non-zero quantity change.');
      await api.post(
        '/inventory/adjust',
        defined({ outletId, variantId, qtyDelta, reason: str(fields.reason) }),
      );
    },
  };
}

// ── inventory transfers ─────────────────────────────────────────────

/**
 * The inventory page has NO transfer UI — this mirrors POST
 * /inventory/transfer (routes/inventory.ts) directly: one variant, a
 * positive quantity, two different outlets, moved in one transaction.
 */
function inventoryTransfersResource(): CrudResource<Fields> {
  return {
    slug: 'inventory-transfers',
    label: 'stock transfer',
    fields: [
      {
        name: 'fromOutletId',
        label: 'From outlet',
        kind: 'select',
        required: true,
        group: 'route',
        loadOptions: loadOutletOptions,
        placeholder: '— stock leaves —',
      },
      {
        name: 'toOutletId',
        label: 'To outlet',
        kind: 'select',
        required: true,
        group: 'route',
        loadOptions: loadOutletOptions,
        placeholder: '— stock arrives —',
        description: 'Must differ from the source outlet.',
      },
      {
        name: 'variantId',
        label: 'Product',
        kind: 'select',
        required: true,
        loadOptions: loadVariantOptions,
        placeholder: '— pick a product —',
        description: 'Stock is tracked per variant.',
      },
      {
        name: 'qty',
        label: 'Quantity',
        kind: 'number',
        required: true,
        placeholder: '10',
        description: 'How many units to move — a positive whole number.',
      },
    ],
    groups: [{ id: 'route', tone: 'plain', columns: 2 }],
    examplePrompts: [
      'Move 20 bags of beans from the warehouse outlet to Bandung',
      'Transfer 5 of these to the airport kiosk',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const fromOutletId = str(fields.fromOutletId);
      const toOutletId = str(fields.toOutletId);
      const variantId = str(fields.variantId);
      if (!fromOutletId || !toOutletId) throw new Error('Pick both outlets.');
      if (fromOutletId === toOutletId) {
        throw new Error('Source and destination outlets must differ.');
      }
      if (!variantId) throw new Error('Pick a product.');
      const raw = num(fields.qty);
      const qty = raw === undefined ? undefined : Math.round(raw);
      if (!qty || qty <= 0) throw new Error('Enter a positive quantity.');
      await api.post('/inventory/transfer', { fromOutletId, toOutletId, variantId, qty });
    },
  };
}

// ── stock batches ───────────────────────────────────────────────────

/**
 * The inventory page's batches section is read-only ("expiring soon") —
 * there is no add form. This mirrors POST /inventory/batches
 * (routes/inventory.ts): recording a lot ADDS its quantity to stock as
 * a PURCHASE movement, with the batch/expiry pharmacies track.
 */
function stockBatchesResource(): CrudResource<Fields> {
  return {
    slug: 'stock-batches',
    label: 'stock batch',
    fields: [
      {
        name: 'outletId',
        label: 'Outlet',
        kind: 'select',
        required: true,
        group: 'where',
        loadOptions: loadOutletOptions,
        placeholder: '— pick an outlet —',
      },
      {
        name: 'variantId',
        label: 'Product',
        kind: 'select',
        required: true,
        group: 'where',
        loadOptions: loadVariantOptions,
        placeholder: '— pick a product —',
        description: 'Stock is tracked per variant.',
      },
      {
        name: 'batchNo',
        label: 'Batch no.',
        group: 'lot',
        placeholder: 'Optional — the manufacturer’s lot number',
      },
      {
        name: 'expiryDate',
        label: 'Expiry',
        kind: customKind('date'),
        group: 'lot',
        description: 'Pharmacies use this for expiry tracking. Leave empty for none.',
      },
      {
        name: 'qty',
        label: 'Quantity',
        kind: 'number',
        required: true,
        group: 'lot',
        placeholder: '0',
        description: 'Units received into the lot — recording the batch ADDS this to stock.',
      },
      {
        name: 'cost',
        label: 'Unit cost',
        kind: 'number',
        group: 'lot',
        placeholder: '0',
        description: 'Per-unit cost in whole rupiah (default 0).',
      },
    ],
    groups: [
      { id: 'where', tone: 'plain', columns: 2 },
      { id: 'lot', tone: 'plain', columns: 2 },
    ],
    examplePrompts: [
      'Record 200 strips of amoxicillin, batch AMX-441, expiring 2027-03-01',
      'Add a lot of 50 vitamin C bottles at Rp 8.000 each',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const outletId = str(fields.outletId);
      const variantId = str(fields.variantId);
      if (!outletId) throw new Error('Pick an outlet.');
      if (!variantId) throw new Error('Pick a product.');
      const raw = num(fields.qty);
      const qty = raw === undefined ? undefined : Math.round(raw);
      if (!qty || qty <= 0) throw new Error('Enter a positive quantity.');
      const cost = num(fields.cost);
      await api.post(
        '/inventory/batches',
        defined({
          outletId,
          variantId,
          batchNo: str(fields.batchNo),
          expiryDate: str(fields.expiryDate),
          qty,
          cost: cost === undefined ? undefined : Math.round(cost),
        }),
      );
    },
  };
}

// ── discount codes ──────────────────────────────────────────────────

const DISCOUNT_TYPE_OPTIONS = [
  { value: 'percent', label: '% off cart' },
  { value: 'fixed', label: 'Fixed off cart' },
  { value: 'shipping_percent', label: '% off shipping' },
  { value: 'shipping_fixed', label: 'Fixed off shipping' },
];

const DISCOUNT_SCOPE_OPTIONS = [
  { value: 'cart', label: 'Whole cart' },
  { value: 'products', label: 'Specific products' },
  { value: 'tags', label: 'By tag' },
];

/** The EditorModal hides Scope entirely for the two shipping types — a
 *  shipping discount applies to postage, not a product set — and shows
 *  the product picker / tag box only for the matching scope. */
const isNotShippingDiscount = (d: Record<string, unknown>) =>
  d.type !== 'shipping_percent' && d.type !== 'shipping_fixed';

function discountCodesResource(mode: 'create' | 'edit'): CrudResource<Fields> {
  return {
    slug: 'discount-codes',
    label: 'discount code',
    fields: [
      ...(mode === 'create'
        ? [
            {
              name: 'code',
              label: 'Code',
              group: 'head',
              required: true,
              placeholder: 'LEBARAN25',
              description: 'What customers enter at checkout. Immutable once created — a duplicate fails with CODE_EXISTS.',
            } satisfies CrudSchemaField,
          ]
        : []),
      {
        name: 'description',
        label: 'Description',
        group: 'head',
        placeholder: 'Lebaran promo 2026',
        description: 'Internal only (max 500 characters).',
      },
      {
        name: 'type',
        label: 'Type',
        kind: 'select',
        required: mode === 'create',
        group: 'what',
        options: DISCOUNT_TYPE_OPTIONS,
        defaultValue: mode === 'create' ? 'percent' : undefined,
      },
      {
        name: 'value',
        label: 'Value',
        kind: 'number',
        required: mode === 'create',
        group: 'what',
        placeholder: '10',
        description: 'A percent (1-100) for percent types, whole rupiah for fixed types.',
      },
      {
        name: 'scope',
        label: 'Scope',
        kind: 'select',
        options: DISCOUNT_SCOPE_OPTIONS,
        defaultValue: mode === 'create' ? 'cart' : undefined,
        visibleWhen: isNotShippingDiscount,
        description: 'What the discount base is computed over.',
      },
      {
        name: 'productIds',
        label: 'Limit to products',
        kind: 'combobox',
        multi: true,
        loadOptions: () =>
          loadOptions(
            async () => {
              const res = await api.get<{ products?: { id: string; name: string }[] }>(
                '/products?active=true',
              );
              return res.data?.products ?? [];
            },
            (p) => ({ value: p.id, label: p.name }),
          ),
        visibleWhen: (d) => isNotShippingDiscount(d) && d.scope === 'products',
      },
      {
        name: 'tagFilter',
        label: 'Limit to tags',
        kind: 'combobox',
        multi: true,
        placeholder: 'summer, sale',
        visibleWhen: (d) => isNotShippingDiscount(d) && d.scope === 'tags',
      },
      {
        name: 'minPurchaseAmount',
        label: 'Min purchase',
        kind: 'number',
        group: 'limits',
        placeholder: 'optional',
        description: 'Whole rupiah. Leave empty for none.',
      },
      {
        name: 'maxUsesTotal',
        label: 'Max uses total',
        kind: 'number',
        group: 'limits',
        placeholder: 'unlimited',
      },
      {
        name: 'maxUsesPerCustomer',
        label: 'Max per customer',
        kind: 'number',
        group: 'limits',
        placeholder: 'unlimited',
      },
      { name: 'startsAt', label: 'Starts', kind: customKind('date'), group: 'dates' },
      { name: 'expiresAt', label: 'Expires', kind: customKind('date'), group: 'dates' },
      {
        name: 'active',
        label: 'Active',
        kind: 'checkbox',
        defaultValue: mode === 'create' ? 'true' : undefined,
        description: 'Buyers can enter this code at checkout.',
      },
      {
        name: 'public',
        label: 'Show on storefront',
        kind: 'checkbox',
        description: 'Display the code as a storefront banner instead of keeping it private.',
      },
    ],
    groups: [
      { id: 'head', tone: 'plain', columns: 2 },
      { id: 'what', tone: 'plain', columns: 2 },
      { id: 'limits', tone: 'plain', columns: 3 },
      { id: 'dates', tone: 'plain', columns: 2 },
    ],
    examplePrompts:
      mode === 'create'
        ? [
            'LEBARAN25 — 25% off everything until the end of Lebaran week',
            'Rp 50.000 off orders over Rp 300.000, 100 uses total',
            'Free shipping code for orders this month',
          ]
        : [
            'Extend this to the end of the month',
            'Cap it at 50 uses',
            'Turn this code off',
          ],
    buildAgentPrompt,
    apply: async ({ mode: applyMode, fields, initial }) => {
      // The route defaults currency to IDR and strips campaign ids, so
      // the payload is exactly the profile's field set — sparse on edit.
      const body = defined({
        description: fields.description !== undefined ? textOrNull(fields.description) : undefined,
        type: str(fields.type),
        value: num(fields.value),
        scope: str(fields.scope),
        productIds: strArr(fields.productIds),
        tagFilter: strArr(fields.tagFilter),
        minPurchaseAmount:
          fields.minPurchaseAmount !== undefined ? numOrNull(fields.minPurchaseAmount) : undefined,
        maxUsesTotal: fields.maxUsesTotal !== undefined ? numOrNull(fields.maxUsesTotal) : undefined,
        maxUsesPerCustomer:
          fields.maxUsesPerCustomer !== undefined ? numOrNull(fields.maxUsesPerCustomer) : undefined,
        startsAt: fields.startsAt !== undefined ? isoDay(fields.startsAt, 'start') : undefined,
        expiresAt: fields.expiresAt !== undefined ? isoDay(fields.expiresAt, 'end') : undefined,
        active: bool(fields.active),
        public: bool(fields.public),
      });
      if (applyMode === 'edit') {
        await discountCodesApi.update(
          requireId(initial, 'discount code'),
          body as Parameters<typeof discountCodesApi.update>[1],
        );
        return;
      }
      const code = str(fields.code)?.toUpperCase();
      if (!code) throw new Error('Code is required');
      if (body.type === undefined) throw new Error('Pick a discount type');
      if (body.value === undefined) throw new Error('Value is required');
      await discountCodesApi.create(
        { ...body, code } as Parameters<typeof discountCodesApi.create>[0],
      );
    },
  };
}

// ── loyalty program ─────────────────────────────────────────────────

/**
 * Edit-only singleton — mirrors the loyalty page's program card
 * (enabled / earn rate / redeem value). The PUT replaces the WHOLE
 * program, so untouched fields fall back to the current values in
 * `initial` rather than being dropped.
 */
function loyaltyProgramResource(): CrudResource<Fields> {
  return {
    slug: 'loyalty-program',
    label: 'loyalty program',
    fields: [
      {
        name: 'enabled',
        label: 'Enabled',
        kind: 'checkbox',
        description: 'Whether customers earn and redeem points at the till.',
      },
      {
        name: 'earnRatePoints',
        label: 'Earn rate',
        kind: 'number',
        group: 'rates',
        placeholder: '1',
        description: 'Points earned per Rp 1.000 spent (0 or more).',
      },
      {
        name: 'redeemValueIdr',
        label: 'Redeem value',
        kind: 'number',
        group: 'rates',
        placeholder: '100',
        description: 'Whole rupiah one point is worth when redeemed (0 or more).',
      },
    ],
    groups: [{ id: 'rates', tone: 'plain', columns: 2 }],
    examplePrompts: [
      'Turn the loyalty program on',
      'Make a point worth Rp 200',
      'Earn 2 points per Rp 1.000 spent',
    ],
    buildAgentPrompt,
    apply: async ({ fields, initial }) => {
      const earnRatePoints = num(fields.earnRatePoints) ?? num(initial?.earnRatePoints);
      const redeemValueIdr = num(fields.redeemValueIdr) ?? num(initial?.redeemValueIdr);
      if (earnRatePoints === undefined || redeemValueIdr === undefined) {
        throw new Error(
          'The save replaces the whole program — set both the earn rate and the redeem value.',
        );
      }
      await api.put('/marketing/loyalty/program', {
        enabled: bool(fields.enabled) ?? bool(initial?.enabled) ?? false,
        earnRatePoints,
        redeemValueIdr,
      });
    },
  };
}

// ── referral program ────────────────────────────────────────────────

/**
 * Edit-only singleton — mirrors the referrals page's config form. The
 * PUT replaces the WHOLE program, so untouched fields fall back to the
 * current values in `initial`. (The page also shows a campaign picker;
 * the profile does not declare marketingCampaignId, so it stays out.)
 */
function referralsProgramResource(): CrudResource<Fields> {
  return {
    slug: 'referrals-program',
    label: 'referral program',
    fields: [
      {
        name: 'enabled',
        label: 'Enable referral program',
        kind: 'checkbox',
        description: 'When off, new buyers are not attributed and no rewards issue.',
      },
      {
        name: 'rewardType',
        label: 'Reward type',
        kind: 'select',
        options: [
          { value: 'percent', label: 'Percent off cart' },
          { value: 'fixed', label: 'Fixed amount off cart' },
          { value: 'shipping_percent', label: 'Percent off shipping' },
          { value: 'shipping_fixed', label: 'Fixed amount off shipping' },
        ],
      },
      {
        name: 'referrerValue',
        label: 'Referrer reward',
        kind: 'number',
        group: 'rewards',
        description: 'A percent (1-100) for percent types, whole rupiah for fixed types.',
      },
      {
        name: 'refereeValue',
        label: 'Referee (new buyer) reward',
        kind: 'number',
        group: 'rewards',
        description: 'A slightly bigger pull for new buyers typically converts better.',
      },
      {
        name: 'currency',
        label: 'Currency',
        group: 'money',
        placeholder: 'IDR',
        description: '3-8 character code, normally IDR.',
      },
      {
        name: 'minPurchaseAmount',
        label: 'Minimum purchase',
        kind: 'number',
        group: 'money',
        placeholder: 'None',
        description: 'Whole rupiah before a referral counts. Leave empty for none.',
      },
      {
        name: 'rewardExpiryDays',
        label: 'Reward expires after (days)',
        kind: 'number',
        group: 'windows',
        placeholder: '90',
        description: '1-365 days a granted reward stays redeemable.',
      },
      {
        name: 'attributionWindowDays',
        label: 'Attribution window (days)',
        kind: 'number',
        group: 'windows',
        placeholder: '30',
        description: '1-180 days after clicking a link a purchase still counts.',
      },
      {
        name: 'maxRewardsPerReferrer',
        label: 'Max rewards per referrer',
        kind: 'number',
        group: 'windows',
        placeholder: 'Unlimited',
        description: 'Leave empty for unlimited.',
      },
      {
        name: 'programTerms',
        label: 'Program terms',
        kind: 'textarea',
        placeholder: 'e.g. Rewards are single-use per code. Valid for your first paid order only.',
        description: 'Shown on the buyer refer page (max 10000 characters).',
      },
    ],
    groups: [
      { id: 'rewards', tone: 'plain', columns: 2 },
      { id: 'money', tone: 'plain', columns: 2 },
      { id: 'windows', tone: 'plain', columns: 3 },
    ],
    examplePrompts: [
      'Turn on referrals — 10% for the referrer, 15% for the new buyer',
      'Cap each referrer at 5 rewards',
      'Only count referrals on orders over Rp 100.000',
    ],
    buildAgentPrompt,
    apply: async ({ fields, initial }) => {
      const rewardType = str(fields.rewardType) ?? str(initial?.rewardType);
      const referrerValue = num(fields.referrerValue) ?? num(initial?.referrerValue);
      const refereeValue = num(fields.refereeValue) ?? num(initial?.refereeValue);
      if (!rewardType || referrerValue === undefined || refereeValue === undefined) {
        throw new Error(
          'The save replaces the whole program — set the reward type and both reward values.',
        );
      }
      const body = defined({
        enabled: bool(fields.enabled) ?? bool(initial?.enabled) ?? false,
        rewardType,
        referrerValue,
        refereeValue,
        currency: str(fields.currency) ?? str(initial?.currency) ?? 'IDR',
        minPurchaseAmount:
          fields.minPurchaseAmount !== undefined
            ? numOrNull(fields.minPurchaseAmount)
            : numOrNull(initial?.minPurchaseAmount),
        rewardExpiryDays: num(fields.rewardExpiryDays) ?? num(initial?.rewardExpiryDays),
        attributionWindowDays:
          num(fields.attributionWindowDays) ?? num(initial?.attributionWindowDays),
        maxRewardsPerReferrer:
          fields.maxRewardsPerReferrer !== undefined
            ? numOrNull(fields.maxRewardsPerReferrer)
            : numOrNull(initial?.maxRewardsPerReferrer),
        programTerms:
          fields.programTerms !== undefined
            ? textOrNull(fields.programTerms)
            : textOrNull(initial?.programTerms),
      });
      await referralsApi.update(body as Parameters<typeof referralsApi.update>[0]);
    },
  };
}

// ── the group registry ──────────────────────────────────────────────

/** One builder per books resource. Create-only resources return null
 *  for 'edit' (a receipt/refund/void/card/movement is an event, not a
 *  record you PATCH); the two program singletons return null for
 *  'create' (there is exactly one, you only ever edit it). */
export const BOOKS_BUILDERS: Record<string, ResourceBuilder> = {
  'purchase-orders': (mode) => purchaseOrdersResource(mode),
  'po-receipts': (mode) => (mode === 'create' ? poReceiptsResource() : null),
  refunds: (mode) => (mode === 'create' ? refundsResource() : null),
  'sale-voids': (mode) => (mode === 'create' ? saleVoidsResource() : null),
  'gift-cards': (mode) => (mode === 'create' ? giftCardsResource() : null),
  'inventory-adjustments': (mode) => (mode === 'create' ? inventoryAdjustmentsResource() : null),
  'inventory-transfers': (mode) => (mode === 'create' ? inventoryTransfersResource() : null),
  'stock-batches': (mode) => (mode === 'create' ? stockBatchesResource() : null),
  'discount-codes': (mode) => discountCodesResource(mode),
  'loyalty-program': (mode) => (mode === 'edit' ? loyaltyProgramResource() : null),
  'referrals-program': (mode) => (mode === 'edit' ? referralsProgramResource() : null),
};
