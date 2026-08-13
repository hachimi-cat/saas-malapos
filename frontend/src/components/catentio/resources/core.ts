import type { CrudSchemaField } from '@forjio/agent-ui';
import { api } from '@/lib/api';
import type { Fields, ResourceBuilder } from '../resource-helpers';
import {
  buildAgentPrompt,
  defined,
  deleteDescriptor,
  str,
  strOrNull,
  num,
  numOrNull,
  bool,
  verbDescriptor,
  verbTargetId,
} from '../resource-helpers';

/*
 * Core POS descriptors — the ten direct-write resources every Malapos
 * workspace has regardless of modules: the catalog (categories,
 * products, modifier groups), the floor (outlets, floors, tables), the
 * supplier and customer books, POS settings and webhook subscriptions.
 *
 * Field names are the CONTRACT with backend/src/lib/catentio-profile.ts:
 * the agentic plan arrives keyed by exactly those names, so a field the
 * profile declares must exist here under the same name for the plan to
 * render and apply. Extra manual-only fields (a product's variants
 * repeater, trackStock) are allowed — the engine's sanitizer strips
 * them from agent drafts, they only serve the manual tab.
 *
 * Form parity: each descriptor mirrors the hand-built dialog on its
 * dashboard page (control kinds, row layout, guards), and `apply` calls
 * the same api-client paths the dialog calls, so a record created
 * through the sheet is indistinguishable from one typed by hand.
 *
 * EDIT applies are SPARSE: an absent field stays untouched (defined()
 * drops undefined), a nullable text field clears on '' or null, and
 * `initial.id` — the row the USER picked — is the only record ever
 * PATCHed, never one the plan names.
 */

// ── local coercion + option helpers ─────────────────────────────────

/** Nullable text the way the dialogs send it: absent stays, '' or null
 *  clears, anything else is the trimmed value. */
const textOrNull = (v: unknown): string | null | undefined =>
  v === undefined ? undefined : str(v) ?? null;

/** The record id for an edit — the sheet passes the row the USER picked
 *  in `initial`; the apply PATCHes that record, never one the plan
 *  names. */
function requireId(initial: Fields | undefined, what: string): string {
  const id = str(initial?.id);
  if (!id) throw new Error(`Missing ${what} id`);
  return id;
}

/** A `blob:` URL is the local preview of an in-flight upload; if the
 *  upload failed it is still in the draft, and persisting it stores a
 *  URL that dies with the tab. The products form drops it on submit —
 *  so does the sheet. '' clears the image (the schema is nullish). */
function durableUrl(v: unknown): string | null {
  const s = str(v);
  return s && !s.startsWith('blob:') ? s : null;
}

/** Multi-value control output as a trimmed string array; undefined when
 *  empty so create falls back to the server default. */
function strArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const arr = v.map((x) => String(x).trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

/** Repeater rows on the way out: keep only rows where at least one of
 *  the `keys` is set — the all-blank row is what "+ Add" leaves behind
 *  before anything is typed. Undefined in, undefined out, so an
 *  untouched repeater stays absent from the payload. */
function rows(v: unknown, keys: string[]): Fields[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return (v as unknown[])
    .filter((r): r is Fields => typeof r === 'object' && r !== null)
    .filter((r) => keys.some((k) => str(r[k]) !== undefined || num(r[k]) !== undefined));
}

/** Options loaders — scoped to the merchant's own workspace, so the
 *  list is also the only set of ids that can succeed. A fetch failure
 *  leaves an empty list rather than blocking the sheet. */
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

const loadCategoryOptions = () =>
  loadOptions(
    async () => {
      const res = await api.get<{ categories: { id: string; name: string }[] }>('/categories');
      return res.data.categories ?? [];
    },
    (c) => ({ value: c.id, label: c.name }),
  );

const loadOutletOptions = () =>
  loadOptions(
    async () => {
      const res = await api.get<{ outlets: { id: string; name: string }[] }>('/outlets');
      return res.data.outlets ?? [];
    },
    (o) => ({ value: o.id, label: o.name }),
  );

const loadFloorOptions = (outletId: string) =>
  loadOptions(
    async () => {
      const res = await api.get<{ floors: { id: string; name: string }[] }>(
        `/floors?outletId=${encodeURIComponent(outletId)}`,
      );
      return res.data.floors ?? [];
    },
    (f) => ({ value: f.id, label: f.name }),
  );

// ── catalog ─────────────────────────────────────────────────────────

const categoriesResource: ResourceBuilder = (mode) => {
  if (mode === 'delete') {
    return deleteDescriptor({
      slug: 'categories',
      label: 'category',
      del: (id) => api.delete(`/categories/${encodeURIComponent(id)}`),
    });
  }
  return {
  slug: 'categories',
  label: 'category',
  // The CategoryModal is name-only (sortOrder/isActive are managed from
  // the list); the profile declares all three as agent-writable, so the
  // sheet carries all three — a plan that reorders or hides a category
  // must have somewhere to land.
  fields: [
    {
      name: 'name',
      label: 'Name',
      required: mode === 'create',
      placeholder: 'e.g. Drinks',
      description: 'Shown on the sell screen (max 80 characters).',
    },
    {
      name: 'sortOrder',
      label: 'Sort order',
      kind: 'number',
      placeholder: '0',
      description: 'Position in the category list, lowest first.',
    },
    {
      name: 'isActive',
      label: 'Active',
      kind: 'checkbox',
      description: 'Shown on the sell screen.',
    },
  ],
  examplePrompts:
    mode === 'create'
      ? [
          'Add a Drinks category',
          'Create categories for Food, Drinks and Desserts',
          'A Snacks category, hidden from the sell screen for now',
        ]
      : [
          'Rename this to Beverages',
          'Move it to the top of the list',
          'Hide this category from the sell screen',
        ],
  buildAgentPrompt,
  // The created record is RETURNED (unwrapped from the {category}
  // envelope) so a `$n` cross-ref in the docked chat can read its id.
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    const body = defined({
      name: str(f.name),
      sortOrder: num(f.sortOrder),
      isActive: bool(f.isActive),
    });
    if (applyMode === 'edit') {
      await api.patch(`/categories/${encodeURIComponent(requireId(initial, 'category'))}`, body);
      return;
    }
    if (!body.name) throw new Error('A category needs a name');
    const res = await api.post<{ category?: unknown }>('/categories', body);
    return res.data?.category;
  },
  };
};

