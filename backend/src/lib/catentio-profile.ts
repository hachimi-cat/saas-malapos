import type { ChatActionOut, ProductAgentProfile } from '@forjio/catentio-embed';

/**
 * What the Malapos agent may plan against — the product half of the
 * @forjio/catentio-embed contract. The engine sanitizes against exactly
 * these declarations, so a field absent here cannot be written no
 * matter what the model proposes.
 *
 * Scope decision: the agent operates the CATALOG — categories and
 * products. That is the setup typing a shop owner actually wants help
 * with ("add these 30 menu items").
 *
 * Everything that moves money or stock is out of scope AND refused at
 * the auth layer: /sales (transactions and refunds), /shifts (the cash
 * drawer), /inventory (stock levels, movements, batches),
 * /purchase-orders, /suppliers, /gift-cards, /customers, /reports.
 * A POS's transaction log is its books — an agent must not be able to
 * write a sale.
 *
 * Field sets mirror `productCreate` / `productPatch` in lib/catalog.ts
 * and the category body in routes/categories.ts.
 */

/** Per-product delegation token prefix — a leaked token names its
 *  origin. */
export const MALAPOS_DELEGATION_PREFIX = 'mpdt_';

export interface MalaposLimits {
  plan: string;
  productLimit: number;
}

export const MALAPOS_PROFILE: ProductAgentProfile<MalaposLimits> = {
  productName: 'Malapos',
  resources: {
    categories: {
      label: 'category',
      createRequired: ['name'],
      fields: [
        { key: 'name', type: 'string', create: true, edit: true, description: 'category name (≤80 chars)' },
        { key: 'sortOrder', type: 'number', create: true, edit: true, description: 'position in the category list, 0-based' },
        { key: 'isActive', type: 'boolean', create: true, edit: true, description: 'shown on the sell screen' },
      ],
    },
    products: {
      label: 'product',
      createRequired: ['name', 'price'],
      fields: [
        { key: 'name', type: 'string', create: true, edit: true, description: 'product name (≤160 chars)' },
        { key: 'description', type: 'string', create: true, edit: true, nullable: true, description: 'short description (≤2000 chars), or null' },
        { key: 'categoryId', type: 'string', create: true, edit: true, nullable: true, description: 'the category this belongs to, by id, or null' },
        { key: 'price', type: 'number', create: true, edit: true, description: 'selling price in WHOLE Indonesian rupiah (25000 = Rp 25.000), max 1000000000' },
        { key: 'sku', type: 'string', create: true, edit: true, nullable: true, description: 'stock-keeping code (≤64 chars), or null' },
        { key: 'barcode', type: 'string', create: true, edit: true, nullable: true, description: 'scannable barcode (≤64 chars), or null' },
        { key: 'kind', type: 'string', create: true, edit: true, description: "'GOODS' (a physical item) | 'SERVICE' (no stock tracking)" },
        { key: 'isActive', type: 'boolean', create: true, edit: true, description: 'sellable on the sell screen' },
      ],
    },
  },
  scopeSummary: "the shop's catalog, sales, stock, shifts, customers, or reports",
  multiStepExample: 'add a category AND the products that go in it',
  writablesSummary: 'categories and products',
  endpointsLine:
    '- Key endpoints: POST /api/v1/categories (body: name, sortOrder, isActive) · PATCH /api/v1/categories/{id} · DELETE /api/v1/categories/{id} · POST /api/v1/products · PATCH /api/v1/products/{id} · DELETE /api/v1/products/{id} · GET /api/v1/categories, /api/v1/products.',
  extraExecuteLines: [
    '- A product that belongs to a category you just created takes that category\'s "id" as "categoryId" (create the category first, read its id from the response).',
  ],
  extraNotes: [
    'Prices are WHOLE Indonesian rupiah: price 25000 means Rp 25.000. Never use minor units or another currency.',
    // The wire shape and the action shape differ here, and the agent
    // uses BOTH paths (it calls the API directly when auto-apply is on,
    // and emits action cards when it is not), so state both.
    'Malapos keeps price on a product\'s VARIANT, not on the product row. When you propose a product action, put the money in the flat "price" field above and a single default variant is created for you. When you call POST /api/v1/products yourself, the body needs a variants array instead: {"name": …, "categoryId": …, "variants": [{"name": "Default", "price": 25000}]}.',
  ],
  crossRefContractLines: [
    '- A products action that belongs to a category proposed EARLIER in this same reply sets "categoryId": "$1" ($n = 1-based index of that action).',
  ],
  bulkExample: 'add these 30 menu items',
  untrustedExamples: 'product and category names',
  gatherExamples: 'the existing categories and their ids, the current product count against your plan cap',
  executeSummaryExamples: 'the new product and its price, the category it went into, what actually changed',
  // billing.ts spells "unlimited" as the sentinel 1_000_000, not
  // Infinity, so a plain isFinite check would tell a paid shop it may
  // have "at most 1000000 products".
  limitLines: (l) =>
    l.productLimit >= 1_000_000
      ? [`- products: your ${l.plan} plan has no product limit.`]
      : [
          `- products: your ${l.plan} plan allows at most ${l.productLimit} products — creating past the cap fails with LIMIT_REACHED, so check the current count before proposing new ones.`,
        ],
  crossRefs: [
    { resource: 'products', mode: 'create', field: 'categoryId', targetResource: 'categories', targetMode: 'create' },
    { resource: 'products', mode: 'edit', field: 'categoryId', targetResource: 'categories', targetMode: 'create' },
  ],
  plan: {
    lookupSummary: 'categories and products',
  },
};

export type MalaposChatAction = ChatActionOut;
