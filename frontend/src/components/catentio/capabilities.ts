import type { AssistantResource } from '@/hooks/use-catentio';

/**
 * The assistant capability tables, in a module with NO heavy imports.
 *
 * They used to live in resources.ts, which pulls in the api client and
 * every descriptor builder — fine for the sheet (loaded on demand), too
 * heavy for agentic-entry.tsx, which sits statically on most dashboard
 * pages and needs these tables to decide which actions the page-level
 * picker offers. resources.ts re-exports both, so its import sites and
 * the registry tests are unchanged.
 */

/** `+ New` batches for these — {noun, rowKeys} drive the bulk-create
 *  repeater + pasted-CSV section inside the create sheet. */
export const BULK: Partial<Record<AssistantResource, { noun: string; rowKeys?: string[] }>> = {
  products: { noun: 'product', rowKeys: ['name'] },
  categories: { noun: 'category', rowKeys: ['name'] },
  modifiers: { noun: 'modifier group', rowKeys: ['name'] },
  customers: { noun: 'customer', rowKeys: ['name', 'email'] },
  suppliers: { noun: 'supplier', rowKeys: ['name'] },
  tables: { noun: 'table', rowKeys: ['label'] },
  'gift-cards': { noun: 'gift card', rowKeys: ['code'] },
  'discount-codes': { noun: 'discount code', rowKeys: ['code'] },
  'payment-customers': { noun: 'payment customer', rowKeys: ['email'] },
  warehouses: { noun: 'warehouse', rowKeys: ['name'] },
  licenses: { noun: 'license', rowKeys: ['customerId'] },
};

/**
 * The resources the list pages offer "Edit N selected" on — and the
 * ONLY resources any edit-mode sheet may open for, page-level picker
 * included. An explicit list, not a derivation, because the descriptor
 * dispatch returns a builder for EVERY resource whatever the mode — a
 * create-only builder ignores `mode` and its apply CREATES, so
 * "editing" it would mint new records instead of touching the selected
 * ones. Only resources whose builder genuinely branches on mode belong
 * here.
 */
export const BULK_EDIT_RESOURCES: AssistantResource[] = [
  'products',
  'categories',
  'modifiers',
  'outlets',
  'tables',
  'suppliers',
  'customers',
  'webhook-subscriptions',
  'discount-codes',
  'plans',
  'warehouses',
  'payment-customers',
  'marketing-campaigns',
  'blog-posts',
  'funnels',
];