/** The ProductModal's variant rows: name / price / cost / SKU on one
 *  4-up line, barcode full-width under it. sortOrder is not in the
 *  modal's rows and is not collected here either. */
const VARIANT_ROW_FIELDS: CrudSchemaField[] = [
  { name: 'name', label: 'Name', placeholder: 'Default', colSpan: 1 },
  { name: 'price', label: 'Price', kind: 'number', placeholder: '25000', colSpan: 1 },
  { name: 'cost', label: 'Cost', kind: 'number', placeholder: '15000', colSpan: 1 },
  { name: 'sku', label: 'SKU', colSpan: 1 },
  { name: 'barcode', label: 'Barcode (optional)', colSpan: 4 },
];

/** The set-category picker's own "clear it" row — the same "Remove
 *  category" the products page's batch dialog offers. `null` on the
 *  wire clears; the sentinel only has to survive a <select>. */
const CLEAR_CATEGORY = 'none';

/** What the batch route should store: a real id, or null to clear. A
 *  plan may say null outright; the manual select says 'none'. */
function categoryTarget(v: unknown): string | null {
  if (v === null) return null;
  const s = str(v);
  return !s || s === CLEAR_CATEGORY ? null : s;
}

/**
 * `set-category` — the one merchant-plane verb malapos backs with a
 * REAL server-side batch route (POST /products/bulk-category, 1-500
 * ids in one transaction). The single-record apply posts a one-id
 * batch so both paths hit the same route with the same body shape, and
 * `applyMany` hands the whole selection over at once (the batch verb
 * sheet prefers it — see buildBulkVerbResource).
 *
 * Declared as a direct write in the profile (wave-2 reconciliation):
 * the route already rode the products prefix grant, so this closes the
 * gap between what the agent may call and what it is told it may call.
 */
function productsSetCategoryResource() {
  const post = async (ids: string[], categoryId: string | null) => {
    // The route takes 1-500 ids in one transaction. Say so in the
    // merchant's own terms rather than surfacing a raw zod complaint
    // about `productIds`.
    if (ids.length > 500) {
      throw new Error(`Move at most 500 products at a time — ${ids.length} are selected.`);
    }
    return api.post('/products/bulk-category', { productIds: ids, categoryId });
  };
  return {
    ...verbDescriptor({
      slug: 'products',
      label: 'product',
      title: 'Set product category',
      confirmLabel: 'Set category',
      fields: [
        {
          name: 'categoryId',
          label: 'Category',
          kind: 'select',
          required: true,
          loadOptions: async () => [
            ...(await loadCategoryOptions()),
            { value: CLEAR_CATEGORY, label: 'Remove category' },
          ],
          placeholder: 'Move to category…',
          description:
            'Where these products sit on the sell screen. Pick "Remove category" to leave them uncategorized.',
        },
      ],
      examplePrompts: ['Move these into Minuman', 'Take the category off these'],
      apply: ({ fields, initial }) =>
        post([verbTargetId(initial, 'product')], categoryTarget(fields.categoryId)),
    }),
    // One request for the whole selection — atomic, and the server's
    // own message on failure (nothing partially moved).
    applyMany: ({ targets, fields }: { targets: Fields[]; fields: Fields }) =>
      post(
        targets.map((t) => verbTargetId(t, 'product')),
        categoryTarget(fields.categoryId),
      ),
  };
}

