import type { CrudResource, CrudSchemaField } from '@forjio/agent-ui';
import {
  checkoutSessionsApi,
  customersApi,
  payoutsApi,
  plansApi,
  subscriptionsApi,
} from '@/lib/payments-api';
import {
  inventoryApi,
  licensesApi,
  shipmentsApi,
  shippingApi,
  warehousesApi,
  type Courier,
} from '@/lib/fulfillment-api';
import { api } from '@/lib/api';
import type { AssistantMode } from '@/hooks/use-catentio';
import {
  buildAgentPrompt,
  bool,
  defined,
  num,
  str,
  verbDescriptor,
  verbTargetId,
  type Fields,
  type ResourceBuilder,
  type ResourceWithResult,
} from '../resource-helpers';

/**
 * PAYFUL — the payments (Plugipay) + fulfillment (Fulkruma) descriptor
 * group: the 11 module resources under /dashboard/payments/* and
 * /dashboard/fulfillment/*. Frontend mirror of the matching entries in
 * backend/src/lib/catentio-profile.ts — field names, per-mode
 * availability and required-on-create follow `MALAPOS_PROFILE.resources`
 * (the server's plan sanitizer stays the gate); the FORM shapes mirror
 * the hand-built dialogs on those pages, and every `apply` calls the
 * SAME api-client slice the page calls, so a record created through the
 * sheet is indistinguishable from one typed by hand.
 *
 * Most of these are `approvalRequired` in the profile (money and stock
 * in motion): the agent proposes, and the Apply below runs under the
 * MERCHANT's own session when they confirm. Create-only resources
 * return null for mode 'edit'; the delivery-origin singleton returns
 * null for 'create'.
 *
 * Money is per-currency: WHOLE Indonesian rupiah when the currency is
 * IDR (25000 = Rp 25.000), cents when USD (1500 = $15.00).
 */

// ── local helpers (shared coercions live in ../resource-helpers) ────

/** Kinds the package does not know about — 'date'. The host registers a
 *  renderer for it (agentic-sheet.tsx); unknown kinds degrade to a text
 *  input, so widening the type here is safe. */
const customKind = (kind: string) => kind as CrudSchemaField['kind'];

/** Sparse nullable text: absent stays, '' or null clears, text sets —
 *  mirroring the hand-built forms' `value.trim() || null`. */
function textOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  return str(v) ?? null;
}

/** The record id for an edit — the sheet passes the row the USER picked
 *  in `initial`; the apply PATCHes that record, never one named inside
 *  `fields`. */
function requireId(initial: Partial<Fields> | undefined, what: string): string {
  const id = str(initial?.id);
  if (!id) throw new Error(`Missing ${what} id`);
  return id;
}

/** A field that identifies the PARENT record. On the sheet it may
 *  arrive in `initial` (the page already knows which plan/variant you
 *  are on); a plan proposes it as a field. The explicit field wins. */
function parentId(
  fields: Fields,
  initial: Partial<Fields> | undefined,
  key: string,
): string | undefined {
  return str(fields[key]) ?? str(initial?.[key]);
}

/** The datetime fields (trialEnd, expiresAt) want a full ISO instant —
 *  the routes validate `z.string().datetime()`, so the date input's
 *  bare `yyyy-mm-dd` has to be widened to midnight UTC or it 400s. */
