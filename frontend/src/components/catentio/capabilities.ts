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
 *  repeater + pasted-CSV section inside the create sheet. `plural` is
 *  for a noun `${noun}s` gets wrong; the bulk bar has carried the same
 *  escape hatch (`pluralWord`) since it was written. */
export const BULK: Partial<
  Record<AssistantResource, { noun: string; plural?: string; rowKeys?: string[] }>
> = {
  products: { noun: 'product', rowKeys: ['name'] },
  categories: { noun: 'category', plural: 'categories', rowKeys: ['name'] },
  modifiers: { noun: 'modifier group', rowKeys: ['name'] },
  customers: { noun: 'customer', rowKeys: ['name', 'email'] },
  suppliers: { noun: 'supplier', rowKeys: ['name'] },
  tables: { noun: 'table', rowKeys: ['label'] },
  'gift-cards': { noun: 'gift card', rowKeys: ['code'] },
  'discount-codes': { noun: 'discount code', rowKeys: ['code'] },
  'payment-customers': { noun: 'payment customer', rowKeys: ['email'] },
  warehouses: { noun: 'warehouse', rowKeys: ['name'] },
  licenses: { noun: 'license', rowKeys: ['customerId'] },
  // Ripllo marketing, 2026-08-15 — bang's batch. contact-lists is
  // here for batch CREATE only; it takes no edit (see below).
  programs: { noun: 'affiliate program', rowKeys: ['name'] },
  'creator-briefs': { noun: 'creator brief', rowKeys: ['name'] },
  contacts: { noun: 'contact', rowKeys: ['email', 'phone'] },
  'contact-lists': { noun: 'contact list', rowKeys: ['name'] },
};

/** How to say N of them. Every batch surface that names the noun goes
 *  through here, so "3 categorys" cannot come back one sentence at a
 *  time. */
export function pluralNoun(resource: AssistantResource, n: number, fallback?: string): string {
  const bulk = BULK[resource];
  const noun = bulk?.noun ?? fallback ?? 'record';
  if (n === 1) return noun;
  return bulk?.plural ?? `${noun}s`;
}

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
  // 2026-08-15. Each builder genuinely branches on mode:
  // programs and contacts PATCH by id, creator-briefs PATCHes
  // ripllo's /campaigns/{id}.
  'programs',
  'creator-briefs',
  'contacts',
  // NOT 'contact-lists': ripllo has no update endpoint for a list
  // at all, so its builder cannot branch on mode and an edit sheet
  // would open over nothing. Structural, not an oversight.
];

/**
 * Verbs beyond the create/edit pair, per resource — the frontend
 * mirror of the profile's declared ActionSpecs
 * (backend/src/lib/catentio-profile.ts, wave 1). A verb added to the
 * profile without a builder arm here (or vice versa) is a card that
 * renders and then fails on Apply — keep the two in step.
 */
export const RESOURCE_EXTRA_ACTIONS: Partial<Record<AssistantResource, readonly string[]>> = {
  // Ripllo marketing deletes, 2026-08-15. creator-briefs has none:
  // ripllo serves no DELETE for a brief, so closing one IS the end.
  programs: ['delete'],
  contacts: ['delete'],
  'contact-lists': ['delete'],
  categories: ['delete'],
  products: ['set-category', 'delete'],
  customers: ['delete'],
  'webhook-subscriptions': ['delete'],
  'blog-posts': ['publish', 'unpublish', 'delete'],
  payouts: ['mark-paid'],
  'affiliate-enrollments': ['approve'],
  'affiliate-commissions': ['approve', 'void'],
  // wave-3 — the nine pages that already offered a manual batch delete.
  plans: ['delete'],
  outlets: ['delete'],
  modifiers: ['delete'],
  warehouses: ['delete'],
  tables: ['delete'],
  suppliers: ['delete'],
  funnels: ['delete'],
  'marketing-campaigns': ['delete'],
  'discount-codes': ['delete'],
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
/**
 * Resources whose profile declares CREATE but no EDIT — the gate must
 * refuse `edit` for them, or the sheet opens over a builder that ignores
 * mode and whose apply CREATES: "editing" three ticked rows would mint
 * three new records.
 *
 * Added 2026-08-15 with `contact-lists`, the first such resource here.
 * Ripllo exposes POST / GET / DELETE and member add/remove for a list —
 * there is no update endpoint at all, so this is upstream's shape rather
 * than a gap to fill later. Pinned by
 * contact-lists-has-no-update.test.ts. storlaunch has carried the same
 * list since wave-3; malapos simply had no create-only resource until
 * now.
 */
const CREATE_ONLY_RESOURCES: readonly AssistantResource[] = ['contact-lists'];

export function resourceSupports(resource: AssistantResource, mode: string): boolean {
  if (mode === 'edit' && CREATE_ONLY_RESOURCES.includes(resource)) return false;
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
 * Wave-3 declared the verb for the nine that had stayed manual (plans,
 * outlets, modifiers, warehouses, tables, suppliers, funnels,
 * marketing-campaigns, discount-codes), so each is listed below. What is
 * still deliberately absent is anything whose resource has no declared
 * verb behind it — `floors` has a DELETE route but no batch surface, and
 * purchase ORDERS never had one either (the purchasing page's batch
 * delete acts on suppliers).
 */
export const BULK_VERBS: Partial<Record<AssistantResource, readonly string[]>> = {
  categories: ['delete'],
  products: ['set-category', 'delete'],
  customers: ['delete'],
  'webhook-subscriptions': ['delete'],
  'blog-posts': ['publish', 'unpublish', 'delete'],
  'affiliate-enrollments': ['approve'],
  'affiliate-commissions': ['approve', 'void'],
  // wave-3 — the nine pages that already offered a manual batch delete.
  plans: ['delete'],
  outlets: ['delete'],
  modifiers: ['delete'],
  warehouses: ['delete'],
  tables: ['delete'],
  suppliers: ['delete'],
  funnels: ['delete'],
  'marketing-campaigns': ['delete'],
  'discount-codes': ['delete'],
};

export function supportsBulkVerb(resource: AssistantResource, verb: string): boolean {
  return (BULK_VERBS[resource] ?? []).includes(verb);
}

/**
 * Fields a BATCH verb sheet must not ask for, because the fan-out reads
 * them off each ticked ROW instead.
 *
 * The affiliate queues are the whole list. `programId` is `required` on
 * their single-record descriptors — it is how a CHAT CARD names the
 * program when there is no row to read — and `requireProgramId` prefers
 * `initial.programId` (the row) over the field, so on a batch the field
 * is never consulted. Leaving it on the batch sheet would only bounce
 * Apply on "Missing required field: Program", asking the merchant to
 * type by hand the one value the field's own description tells them
 * never to type by hand.
 *
 * This is per-field and explicit on purpose. "Drop what every row
 * carries" would look equivalent and quietly take the picker off
 * products.set-category the moment the ticked products happened to
 * share a category.
 */
export const ROW_SUPPLIED_FIELDS: Partial<Record<AssistantResource, readonly string[]>> = {
  'affiliate-enrollments': ['programId'],
  'affiliate-commissions': ['programId'],
};