const productsResource: ResourceBuilder = (mode) => {
  if (mode === 'set-category') return productsSetCategoryResource();
  if (mode === 'delete') {
    return deleteDescriptor({
      slug: 'products',
      label: 'product',
      del: (id) => api.delete(`/products/${encodeURIComponent(id)}`),
    });
  }
  return {
  slug: 'products',
  label: 'product',
  fields: [
    {
      name: 'name',
      label: 'Name',
      required: mode === 'create',
      placeholder: 'e.g. Paracetamol 500mg',
      description: 'Product name (max 160 characters).',
    },
    {
      name: 'description',
      label: 'Description (optional)',
      kind: 'textarea',
      description: 'Max 2000 characters.',
    },
    {
      name: 'categoryId',
      label: 'Category (optional)',
      kind: 'select',
      loadOptions: loadCategoryOptions,
      placeholder: 'No category',
      group: 'classify',
      description: 'Groups the product on the sell screen. Leave empty for none.',
    },
    {
      name: 'kind',
      label: 'Kind',
      kind: 'select',
      group: 'classify',
      options: [
        { value: 'GOODS', label: 'Goods' },
        { value: 'SERVICE', label: 'Service' },
      ],
      description: 'Services track no stock by default.',
    },
    {
      name: 'trackStock',
      label: 'Track stock',
      kind: 'checkbox',
      description: 'Leave unset to follow the kind: goods do, services do not.',
    },
    {
      name: 'requiresBatch',
      label: 'Track batches/expiry (pharmacy)',
      kind: 'checkbox',
    },
    { name: 'imageUrl', label: 'Image (optional)', kind: 'image' },
    {
      name: 'variants',
      label: 'Variants',
      kind: 'repeater',
      addLabel: '+ Add variant',
      rowColumns: 4,
      itemFields: VARIANT_ROW_FIELDS,
      description:
        mode === 'create'
          ? 'Price lives on the variant. Leave empty for a single Default variant at the price the assistant proposes.'
          : 'Careful: submitting rows REPLACES the whole variant list. Leave untouched to keep the current variants.',
    },
    {
      name: 'isActive',
      label: 'Active',
      kind: 'checkbox',
      description: 'Sellable on the sell screen.',
    },
  ],
  groups: [{ id: 'classify', tone: 'plain', columns: 2 }],
  examplePrompts:
    mode === 'create'
      ? [
          'Es kopi susu at Rp 18.000 in the Drinks category',
          'A service called Ojek delivery at Rp 10.000 — no stock tracking',
          'Paracetamol 500mg at Rp 12.000 with batch and expiry tracking',
        ]
      : [
          'Change the price to Rp 20.000',
          'Move this into the Drinks category',
          'Rewrite the description and set the SKU to KOPI-01',
        ],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    const base = defined({
      name: str(f.name),
      description: textOrNull(f.description),
      categoryId: textOrNull(f.categoryId),
      kind: str(f.kind),
      trackStock: bool(f.trackStock),
      requiresBatch: bool(f.requiresBatch),
      imageUrl: f.imageUrl !== undefined ? durableUrl(f.imageUrl) : undefined,
      isActive: bool(f.isActive),
    });

    // Repeater rows, the modal's shape: create rows omit blank codes,
    // edit rows send null so clearing a code persists; rows keep their
    // id so the PATCH reconcile updates instead of recreating.
    const typed = rows(f.variants, ['name', 'price']);
    const rowVariants = typed?.map((v) =>
      defined({
        id: str(v.id),
        name: str(v.name),
        // The modal initialises a row's price to 0; a blank cell on
        // create means the same (the price-> 0 check below still guards).
        price: num(v.price) ?? (applyMode === 'create' ? 0 : undefined),
        cost: num(v.cost),
        sku: applyMode === 'edit' ? textOrNull(v.sku) : str(v.sku),
        barcode: applyMode === 'edit' ? textOrNull(v.barcode) : str(v.barcode),
      }),
    );
    // The agent's flat shape (catentio-profile): price/sku/barcode ride
    // on a single Default variant when no rows were typed.
    const flatVariant = defined({
      name: 'Default',
      price: num(f.price),
      sku: strOrNull(f.sku),
      barcode: strOrNull(f.barcode),
    });

    if (applyMode === 'edit') {
      const id = requireId(initial, 'product');
      // PATCH replaces the whole variant list, so only send it when a
      // variant-level field was actually set — otherwise an edit that
      // only renames a product would wipe its SKUs and prices
      // (chat-actions.ts touchesVariant, replicated).
      const touchesVariant =
        (rowVariants !== undefined && rowVariants.length > 0) ||
        f.price !== undefined ||
        f.sku !== undefined ||
        f.barcode !== undefined;
      const variants =
        rowVariants && rowVariants.length > 0 ? rowVariants : [flatVariant];
      await api.patch(
        `/products/${encodeURIComponent(id)}`,
        touchesVariant ? { ...base, variants } : base,
      );
      return;
    }

    if (!base.name) throw new Error('A product needs a name');
    let variants: Record<string, unknown>[];
    if (rowVariants && rowVariants.length > 0) {
      if (!rowVariants.some((v) => typeof v.price === 'number' && v.price > 0)) {
        throw new Error('Add at least one variant with a price');
      }
      variants = rowVariants;
    } else {
      if (num(f.price) === undefined) throw new Error('A product needs a price');
      variants = [flatVariant];
    }
    await api.post('/products', { ...base, variants });
  },
  };
};