function isoInstant(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (s.length <= 10) return new Date(`${s}T00:00:00Z`).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Object-typed fields (a shipment's `destination` from a plan). A plan
 *  sends a real object; anything else is `undefined`. */
function obj(v: unknown): Record<string, unknown> | undefined {
  if (v == null) return undefined;
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

/** Repeater rows (a shipment's `items`) — the manual form and a plan
 *  both hand back an array of objects. */
function rows(v: unknown): Fields[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is Fields => typeof r === 'object' && r !== null);
}

// ── option loaders ──────────────────────────────────────────────────
// Every one is scoped to the merchant's own workspace, so the list is
// also the only set of ids that can succeed. A fetch failure leaves an
// empty list rather than blocking the sheet.

async function loadOptions<T>(
  fetcher: () => Promise<T[]>,
  toOption: (row: T) => { value: string; label: string; group?: string },
): Promise<{ value: string; label: string; group?: string }[]> {
  try {
    return (await fetcher()).map(toOption);
  } catch {
    return [];
  }
}

const loadPlanOptions = () =>
  loadOptions(
    async () => {
      const res = await plansApi.list({ limit: 100 });
      return Array.isArray(res.data) ? res.data : [];
    },
    (p) => ({ value: p.id, label: p.name }),
  );

const loadPaymentCustomerOptions = () =>
  loadOptions(
    async () => {
      const res = await customersApi.list({ limit: 100 });
      return Array.isArray(res.data) ? res.data : [];
    },
    (c) => ({
      value: c.id,
      label: c.name && c.email ? `${c.name} — ${c.email}` : (c.name ?? c.email ?? c.id),
    }),
  );

const loadWarehouseOptions = () =>
  loadOptions(
    async () => {
      const res = await warehousesApi.list();
      return Array.isArray(res.data) ? res.data : [];
    },
    (w) => ({ value: w.id, label: w.isDefault ? `${w.name} (default)` : w.name }),
  );

const loadFulfillmentProductOptions = () =>
  loadOptions(
    async () => {
      const res = await inventoryApi.listProducts();
      return Array.isArray(res.data) ? res.data : [];
    },
    (p) => ({ value: p.id, label: p.name }),
  );

const loadFulfillmentVariantOptions = () =>
  loadOptions(
    async () => {
      const res = await inventoryApi.listProducts();
      const products = Array.isArray(res.data) ? res.data : [];
      return products.flatMap((p) => (p.variants ?? []).map((v) => ({ product: p, variant: v })));
    },
    ({ product, variant }) => ({
      value: variant.id,
      label: `${product.name} · ${variant.name}`,
      group: product.name,
    }),
  );

/** POS contact book — the shipment modal's "Pick customer" picker reads
 *  the same GET /customers list. */
const loadPosCustomerOptions = () =>
  loadOptions(
    async () => {
      const res = await api.get<{ id: string; name: string; phone: string | null; email: string | null }[]>(
        '/customers',
      );
      return Array.isArray(res.data) ? res.data : [];
    },
    (c) => ({ value: c.id, label: [c.name, c.phone ?? c.email].filter(Boolean).join(' — ') }),
  );

/** Couriers may return an array or a wrapper object — accept both, the
 *  way the delivery-settings page does. */
async function listCouriers(): Promise<Courier[]> {
  const res = await shippingApi.listCouriers();
  const d = res.data;
  return Array.isArray(d) ? d : (d?.couriers ?? d?.data ?? []);
}

const loadCourierOptions = () =>
  loadOptions(
    async () => {
      const seen = new Set<string>();
      return (await listCouriers()).filter((c) => {
        const code = c.courierCode ?? '';
        if (!code || seen.has(code)) return false;
        seen.add(code);
        return true;
      });
    },
    (c) => ({
      value: c.courierCode ?? '',
      label: `${String(c.courierName ?? c.courierCode ?? '').toUpperCase()} (${c.courierCode})`,
    }),
  );

const loadCourierServiceOptions = () =>
  loadOptions(
    async () => {
      const seen = new Set<string>();
      return (await listCouriers()).filter((c) => {
        const key = `${c.courierCode}:${c.courierServiceCode}`;
        if (!c.courierServiceCode || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    (c) => ({
      value: c.courierServiceCode ?? '',
      label: c.courierServiceName ?? c.courierServiceCode ?? '',
      group: String(c.courierName ?? c.courierCode ?? '').toUpperCase(),
    }),
  );

const CURRENCY_OPTIONS = [
  { value: 'IDR', label: 'IDR' },
  { value: 'USD', label: 'USD' },
];

// ── payments module (Plugipay) ──────────────────────────────────────

/**
 * The only payments resource with no hand-built editor — the customers
 * page is a read-only table — so the form comes straight from the
 * profile: email (required on create) + nullable name. Direct write.
 */
function paymentCustomersResource(mode: AssistantMode): ResourceWithResult {
  return {
    slug: 'payment-customers',
    label: 'payment customer',
    fields: [
      {
        name: 'email',
        label: 'Email',
        required: mode === 'create',
        placeholder: 'dewi@example.com',
        description:
          "Their billing identity in your Plugipay payment workspace — used for subscriptions and payment links, NOT the walk-in POS customer book.",
      },
      {
        name: 'name',
        label: 'Name',
        placeholder: 'Dewi Rahmawati',
        description: 'As it should read on invoices and receipts. Leave empty to clear.',
      },
    ],
    examplePrompts:
      mode === 'create'
        ? [
            'Add a payment customer dewi@example.com',
            'New billing customer PT Kopi Anara, billing@kopianara.id',
            'Create payment customers for budi@ and sari@tokomekar.id',
          ]
        : [
            'Correct the email to dewi.r@example.com',
            'Set the name to PT Kopi Anara',
            'Clear the name on this customer',
          ],
    buildAgentPrompt,
    apply: async ({ mode: applyMode, fields, initial }) => {
      const body = defined({
        email: str(fields.email),
        name: textOrNull(fields.name),
      });
      if (applyMode === 'edit') {
        await customersApi.update(
          requireId(initial, 'payment customer'),
          body as Parameters<typeof customersApi.update>[1],
        );
        return;
      }
      if (!body.email) throw new Error('Email is required');
      // Returned for `$n` cross-refs — a subscriptions/checkout-sessions
      // action may reference the customer created earlier in the reply.
      return (await customersApi.create(body as Parameters<typeof customersApi.create>[0])).data;
    },
  };
}

/**
 * Mirrors the PlanForm dialog on /dashboard/payments/plans, cut to the
 * profile's per-mode split: amount / currency / interval are CREATE
 * ONLY (changing an existing plan's price is a prices action), while
 * description / active are edit-only.
 */
function plansResource(mode: AssistantMode): ResourceWithResult {
  return {
    slug: 'plans',
    label: 'billing plan',
    fields: [
      {
        name: 'name',
        label: 'Plan name',
        required: mode === 'create',
        placeholder: 'Pro Monthly',
        description: 'Max 200 characters.',
      },
      ...(mode === 'create'
        ? [
            {
              name: 'amount',
              group: 'money',
              label: 'Amount per period',
              kind: 'number',
              required: true,
              placeholder: '99000',
              description:
                'Whole rupiah for IDR (99000 = Rp 99.000); cents for USD (1500 = $15.00). Fixed once the plan exists — later changes are new prices.',
            } satisfies CrudSchemaField,
            {
              name: 'currency',
              group: 'money',
              label: 'Currency',
              kind: 'select',
              options: CURRENCY_OPTIONS,
              placeholder: 'IDR',
              description: 'IDR unless set. Fixed once the plan exists.',
            } satisfies CrudSchemaField,
            {
              name: 'interval',
              label: 'Billing interval',
              kind: 'select',
              options: [
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ],
              placeholder: 'Monthly',
              description: 'Monthly unless set. Fixed once the plan exists.',
            } satisfies CrudSchemaField,
          ]
        : [
            {
              name: 'description',
              label: 'Description',
              kind: 'textarea',
              description: 'What the subscriber gets (max 1000 characters).',
            } satisfies CrudSchemaField,
            {
              name: 'active',
              label: 'Active',
              kind: 'checkbox',
              description:
                'Archiving stops new subscriptions. It does NOT cancel existing subscribers.',
            } satisfies CrudSchemaField,
          ]),
    ],
    groups: [{ id: 'money', tone: 'plain', columns: 2 }],
    examplePrompts:
      mode === 'create'
        ? [
            'A Members Club plan at Rp 99.000 a month',
            'Yearly Pro plan, Rp 990.000',
            'Weekly coffee subscription at Rp 50.000',
          ]
        : ['Rename this plan to Pro', 'Describe what subscribers get', 'Archive this plan'],
    buildAgentPrompt,
    apply: async ({ mode: applyMode, fields, initial }) => {
      if (applyMode === 'edit') {
        const body = defined({
          name: str(fields.name),
          description: str(fields.description),
          active: bool(fields.active),
        });
        await plansApi.update(
          requireId(initial, 'plan'),
          body as Parameters<typeof plansApi.update>[1],
        );
        return;
      }
      const name = str(fields.name);
      const amount = num(fields.amount);
      if (!name) throw new Error('Plan name is required');
      if (amount === undefined) throw new Error('Amount is required');
      const body: Record<string, unknown> = {
        name,
        amount,
        currency: str(fields.currency) ?? 'IDR',
        interval: str(fields.interval) ?? 'monthly',
      };
      // Returned for `$n` cross-refs — a prices/subscriptions action
      // may reference the plan created earlier in the same reply.
      return (await plansApi.create(body as Parameters<typeof plansApi.create>[0])).data;
    },
  };
}

/**
 * Mirrors the add-price inline form on the plan detail page, plus the
 * plan picker that page gets from its route (`planId` may also arrive
 * in `initial`). CREATE ONLY — a malapos price has no editable field in
 * the profile; to change a price, add a new one.
 */
function pricesResource(): CrudResource<Fields> {
  return {
    slug: 'prices',
    label: 'plan price',
    fields: [
      {
        name: 'planId',
        label: 'Plan',
        kind: 'select',
        required: true,
        loadOptions: loadPlanOptions,
        placeholder: '— pick a plan —',
        description: 'The billing plan this price belongs to.',
      },
      {
        name: 'currency',
        group: 'price',
        label: 'Currency',
        kind: 'select',
        required: true,
        options: CURRENCY_OPTIONS,
      },
      {
        name: 'model',
        group: 'price',
        label: 'Pricing model',
        kind: 'select',
        options: [
          { value: 'flat', label: 'Flat' },
          { value: 'usage', label: 'Usage' },
        ],
        placeholder: 'Flat',
        description: 'Flat (one recurring amount) unless you know you need usage-based billing.',
      },
      {
        name: 'unitAmount',
        group: 'price',
        label: 'Unit amount',
        kind: 'number',
        placeholder: '99000',
        description: 'Whole rupiah for IDR, cents for USD.',
      },
      {
        name: 'taxMode',
        group: 'price',
        label: 'Tax mode',
        kind: 'select',
        options: [
          { value: 'inclusive', label: 'Inclusive' },
          { value: 'exclusive', label: 'Exclusive' },
        ],
        placeholder: 'Inclusive',
        description: 'Inclusive: tax already in the amount. Exclusive: added on top.',
      },
    ],
    groups: [{ id: 'price', tone: 'plain', columns: 2 }],
    examplePrompts: [
      'Add a USD price of $9 to the Pro plan',
      'A second IDR price at Rp 150.000, tax inclusive',
      'A usage-based price on the API plan',
    ],
    buildAgentPrompt,
    apply: async ({ fields, initial }) => {
      const planId = parentId(fields, initial, 'planId');
      const currency = str(fields.currency);
      if (!planId) throw new Error('Pick the plan this price belongs to');
      if (!currency) throw new Error('Currency is required');
      const body = defined({
        currency,
        model: str(fields.model) ?? 'flat',
        unitAmount: num(fields.unitAmount),
        taxMode: str(fields.taxMode),
      });
      await plansApi.addPrice(planId, body as Parameters<typeof plansApi.addPrice>[1]);
    },
  };
}

/**
 * Mirrors the New Checkout Session modal on /dashboard/payments — the
 * fields it actually SENDS (amount, currency, successUrl, cancelUrl)
 * plus the profile's customerId + expiresInMinutes. The modal also
 * renders description/customerEmail inputs but never posts them, and
 * the create route does not take them, so they are not fields here.
 */
function checkoutSessionsResource(): CrudResource<Fields> {
  return {
    slug: 'checkout-sessions',
    label: 'payment link',
    fields: [
      {
        name: 'amount',
        group: 'money',
        label: 'Amount',
        kind: 'number',
        required: true,
        placeholder: '50000',
        description: 'Whole rupiah for IDR (25000 = Rp 25.000), cents for USD (1500 = $15.00).',
      },
      {
        name: 'currency',
        group: 'money',
        label: 'Currency',
        kind: 'select',
        options: CURRENCY_OPTIONS,
        placeholder: 'IDR',
        description: 'IDR unless set.',
      },
      {
        name: 'successUrl',
        label: 'Success URL',
        required: true,
        placeholder: 'https://example.com/success',
        description: 'Full URL the customer lands on after paying.',
      },
      {
        name: 'cancelUrl',
        label: 'Cancel URL',
        required: true,
        placeholder: 'https://example.com/cancel',
        description: 'Full URL the customer lands on after backing out.',
      },
      {
        name: 'customerId',
        label: 'Customer',
        kind: 'select',
        loadOptions: loadPaymentCustomerOptions,
        placeholder: '— guest checkout —',
        description: 'Attach the session to a payment customer. Leave empty for a guest checkout.',
      },
      {
        name: 'expiresInMinutes',
        label: 'Expires in (minutes)',
        kind: 'number',
        placeholder: '60',
        description: 'How long the link stays payable, in minutes. Defaults to 60.',
      },
    ],
    groups: [{ id: 'money', tone: 'plain', columns: 2 }],
    examplePrompts: [
      'A payment link for Rp 149.000',
      'Bill this customer Rp 500.000 — link valid for a day',
      'A $25 link, success back to our site',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const amount = num(fields.amount);
      const successUrl = str(fields.successUrl);
      const cancelUrl = str(fields.cancelUrl);
      if (amount === undefined) throw new Error('Amount is required');
      if (!successUrl) throw new Error('Success URL is required');
      if (!cancelUrl) throw new Error('Cancel URL is required');
      const body: Record<string, unknown> = {
        amount,
        currency: str(fields.currency) ?? 'IDR',
        successUrl,
        cancelUrl,
        ...defined({
          customerId: str(fields.customerId),
          expiresInMinutes: num(fields.expiresInMinutes),
        }),
      };
      await checkoutSessionsApi.create(body as Parameters<typeof checkoutSessionsApi.create>[0]);
    },
  };
}

/**
 * No create form exists on /dashboard/payments/subscriptions (the page
 * is pause/resume/cancel action buttons), so the form comes from the
 * profile: customer + plan (+ optional priceId / trialEnd), with the
 * selects loading options the way the other malapos forms do. CREATE
 * ONLY — the sheet does not drive the lifecycle actions.
 */
function subscriptionsResource(): CrudResource<Fields> {
  return {
    slug: 'subscriptions',
    label: 'subscription',
    fields: [
      {
        name: 'customerId',
        label: 'Customer',
        kind: 'select',
        required: true,
        loadOptions: loadPaymentCustomerOptions,
        placeholder: '— pick a payment customer —',
        description: 'Who is being subscribed — a Plugipay payment customer, not the POS book.',
      },
      {
        name: 'planId',
        label: 'Plan',
        kind: 'select',
        required: true,
        loadOptions: loadPlanOptions,
        placeholder: '— pick a plan —',
        description: 'The billing plan they subscribe to.',
      },
      {
        name: 'priceId',
        label: 'Price',
        placeholder: '— first active price —',
        description: "Which of the plan's prices to bill, by id. Leave empty to use the plan's first active price.",
      },
      {
        name: 'trialEnd',
        label: 'Trial ends',
        kind: customKind('date'),
        description: 'The date the free trial ends. Leave empty for no trial.',
      },
    ],
    examplePrompts: [
      'Subscribe dewi@example.com to the Pro plan',
      'Put this customer on the monthly plan with a trial until 1 September',
      'Start a Members Club subscription for Budi',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const customerId = str(fields.customerId);
      const planId = str(fields.planId);
      if (!customerId) throw new Error('Which customer is subscribing?');
      if (!planId) throw new Error('Which plan?');
      const body: Record<string, unknown> = {
        customerId,
        planId,
        ...defined({
          priceId: str(fields.priceId),
          // The route validates a full ISO instant; widen the date input.
          trialEnd: isoInstant(fields.trialEnd),
        }),
      };
      await subscriptionsApi.create(body as Parameters<typeof subscriptionsApi.create>[0]);
    },
  };
}

/**
 * Mirrors the Request payout modal (amount + note; destination is the
 * saved bank account), with the profile's bank-override fields as an
 * optional block — leave them all empty to pay out to the saved
 * account, exactly what the modal always does.
 */
function payoutsResource(): CrudResource<Fields> {
  return {
    slug: 'payouts',
    label: 'payout',
    fields: [
      {
        name: 'amount',
        group: 'money',
        label: 'Amount',
        kind: 'number',
        required: true,
        placeholder: '500000',
        description:
          'Whole rupiah for IDR, cents for USD. This moves real money out of your available balance.',
      },
      {
        name: 'currency',
        group: 'money',
        label: 'Currency',
        kind: 'select',
        options: CURRENCY_OPTIONS,
        placeholder: 'IDR',
        description: 'IDR unless set — match your balance currency.',
      },
      { name: 'bankName', group: 'bank', label: 'Bank name', placeholder: 'Bank Central Asia' },
      { name: 'bankCode', group: 'bank', label: 'Bank code', placeholder: 'BCA' },
      {
        name: 'bankAccountNumber',
        group: 'bank',
        label: 'Account number',
        placeholder: '1234567890',
      },
      {
        name: 'bankAccountHolder',
        group: 'bank',
        label: 'Account holder',
        placeholder: 'As printed on passbook',
      },
      {
        name: 'note',
        label: 'Note',
        kind: 'textarea',
        description: 'Internal only (max 500 characters).',
      },
    ],
    groups: [
      { id: 'money', tone: 'plain', columns: 2 },
      {
        id: 'bank',
        label: 'Destination override',
        description: 'Leave all four empty to pay out to your saved bank account.',
        columns: 2,
      },
    ],
    examplePrompts: [
      'Withdraw Rp 500.000 to my saved account',
      'Pay out Rp 2.000.000, note it as the March draw',
      'Send Rp 1.000.000 to BCA 1234567890, Dewi Rahmawati',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const amount = num(fields.amount);
      if (amount === undefined) throw new Error('Amount is required');
      const body: Record<string, unknown> = {
        amount,
        currency: str(fields.currency) ?? 'IDR',
        ...defined({
          bankName: str(fields.bankName),
          bankCode: textOrNull(fields.bankCode),
          bankAccountNumber: str(fields.bankAccountNumber),
          bankAccountHolder: str(fields.bankAccountHolder),
          note: str(fields.note),
        }),
      };
      await payoutsApi.create(body as Parameters<typeof payoutsApi.create>[0]);
    },
  };
}

/**
 * Mark a payout paid — the wave-1 proof of the per-action approval
 * chain. Mirrors the TransitionModal on /dashboard/payments/payouts
 * (optional bank reference; final — a paid payout cannot be reopened);
 * the same payoutsApi.markPaid POST the modal makes, under the USER's
 * own session. The endpoint is deliberately off the delegation
 * writable list, so this apply is the ONLY way the transition happens.
 */
function payoutMarkPaidResource() {
  return verbDescriptor({
    slug: 'payouts',
    label: 'payout',
    title: 'Mark payout paid',
    confirmLabel: 'Mark paid',
    fields: [
      {
        name: 'reference',
        label: 'Bank reference (optional)',
        placeholder: 'e.g. transfer receipt number',
        description:
          'Recorded on the payout. Confirms the bank settled the transfer — this posts the ledger debit and is final.',
      },
    ],
    examplePrompts: ['Mark this payout as paid', 'Paid — reference TRX-2231'],
    apply: ({ fields, initial }) =>
      payoutsApi.markPaid(verbTargetId(initial, 'payout'), str(fields.reference) ?? null),
  });
}

// ── fulfillment module (Fulkruma) ───────────────────────────────────

/**
 * Mirrors the WarehouseModal on /dashboard/fulfillment/warehouses. The
 * modal leaves isDefault to a separate list action; the profile (and
 * the api client) carry it on create + edit, so it is a checkbox here.
 */
function warehousesResource(mode: AssistantMode): CrudResource<Fields> {
  return {
    slug: 'warehouses',
    label: 'fulfillment warehouse',
    fields: [
      {
        name: 'name',
        label: 'Name',
        required: mode === 'create',
        placeholder: 'Main Warehouse',
        description:
          'A Fulkruma fulfillment warehouse for shipped orders — separate from the POS outlets stock lives at. Max 100 characters.',
      },
      { name: 'address', label: 'Address', kind: 'textarea', description: 'Max 500 characters.' },
      { name: 'city', group: 'addr', label: 'City', placeholder: 'Bandung' },
      { name: 'postal', group: 'addr', label: 'Postal code', placeholder: '40115' },
      { name: 'phone', label: 'Phone', placeholder: '+62 22 1234567' },
      {
        name: 'isDefault',
        label: 'Default warehouse',
        kind: 'checkbox',
        description:
          'Stock and shipments use this warehouse unless told otherwise. Setting it moves the default off your current one.',
      },
    ],
    groups: [{ id: 'addr', tone: 'plain', columns: 2 }],
    examplePrompts:
      mode === 'create'
        ? [
            'Add a warehouse in Bandung at Jl. Braga 12, postal 40111',
            'New warehouse in Surabaya, phone +62 31 998877',
            'Create a Jakarta warehouse and make it the default',
          ]
        : [
            'Change the phone number to +62 22 555111',
            'Make this the default warehouse',
            'Update the address to Jl. Asia Afrika 8',
          ],
    buildAgentPrompt,
    apply: async ({ mode: applyMode, fields, initial }) => {
      const body = defined({
        name: str(fields.name),
        address: textOrNull(fields.address),
        city: textOrNull(fields.city),
        postal: textOrNull(fields.postal),
        phone: textOrNull(fields.phone),
        isDefault: bool(fields.isDefault),
      });
      if (applyMode === 'edit') {
        await warehousesApi.update(
          requireId(initial, 'warehouse'),
          body as Parameters<typeof warehousesApi.update>[1],
        );
        return;
      }
      if (!body.name) throw new Error('Name is required');
      await warehousesApi.create(body as Parameters<typeof warehousesApi.create>[0]);
    },
  };
}

/**
 * Edit-only singleton — the pickup address couriers collect from.
 * Mirrors the origin form on /dashboard/fulfillment/settings (the same
 * four keys) and PATCHes /delivery/origin exactly as that page does;
 * the route forwards the body verbatim to Fulkruma.
 */
function deliveryOriginResource(): CrudResource<Fields> {
  return {
    slug: 'delivery-origin',
    label: 'shipping origin',
    fields: [
      { name: 'contactName', group: 'origin', label: 'Contact name', placeholder: 'Dewi', description: 'Who the courier asks for at pickup.' },
      { name: 'contactPhone', group: 'origin', label: 'Contact phone', placeholder: '+62 812 3456 7890', description: 'The number the courier calls at pickup.' },
      {
        name: 'address',
        group: 'origin',
        colSpan: 2,
        label: 'Address',
        kind: 'textarea',
        description: 'The full pickup street address couriers collect parcels from.',
      },
      { name: 'postal', group: 'origin', colSpan: 2, label: 'Postal code', placeholder: '40111' },
    ],
    groups: [{ id: 'origin', label: 'Pickup origin', columns: 2 }],
    examplePrompts: [
      'We ship from Jl. Braga 12, Bandung 40111 — contact Dewi, +62 812 3456 7890',
      'Change the pickup contact to Budi on +62 813 1111 2222',
      'Update the pickup postal code to 40115',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const body = defined({
        contactName: str(fields.contactName),
        contactPhone: str(fields.contactPhone),
        address: str(fields.address),
        postal: str(fields.postal),
      });
      await api.patch('/delivery/origin', body);
    },
  };
}

/**
 * Mirrors the New shipment modal on /dashboard/fulfillment/shipments:
 * recipient + parcel items as structured sub-fields (assembled into the
 * `destination` object + `items` array the route wants), courier +
 * price from a rates quote. A plan may instead carry `destination`
 * whole — the profile declares it as one object — and the apply accepts
 * either. Creating books a NO-CHARGE draft; "Book courier" on the
 * shipments page confirms pickup and dispatches.
 */
function shipmentsResource(): CrudResource<Fields> {
  return {
    slug: 'shipments',
    label: 'shipment',
    fields: [
      { name: 'contactName', group: 'recipient', label: 'Recipient name', required: true, placeholder: 'Dewi Rahmawati' },
      { name: 'contactPhone', group: 'recipient', label: 'Recipient phone', required: true, placeholder: '+62 812 3456 7890' },
      { name: 'contactEmail', group: 'recipient', colSpan: 2, label: 'Recipient email', placeholder: 'dewi@example.com', description: 'Optional.' },
      { name: 'address', group: 'recipient', colSpan: 2, label: 'Address line', required: true, kind: 'textarea' },
      { name: 'area', group: 'recipient', label: 'Area / city', placeholder: 'Kota Bandung' },
      {
        name: 'postalCode',
        group: 'recipient',
        label: 'Postal code',
        placeholder: '40111',
        description: 'Strongly recommended — couriers quote by postal code.',
      },
      {
        name: 'items',
        label: 'Parcel items',
        kind: 'repeater',
        required: true,
        addLabel: '+ Add item',
        rowColumns: 4,
        itemFields: [
          { name: 'name', label: 'Item', placeholder: 'Kopi 1 kg' },
          { name: 'quantity', label: 'Qty', kind: 'number', placeholder: '1' },
          { name: 'weight', label: 'Weight (g)', kind: 'number', placeholder: '500' },
          { name: 'value', label: 'Value', kind: 'number', placeholder: '0', description: 'Whole rupiah.' },
        ],
        description: 'What is in the parcel — at least one line.',
      },
      {
        name: 'courierCode',
        group: 'courier',
        label: 'Courier',
        kind: 'select',
        required: true,
        loadOptions: loadCourierOptions,
        placeholder: '— pick a courier —',
      },
      {
        name: 'courierServiceCode',
        group: 'courier',
        label: 'Service',
        kind: 'select',
        required: true,
        loadOptions: loadCourierServiceOptions,
        placeholder: '— pick a service —',
      },
      { name: 'courierType', group: 'courier', label: 'Courier type', placeholder: 'regular', description: "Normally 'regular'." },
      {
        name: 'price',
        group: 'courier',
        label: 'Shipping cost',
        kind: 'number',
        placeholder: '0',
        description: 'The quoted delivery price in whole rupiah, from a rates quote.',
      },
      { name: 'insured', group: 'courier', label: 'Insure the parcel', kind: 'checkbox' },
      {
        name: 'insurance',
        group: 'courier',
        label: 'Declared value',
        kind: 'number',
        description: 'Whole rupiah, when insured.',
      },
      {
        name: 'transactionId',
        label: 'Sale',
        placeholder: 'trx_…',
        description:
          'The POS sale this shipment fulfils, by transaction id — delivery is then tracked on that sale. Leave empty for a standalone shipment.',
      },
      {
        name: 'customerId',
        label: 'Customer',
        kind: 'select',
        loadOptions: loadPosCustomerOptions,
        placeholder: '— none —',
        description: 'The POS customer it ships to. Optional.',
      },
      {
        name: 'customerEmail',
        label: 'Tracking email',
        placeholder: 'dewi@example.com',
        description: "The recipient's email for tracking updates. Optional.",
      },
    ],
    groups: [
      { id: 'recipient', label: 'Recipient', columns: 2 },
      {
        id: 'courier',
        label: 'Courier & price',
        description:
          'Pick from a rates quote. Creating books a no-charge draft — "Book courier" on the shipments page confirms pickup.',
        columns: 2,
      },
    ],
    examplePrompts: [
      'Ship 1 kg of coffee to Dewi in Bandung 40111 with JNE regular',
      'Book the cheapest courier for this order and insure it for Rp 200.000',
      'A shipment for sale trx_… to Budi in Surabaya 60241',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const courierCode = str(fields.courierCode);
      const courierServiceCode = str(fields.courierServiceCode);
      if (!courierCode) throw new Error('Pick a courier');
      if (!courierServiceCode) throw new Error('Pick a courier service');
      // A plan proposes `destination` whole; the manual form edits the
      // modal's sub-fields. Either way one object goes on the wire.
      const destination =
        obj(fields.destination) ??
        defined({
          contactName: str(fields.contactName),
          contactPhone: str(fields.contactPhone),
          contactEmail: str(fields.contactEmail),
          address: str(fields.address),
          area: str(fields.area),
          postalCode: str(fields.postalCode),
        });
      if (!str(destination.contactName)) throw new Error('Recipient name is required');
      if (!str(destination.contactPhone)) throw new Error('Recipient phone is required');
      if (!str(destination.address)) throw new Error('Recipient address is required');
      const items = rows(fields.items).map((it) =>
        defined({
          name: str(it.name) ?? 'Item',
          quantity: num(it.quantity) ?? 1,
          weight: num(it.weight) ?? 0,
          value: num(it.value) ?? 0,
        }),
      );
      if (items.length === 0) throw new Error('Add at least one parcel item');
      const body: Record<string, unknown> = {
        destination,
        items,
        courierCode,
        courierServiceCode,
        ...defined({
          courierType: str(fields.courierType),
          price: num(fields.price),
          insured: bool(fields.insured),
          insurance: num(fields.insurance),
          transactionId: str(fields.transactionId),
          customerId: str(fields.customerId),
          customerEmail: str(fields.customerEmail),
        }),
      };
      await shipmentsApi.create(body as Parameters<typeof shipmentsApi.create>[0]);
    },
  };
}

/**
 * Mirrors the issue-license modal on /dashboard/fulfillment/licenses.
 * The product is a select over the FULFILLMENT-side products (not the
 * POS catalog); the customer is the Fulkruma customer id the modal
 * takes as text — malapos has no picker for those.
 */
function licensesResource(): CrudResource<Fields> {
  return {
    slug: 'licenses',
    label: 'license key',
    fields: [
      {
        name: 'productId',
        label: 'Product',
        kind: 'select',
        required: true,
        loadOptions: loadFulfillmentProductOptions,
        placeholder: '— pick a product —',
        description: 'The fulfillment-side product the key unlocks — not the POS catalog.',
      },
      {
        name: 'customerId',
        label: 'Customer',
        required: true,
        placeholder: 'cust_…',
        description: 'The Fulkruma customer the key is issued to, by id.',
      },
      {
        name: 'maxActivations',
        label: 'Activation limit',
        kind: 'number',
        placeholder: '3',
        description: 'How many devices/installs may activate it. Leave empty for the default.',
      },
      {
        name: 'expiresAt',
        label: 'Expires',
        kind: customKind('date'),
        description: 'Leave empty for a perpetual license.',
      },
    ],
    examplePrompts: [
      'Issue a license for the desktop app to this customer, 3 activations',
      'A perpetual license for Budi on the Pro plugin',
      'A license that expires end of next year, one activation only',
    ],
    buildAgentPrompt,
    apply: async ({ fields, initial }) => {
      const productId = parentId(fields, initial, 'productId');
      const customerId = str(fields.customerId) ?? str(initial?.customerId);
      if (!productId) throw new Error('Pick the product the key unlocks');
      if (!customerId) throw new Error('Which customer is the key issued to?');
      const body: Record<string, unknown> = {
        productId,
        customerId,
        ...defined({
          maxActivations: num(fields.maxActivations),
          expiresAt: isoInstant(fields.expiresAt),
        }),
      };
      await licensesApi.issue(body as Parameters<typeof licensesApi.issue>[0]);
    },
  };
}

/**
 * Mirrors the Adjust stock modal on /dashboard/fulfillment/inventory —
 * warehouse + delta + reason + note, with the variant the modal gets
 * from its row offered as a select over the Fulkruma variants.
 */
function fulfillmentAdjustmentsResource(): CrudResource<Fields> {
  return {
    slug: 'fulfillment-adjustments',
    label: 'warehouse stock adjustment',
    fields: [
      {
        name: 'variantId',
        label: 'Variant',
        kind: 'select',
        required: true,
        loadOptions: loadFulfillmentVariantOptions,
        placeholder: '— pick a variant —',
        description: 'The Fulkruma warehouse variant being corrected — separate from your POS stock.',
      },
      {
        name: 'warehouseId',
        label: 'Warehouse',
        kind: 'select',
        required: true,
        loadOptions: loadWarehouseOptions,
        placeholder: '— pick a warehouse —',
      },
      {
        name: 'delta',
        label: 'Delta (+/-)',
        kind: 'number',
        required: true,
        placeholder: '+5',
        description:
          'Signed integer change: +5 adds five units, -3 removes three. Going below zero fails.',
      },
      {
        name: 'reason',
        label: 'Reason',
        kind: 'select',
        required: true,
        options: [
          { value: 'manual_adjust', label: 'Manual adjustment' },
          { value: 'initial_stock', label: 'Initial stock' },
          { value: 'refund_restock', label: 'Refund restock' },
          { value: 'transfer_in', label: 'Transfer in' },
          { value: 'transfer_out', label: 'Transfer out' },
          { value: 'damaged', label: 'Damaged' },
          { value: 'returned_to_supplier', label: 'Returned to supplier' },
          { value: 'import', label: 'Import' },
        ],
      },
      {
        name: 'note',
        label: 'Note',
        description: 'Free note about the correction (max 500 characters). Optional.',
      },
    ],
    examplePrompts: [
      'Add 20 units of the 1 kg beans to the Bandung warehouse',
      'Write off 3 damaged units from the default warehouse',
      'Record initial stock of 100 for this variant',
    ],
    buildAgentPrompt,
    apply: async ({ fields, initial }) => {
      const variantId = parentId(fields, initial, 'variantId');
      const warehouseId = str(fields.warehouseId) ?? str(initial?.warehouseId);
      const delta = num(fields.delta);
      const reason = str(fields.reason);
      if (!variantId) throw new Error('Pick the variant being corrected');
      if (!warehouseId) throw new Error('Pick a warehouse');
      if (delta === undefined || !Number.isInteger(delta) || delta === 0) {
        throw new Error('Delta must be a non-zero integer');
      }
      if (!reason) throw new Error('Pick a reason');
      const body: Record<string, unknown> = {
        variantId,
        warehouseId,
        delta,
        reason,
        ...defined({ note: str(fields.note) }),
      };
      await inventoryApi.adjust(body as Parameters<typeof inventoryApi.adjust>[0]);
    },
  };
}

// ── the group registry ──────────────────────────────────────────────

/** One builder per payments/fulfillment resource. Create-only builders
 *  answer null for 'edit' (their apply CREATES — bulk-editing one would
 *  mint records); the delivery-origin singleton answers null for
 *  'create' (there is exactly one origin, only ever PATCHed). */
export const PAYFUL_BUILDERS: Record<string, ResourceBuilder> = {
  // payments module (Plugipay)
  'payment-customers': (mode) => paymentCustomersResource(mode),
  plans: (mode) => plansResource(mode),
  prices: (mode) => (mode === 'edit' ? null : pricesResource()),
  'checkout-sessions': (mode) => (mode === 'edit' ? null : checkoutSessionsResource()),
  subscriptions: (mode) => (mode === 'edit' ? null : subscriptionsResource()),
  payouts: (mode) =>
    mode === 'mark-paid' ? payoutMarkPaidResource() : mode === 'create' ? payoutsResource() : null,
  // fulfillment module (Fulkruma)
  warehouses: (mode) => warehousesResource(mode),
  'delivery-origin': (mode) => (mode === 'create' ? null : deliveryOriginResource()),
  shipments: (mode) => (mode === 'edit' ? null : shipmentsResource()),
  licenses: (mode) => (mode === 'edit' ? null : licensesResource()),
  'fulfillment-adjustments': (mode) => (mode === 'edit' ? null : fulfillmentAdjustmentsResource()),
};
