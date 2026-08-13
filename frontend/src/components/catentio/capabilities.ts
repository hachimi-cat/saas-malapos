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

/**
 * Verbs beyond the create/edit pair, per resource — the frontend
 * mirror of the profile's declared ActionSpecs
 * (backend/src/lib/catentio-profile.ts, wave 1). A verb added to the
 * profile without a builder arm here (or vice versa) is a card that
 * renders and then fails on Apply — keep the two in step.
 */
export const RESOURCE_EXTRA_ACTIONS: Partial<Record<AssistantResource, readonly string[]>> = {
  categories: ['delete'],
  products: ['set-category', 'delete'],
  customers: ['delete'],
  'webhook-subscriptions': ['delete'],
  'blog-posts': ['publish', 'unpublish', 'delete'],
  payouts: ['mark-paid'],
  'affiliate-enrollments': ['approve'],
  'affiliate-commissions': ['approve', 'void'],
};

/** Resources whose profile declares NO create/edit — only verbs. The
 *  classic pair must be REFUSED for them: their builder has one arm per
 *  verb and no form, so falling into "not edit means create" would be a
 *  descriptor with nothing in it. */
const VERB_ONLY_RESOURCES: readonly AssistantResource[] = [
  'affiliate-enrollments',
  'affiliate-commissions',
];

/** May this (resource, mode) pair reach the descriptor registry at
 *  all? The BFF's sanitizer already drops undeclared actions server-
 *  side; this is the frontend's own fail-loud gate, so an unknown verb
 *  rejects cleanly instead of falling into a builder whose apply
 *  treats "not edit" as create. */
export function resourceSupports(resource: AssistantResource, mode: string): boolean {
  if (mode === 'create' || mode === 'edit') {
    return !VERB_ONLY_RESOURCES.includes(resource);
  }
  return (RESOURCE_EXTRA_ACTIONS[resource] ?? []).includes(mode);
}

/**
 * The (resource, verb) pairs a LIST PAGE offers as a batch action over
 * its ticked rows — wave-2's Pattern A. The verb sheet is the same
 * single-record descriptor with its apply fanned out over the
 * selection, so a pair only belongs here when that resource's builder
 * genuinely has an arm for the verb (`RESOURCE_EXTRA_ACTIONS` above, or
 * 'edit' for the bulk-edit path).
 *
 * `BulkVerbSlot` refuses a pair that is not listed — the fail-loud twin
 * of `resourceSupports`, so a page cannot quietly offer a batch verb
 * nothing can apply.
 *
 * Undeclared resources' batch items (tables, outlets, modifiers,
 * plans, discount-codes, purchase orders, funnels/campaigns…) are
 * deliberately absent: they stay the hand-built manual dialogs until
 * their resource declares the verb.
 */
export const BULK_VERBS: Partial<Record<AssistantResource, readonly string[]>> = {
  categories: ['delete'],
  products: ['set-category', 'delete'],
  customers: ['delete'],
  'webhook-subscriptions': ['delete'],
  'blog-posts': ['publish', 'unpublish', 'delete'],
  'affiliate-enrollments': ['approve'],
  'affiliate-commissions': ['approve', 'void'],
};

export function supportsBulkVerb(resource: AssistantResource, verb: string): boolean {
  return (BULK_VERBS[resource] ?? []).includes(verb);
}