const modifiersResource: ResourceBuilder = (mode) => ({
  slug: 'modifiers',
  label: 'modifier group',
  // The GroupModal speaks in Required / Allow-multiple checkboxes and
  // derives minSelect/maxSelect from them; the wire (and the agent
  // contract) is the numbers, so the sheet collects the numbers.
  fields: [
    {
      name: 'name',
      label: 'Name',
      required: mode === 'create',
      placeholder: 'e.g. Sugar level',
      description: 'What the group is called on the sell screen (max 80 characters).',
    },
    {
      name: 'minSelect',
      label: 'Min selections',
      kind: 'number',
      group: 'limits',
      placeholder: '0',
      description: '1 or more makes the group required; 0 keeps it optional.',
    },
    {
      name: 'maxSelect',
      label: 'Max selections',
      kind: 'number',
      group: 'limits',
      placeholder: '1',
      description: '1 = single choice; more allows multiple.',
    },
    {
      name: 'sortOrder',
      label: 'Sort order',
      kind: 'number',
      placeholder: '0',
      description: 'Position among modifier groups, lowest first.',
    },
    ...(mode === 'create'
      ? [
          {
            name: 'modifiers',
            label: 'Options',
            kind: 'repeater',
            addLabel: '+ Add option',
            rowColumns: 4,
            itemFields: [
              { name: 'name', label: 'Name', placeholder: 'Less sugar', colSpan: 2 },
              { name: 'price', label: 'Extra charge', kind: 'number', placeholder: '0', colSpan: 1 },
              { name: 'sortOrder', label: 'Sort', kind: 'number', placeholder: '0', colSpan: 1 },
            ],
            description:
              'The choices inside the group. Price is the extra charge in whole rupiah — 0 for free. After creating, options are managed from the group card.',
          } satisfies CrudSchemaField,
        ]
      : []),
  ],
  groups: [{ id: 'limits', tone: 'plain', columns: 2 }],
  examplePrompts:
    mode === 'create'
      ? [
          'A Sugar level group with Less sugar, Normal and Extra sweet — all free',
          'An Extra shot group, up to 2 selections, Rp 5.000 each',
          'A required Size group: Small, Medium +3000, Large +5000',
        ]
      : [
          'Make this group required',
          'Allow up to 3 selections',
          'Rename it to Sweetness',
        ],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    const body = defined({
      name: str(f.name),
      minSelect: num(f.minSelect),
      maxSelect: num(f.maxSelect),
      sortOrder: num(f.sortOrder),
    });
    if (applyMode === 'edit') {
      await api.patch(`/modifiers/${encodeURIComponent(requireId(initial, 'modifier group'))}`, body);
      return;
    }
    if (!body.name) throw new Error('A modifier group needs a name');
    // Nested options are create-only (POST creates group + modifiers in
    // one call); rows without a name are dropped, the modal's own rule.
    const options = rows(f.modifiers, ['name'])
      ?.filter((m) => str(m.name) !== undefined)
      .map((m) =>
        defined({ name: str(m.name), price: num(m.price), sortOrder: num(m.sortOrder) }),
      );
    await api.post(
      '/modifiers',
      options && options.length > 0 ? { ...body, modifiers: options } : body,
    );
  },
});

// ── the floor ───────────────────────────────────────────────────────

const outletsResource: ResourceBuilder = (mode) => ({
  slug: 'outlets',
  label: 'outlet',
  fields: [
    {
      name: 'name',
      label: 'Name',
      required: mode === 'create',
      placeholder: 'Main Store',
      description: 'Store location name (max 120 characters).',
    },
    { name: 'address', label: 'Address', placeholder: 'Jl. Sudirman No. 1' },
    { name: 'phone', label: 'Phone', group: 'contact', placeholder: '+62…' },
    {
      name: 'timezone',
      label: 'Timezone',
      group: 'contact',
      placeholder: 'Asia/Jakarta',
      description: 'IANA timezone for shifts and reports.',
    },
    {
      name: 'taxRateBps',
      label: 'Tax rate (basis points)',
      kind: 'number',
      placeholder: '1100',
      // The OutletModal speaks percent and converts on the wire; the
      // wire (and the agent contract) is basis points, so the sheet
      // collects basis points and says so.
      description: 'Basis points of 10000 — 1100 = 11% PPN, 0 = no tax.',
    },
    {
      name: 'taxInclusive',
      label: 'Prices include tax',
      kind: 'checkbox',
      description: 'Unchecked adds the tax on top at checkout.',
    },
    {
      name: 'receiptHeader',
      label: 'Receipt header',
      kind: 'textarea',
      placeholder: 'Shown at the top of printed receipts',
    },
    {
      name: 'receiptFooter',
      label: 'Receipt footer',
      kind: 'textarea',
      placeholder: 'Thank you for shopping with us!',
    },
    ...(mode === 'edit'
      ? [
          {
            name: 'isActive',
            label: 'Active',
            kind: 'checkbox',
            description: 'Whether the outlet can be picked on the sell screen.',
          } satisfies CrudSchemaField,
        ]
      : []),
  ],
  groups: [{ id: 'contact', tone: 'plain', columns: 2 }],
  examplePrompts:
    mode === 'create'
      ? [
          'A Main Store outlet on Jl. Sudirman with 11% tax',
          'Add our Bandung branch — prices include tax',
          'A new outlet in the Asia/Makassar timezone',
        ]
      : [
          'Set the tax rate to 11%',
          'Change the receipt footer to say Terima kasih!',
          'Update the phone number',
        ],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    const body = defined({
      name: str(f.name),
      address: textOrNull(f.address),
      phone: textOrNull(f.phone),
      // Non-nullable on the wire (PATCH rejects null): blank leaves the
      // stored timezone alone.
      timezone: str(f.timezone),
      taxRateBps: num(f.taxRateBps),
      taxInclusive: bool(f.taxInclusive),
      receiptHeader: textOrNull(f.receiptHeader),
      receiptFooter: textOrNull(f.receiptFooter),
    });
    if (applyMode === 'edit') {
      await api.patch(`/outlets/${encodeURIComponent(requireId(initial, 'outlet'))}`, {
        ...body,
        ...defined({ isActive: bool(f.isActive) }),
      });
      return;
    }
    if (!body.name) throw new Error('An outlet needs a name');
    // Returned (unwrapped) for `$n` cross-refs — a tables/floors action
    // may reference the outlet created earlier in the same reply.
    const res = await api.post<{ outlet?: unknown }>('/outlets', body);
    return res.data?.outlet;
  },
});

const tablesResource: ResourceBuilder = (mode) => ({
  slug: 'tables',
  label: 'dine-in table',
  // The TableModal collects label/zone/seats/sortOrder and takes the
  // outlet + floor from the page's own pickers; the sheet has no page
  // context, so outlet (create) and floor become fields. Shape/size are
  // profile-writable too (the layout canvas is where the merchant sets
  // them by hand); posX/posY stay canvas-only and are NOT collected.
  fields: [
    ...(mode === 'create'
      ? [
          {
            name: 'outletId',
            label: 'Outlet',
            kind: 'select',
            required: true,
            loadOptions: loadOutletOptions,
            description: 'The outlet this table belongs to.',
          } satisfies CrudSchemaField,
        ]
      : []),
    {
      name: 'label',
      label: 'Label',
      required: mode === 'create',
      placeholder: 'Table 5',
      description: 'Must be unique per outlet (max 60 characters).',
    },
    { name: 'zone', label: 'Zone', group: 'where', placeholder: 'Indoor' },
    {
      name: 'seats',
      label: 'Seats',
      kind: 'number',
      group: 'where',
      placeholder: '4',
    },
    {
      name: 'sortOrder',
      label: 'Sort order',
      kind: 'number',
      placeholder: '0',
      description: 'Position in table lists, lowest first.',
    },
    {
      name: 'shape',
      label: 'Shape',
      kind: 'select',
      group: 'map',
      options: [
        { value: 'SQUARE', label: 'Square' },
        { value: 'ROUND', label: 'Round' },
        { value: 'RECT', label: 'Rectangle' },
      ],
    },
    { name: 'width', label: 'Width (cells)', kind: 'number', group: 'map', placeholder: '2' },
    { name: 'height', label: 'Height (cells)', kind: 'number', group: 'map', placeholder: '2' },
    ...(mode === 'edit'
      ? [
          {
            name: 'isActive',
            label: 'Active',
            kind: 'checkbox',
            description: 'Whether the table shows on the floor map and can seat a bill.',
          } satisfies CrudSchemaField,
        ]
      : []),
  ],
  groups: [
    { id: 'where', tone: 'plain', columns: 2 },
    {
      id: 'map',
      label: 'Floor map',
      columns: 3,
      description:
        'How the table is drawn on the layout canvas (1–12 grid cells). Placement itself happens on the Tables page’s layout editor.',
    },
  ],
  // The floor choice depends on the chosen outlet, exactly like the
  // page (it loads /floors?outletId= for its own outlet picker), so it
  // is a dynamic field keyed on the draft's outletId — on edit the
  // outlet rides in from `initial` even though no field renders it.
  dynamicFields: {
    key: (draft) => str(draft.outletId) ?? '',
    load: async (outletId): Promise<CrudSchemaField[]> => {
      if (!outletId) return [];
      const options = await loadFloorOptions(outletId);
      return [
        {
          name: 'floorId',
          label: 'Floor',
          kind: 'select',
          options,
          placeholder: mode === 'create' ? '— first floor —' : '— keep current —',
          description:
            mode === 'create'
              ? "Where the table sits. Leave empty for the outlet's first floor."
              : 'Move the table to another floor of the same outlet.',
        },
      ];
    },
    insertAfter: mode === 'create' ? 'outletId' : 'label',
  },
  examplePrompts:
    mode === 'create'
      ? [
          'Add table T1 with 4 seats',
          'Six round tables in the Terrace zone',
          'A big 8-seat table called Family 1 on the Rooftop floor',
        ]
      : [
          'Rename this to Window 2',
          'Move it to the Rooftop floor',
          'Make it a round table with 6 seats',
        ],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    const body = defined({
      label: str(f.label),
      zone: textOrNull(f.zone),
      seats: f.seats === undefined ? undefined : numOrNull(f.seats),
      sortOrder: num(f.sortOrder),
      shape: str(f.shape),
      width: num(f.width),
      height: num(f.height),
    });
    if (applyMode === 'edit') {
      await api.patch(`/tables/${encodeURIComponent(requireId(initial, 'table'))}`, {
        ...body,
        // PATCH floorId is move-only (never null): blank keeps the floor.
        ...defined({ floorId: str(f.floorId), isActive: bool(f.isActive) }),
      });
      return;
    }
    const outletId = str(f.outletId);
    if (!outletId) throw new Error('Pick an outlet for the table');
    if (!body.label) throw new Error('A table needs a label');
    await api.post('/tables', {
      outletId,
      // Omitted → the outlet's first floor, the server's own default.
      ...defined({ floorId: str(f.floorId) }),
      ...body,
    });
  },
});

const floorsResource: ResourceBuilder = (mode) => ({
  slug: 'floors',
  label: 'floor',
  fields: [
    ...(mode === 'create'
      ? [
          {
            name: 'outletId',
            label: 'Outlet',
            kind: 'select',
            required: true,
            loadOptions: loadOutletOptions,
            description: 'The outlet this floor belongs to.',
          } satisfies CrudSchemaField,
        ]
      : []),
    {
      name: 'name',
      label: 'Floor name',
      required: mode === 'create',
      placeholder: 'e.g. Ground Floor, Rooftop',
      description: 'Must be unique per outlet (max 60 characters).',
    },
    {
      name: 'sortOrder',
      label: 'Sort order',
      kind: 'number',
      placeholder: '0',
      description: 'Position among the outlet’s floor tabs, lowest first.',
    },
  ],
  examplePrompts:
    mode === 'create'
      ? ['Add a Rooftop floor', 'Create Ground Floor and Mezzanine floors for the Main Store']
      : ['Rename this floor to Lantai 2', 'Move it to the front of the tab order'],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    const body = defined({ name: str(f.name), sortOrder: num(f.sortOrder) });
    if (applyMode === 'edit') {
      await api.patch(`/floors/${encodeURIComponent(requireId(initial, 'floor'))}`, body);
      return;
    }
    const outletId = str(f.outletId);
    if (!outletId) throw new Error('Pick an outlet for the floor');
    if (!body.name) throw new Error('A floor needs a name');
    // Returned (unwrapped) for `$n` cross-refs — a tables action may
    // reference the floor created earlier in the same reply.
    const res = await api.post<{ floor?: unknown }>('/floors', { outletId, ...body });
    return res.data?.floor;
  },
});

// ── the books ───────────────────────────────────────────────────────

const suppliersResource: ResourceBuilder = (mode) => ({
  slug: 'suppliers',
  label: 'supplier',
  fields: [
    {
      name: 'name',
      label: 'Name',
      required: mode === 'create',
      placeholder: 'PT Sumber Sehat',
      description: 'Vendor name (max 160 characters).',
    },
    { name: 'contact', label: 'Contact person', group: 'reach', placeholder: 'Budi' },
    { name: 'phone', label: 'Phone', group: 'reach', placeholder: '+62…' },
    { name: 'email', label: 'Email', placeholder: 'sales@supplier.co.id' },
    { name: 'address', label: 'Address', placeholder: 'Jl. Industri No. 5' },
    {
      name: 'note',
      label: 'Note',
      kind: 'textarea',
      placeholder: 'Payment terms, lead time, etc.',
    },
    ...(mode === 'edit'
      ? [
          {
            name: 'isActive',
            label: 'Active',
            kind: 'checkbox',
            description: 'Whether the supplier can be picked on new purchase orders.',
          } satisfies CrudSchemaField,
        ]
      : []),
  ],
  groups: [{ id: 'reach', tone: 'plain', columns: 2 }],
  examplePrompts:
    mode === 'create'
      ? [
          'PT Sumber Sehat, contact Budi, phone +62 812 3456 7890',
          'Add our coffee bean supplier with their payment terms in the note',
        ]
      : [
          'Update the phone number',
          'Note that they only deliver on Tuesdays',
          'Deactivate this supplier',
        ],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    const body = defined({
      name: str(f.name),
      contact: textOrNull(f.contact),
      phone: textOrNull(f.phone),
      email: textOrNull(f.email),
      address: textOrNull(f.address),
      note: textOrNull(f.note),
    });
    if (applyMode === 'edit') {
      await api.patch(`/suppliers/${encodeURIComponent(requireId(initial, 'supplier'))}`, {
        ...body,
        ...defined({ isActive: bool(f.isActive) }),
      });
      return;
    }
    if (!body.name) throw new Error('A supplier needs a name');
    // Returned (unwrapped) for `$n` cross-refs — a purchase-orders
    // action may reference the supplier created earlier in the reply.
    const res = await api.post<{ supplier?: unknown }>('/suppliers', body);
    return res.data?.supplier;
  },
});

const customersResource: ResourceBuilder = (mode) => {
  if (mode === 'delete') {
    return deleteDescriptor({
      slug: 'customers',
      label: 'customer',
      del: (id) => api.delete(`/customers/${encodeURIComponent(id)}`),
    });
  }
  return {
  slug: 'customers',
  label: 'customer',
  fields: [
    {
      name: 'name',
      label: 'Name',
      required: mode === 'create',
      description: 'The walk-in customer’s name in the POS contact book (max 120 characters).',
    },
    { name: 'phone', label: 'Phone (optional)', placeholder: '+62…' },
    { name: 'email', label: 'Email (optional)', placeholder: 'sari@example.com' },
    { name: 'note', label: 'Note (optional)', kind: 'textarea' },
  ],
  examplePrompts:
    mode === 'create'
      ? [
          'Add Ibu Sari, phone 0812 3456 7890',
          'A customer named Budi with a note that he prefers WhatsApp',
        ]
      : ['Update her phone number', 'Add a note about the weekly standing order'],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    const body = defined({
      name: str(f.name),
      phone: textOrNull(f.phone),
      email: textOrNull(f.email),
      note: textOrNull(f.note),
    });
    if (applyMode === 'edit') {
      await api.patch(`/customers/${encodeURIComponent(requireId(initial, 'customer'))}`, body);
      return;
    }
    if (!body.name) throw new Error('A customer needs a name');
    // Returned (unwrapped) for `$n` cross-refs — a gift-cards action
    // may reference the customer created earlier in the same reply.
    const res = await api.post<{ customer?: unknown }>('/customers', body);
    return res.data?.customer;
  },
  };
};

// ── configuration ───────────────────────────────────────────────────

/** Edit-only singleton (PUT /settings upserts the one row per
 *  workspace) — there is nothing to create, so create mode has no
 *  sheet. The transferBank* fields on the same route are deliberately
 *  NOT declared: the route strips them from delegated writes and the
 *  agent contract never carries them. */
const settingsResource: ResourceBuilder = (mode) =>
  mode === 'create'
    ? null
    : {
        slug: 'settings',
        label: 'POS settings',
        fields: [
          {
            name: 'businessName',
            label: 'Business name',
            placeholder: 'e.g. Toko Sumber Rejeki',
            description: 'Shown across the dashboard and receipts (max 120 characters).',
          },
          {
            name: 'businessType',
            label: 'Business type',
            kind: 'select',
            options: [
              { value: 'GENERAL', label: 'General' },
              { value: 'RETAIL', label: 'Retail' },
              { value: 'FNB', label: 'F&B' },
              { value: 'PHARMACY', label: 'Pharmacy' },
            ],
            description:
              'Drives sell-screen affordances: Retail leads with barcode/SKU, F&B with menus and tables, Pharmacy with batch/expiry tracking.',
          },
          {
            name: 'currency',
            label: 'Currency',
            placeholder: 'IDR',
            description: 'Only IDR (Indonesian Rupiah) is supported in v1.',
          },
        ],
        examplePrompts: [
          'Set the business name to Toko Sumber Rejeki',
          'Switch the business type to F&B',
          'We are a pharmacy — turn on the pharmacy affordances',
        ],
        buildAgentPrompt,
        apply: async ({ fields: f }) => {
          // Singleton: no id — PUT upserts the workspace's one row, and
          // the route accepts a partial body, so sparse still applies.
          await api.put(
            '/settings',
            defined({
              businessName: textOrNull(f.businessName),
              businessType: str(f.businessType),
              currency: str(f.currency),
            }),
          );
        },
      };

/** Webhook event catalog — the AddEndpointDialog's checkbox list, as
 *  multi-select options ('*' is the dialog's "All events"). */
const WEBHOOK_EVENT_OPTIONS = [
  { value: '*', label: 'All events (*)' },
  { value: 'malapos.sale.completed.v1', label: 'malapos.sale.completed.v1' },
  { value: 'malapos.sale.voided.v1', label: 'malapos.sale.voided.v1' },
  { value: 'malapos.billing.subscribed.v1', label: 'malapos.billing.subscribed.v1' },
  { value: 'malapos.billing.canceled.v1', label: 'malapos.billing.canceled.v1' },
];

const webhookSubscriptionsResource: ResourceBuilder = (mode) => {
  if (mode === 'delete') {
    return deleteDescriptor({
      slug: 'webhook-subscriptions',
      label: 'webhook subscription',
      del: (id) => api.delete(`/webhook-subscriptions/${encodeURIComponent(id)}`),
    });
  }
  return {
  slug: 'webhook-subscriptions',
  label: 'webhook subscription',
  // Create and edit share almost nothing here: an endpoint's url and
  // events are fixed once created (rotate = delete + re-add), and the
  // PATCH accepts exactly { active } — so edit mode is the pause/resume
  // switch and nothing else.
  fields:
    mode === 'create'
      ? [
          {
            name: 'url',
            label: 'Endpoint URL',
            required: true,
            placeholder: 'https://example.com/webhooks/malapos',
            description:
              'The http(s) URL Malapos POSTs events to. The signing secret is shown once, right after creating.',
          },
          {
            name: 'events',
            label: 'Events',
            kind: 'combobox',
            multi: true,
            options: WEBHOOK_EVENT_OPTIONS,
            placeholder: '— all events —',
            description: 'Leave empty to subscribe to every event (*).',
          },
        ]
      : [
          {
            name: 'active',
            label: 'Active',
            kind: 'checkbox',
            description: 'Pause (off) or resume (on) delivery to this endpoint.',
          },
        ],
  examplePrompts:
    mode === 'create'
      ? [
          'Send sale.completed events to https://example.com/hooks/pos',
          'Subscribe an endpoint to every event',
        ]
      : ['Pause delivery to this endpoint', 'Resume this endpoint'],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields: f, initial }) => {
    if (applyMode === 'edit') {
      const active = bool(f.active);
      // PATCH requires the flag — nothing else on the record is editable.
      if (active === undefined) {
        throw new Error('Active is the only editable field — set it on or off');
      }
      await api.patch(
        `/webhook-subscriptions/${encodeURIComponent(requireId(initial, 'webhook subscription'))}`,
        { active },
      );
      return;
    }
    const url = str(f.url);
    if (!url) throw new Error('A webhook endpoint needs a URL');
    await api.post(
      '/webhook-subscriptions',
      defined({
        url,
        // Omitted → the server's own default, every event ('*').
        events: strArr(f.events),
      }),
    );
  },
  };
};

// ── the group registry ──────────────────────────────────────────────

export const CORE_BUILDERS: Record<string, ResourceBuilder> = {
  categories: categoriesResource,
  products: productsResource,
  modifiers: modifiersResource,
  outlets: outletsResource,
  tables: tablesResource,
  floors: floorsResource,
  suppliers: suppliersResource,
  customers: customersResource,
  settings: settingsResource,
  'webhook-subscriptions': webhookSubscriptionsResource,
};
