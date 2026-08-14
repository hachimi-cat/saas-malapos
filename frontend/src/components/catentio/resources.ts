import { PartialApplyError } from '@forjio/agent-ui';
import type { CrudResource, CrudSchemaField } from '@forjio/agent-ui';
import type { ModulesState } from '@/hooks/use-modules';
import type { AssistantMode, AssistantResource } from '@/hooks/use-catentio';
import {
  BULK,
  BULK_EDIT_RESOURCES,
  BULK_VERBS,
  ROW_SUPPLIED_FIELDS,
  supportsBulkVerb,
} from './capabilities';

/**
 * CrudResource descriptors for the agentic sheet — the FRONTEND mirror
 * of backend/src/lib/catentio-profile.ts. Field names, per-mode
 * availability (create/edit) and required-on-create must match
 * `MALAPOS_PROFILE.resources`; the server's plan sanitizer stays the
 * gate, this file only decides what the manual form renders and how an
 * approved field set is applied.
 *
 * `apply` must call the SAME api-client slices the hand-built forms
 * call, so a record created through the sheet is indistinguishable from
 * one typed by hand — and the write runs under the USER's own session.
 * The agent only ever proposed it.
 *
 * SKELETON (transcribed from storlaunch's resources.ts): the dispatch,
 * the bulk-create wrapper (`withBulk`) and the bulk-edit builder are in
 * place; the 38 per-resource descriptors are not written yet — each
 * registry entry throws until its descriptor lands. To add one:
 *
 *   1. write a builder `(mode, ctx) => CrudResource` mirroring the
 *      hand-built form (fields, groups, examplePrompts, apply);
 *   2. give it the shared `buildAgentPrompt` (the JSON envelope the
 *      plan transport parses back — no prose, the BFF owns the schema);
 *   3. replace the stub in `RESOURCE_BUILDERS`;
 *   4. if `+ New` should batch, add a `BULK` entry ({noun, rowKeys});
 *      if list pages offer "Edit N selected", add the key to
 *      `BULK_EDIT_RESOURCES` (only when the builder truly branches on
 *      mode — a create-only apply would mint N records, not touch them).
 */

export type { CrudResource, CrudSchemaField, CrudFieldGroup, CrudTemplate } from '@forjio/agent-ui';
export type { Fields, ResourceContext, ResourceBuilder, ResourceWithResult } from './resource-helpers';
export { buildAgentPrompt, defined, strOrNull } from './resource-helpers';

import type { Fields, ResourceContext, ResourceBuilder, ResourceWithResult } from './resource-helpers';
import { str, withDelete } from './resource-helpers';
import { api } from '@/lib/api';
import { plansApi } from '@/lib/payments-api';
import { warehousesApi } from '@/lib/fulfillment-api';
import { discountCodesApi, marketingFetch } from '@/lib/marketing-api';
import { CORE_BUILDERS } from './resources/core';
import { BOOKS_BUILDERS } from './resources/books';
import { MARKETING_BUILDERS } from './resources/marketing';
import { PAYFUL_BUILDERS } from './resources/payful';
import { ASSISTANT_RESOURCES } from '@/hooks/use-catentio';
import { resourceSupports } from './capabilities';

// ── the registry ────────────────────────────────────────────────────

/** One builder per assistant resource, composed from the per-group
 *  modules under ./resources/. The dispatch, bulk-create and bulk-edit
 *  machinery below pick them up unchanged. */
const COMPOSED: Record<string, ResourceBuilder> = {
  ...CORE_BUILDERS,
  ...BOOKS_BUILDERS,
  ...MARKETING_BUILDERS,
  ...PAYFUL_BUILDERS,
};

/**
 * wave-3. Nine pages already offered "Delete N selected" through the
 * manual confirm and had no declared verb behind it, so a card for one
 * would have been dropped by the BFF sanitizer. Each `del` below is the
 * SAME call that page's own confirm already makes — the batch sheet
 * fans this single-record apply over the ticked rows, so there is no
 * second write path to drift.
 *
 * Two of them do not really delete, which their profile blocks say:
 * warehouses ARCHIVES in Fulkruma and discount-codes ARCHIVES in Ripllo.
 */
for (const [slug, label, del] of [
  ['plans', 'billing plan', (id: string) => plansApi.delete(id)],
  ['outlets', 'outlet', (id: string) => api.delete(`/outlets/${encodeURIComponent(id)}`)],
  ['modifiers', 'modifier group', (id: string) => api.delete(`/modifiers/${encodeURIComponent(id)}`)],
  ['warehouses', 'fulfillment warehouse', (id: string) => warehousesApi.delete(id)],
  ['tables', 'dine-in table', (id: string) => api.delete(`/tables/${encodeURIComponent(id)}`)],
  ['suppliers', 'supplier', (id: string) => api.delete(`/suppliers/${encodeURIComponent(id)}`)],
  ['funnels', 'marketing funnel', (id: string) => marketingDelete(`funnels/${encodeURIComponent(id)}`)],
  ['marketing-campaigns', 'marketing campaign', (id: string) => marketingDelete(`marketing-campaigns/${encodeURIComponent(id)}`)],
  ['discount-codes', 'discount code', (id: string) => discountCodesApi.archive(id)],
] as const) {
  COMPOSED[slug] = withDelete(COMPOSED[slug]!, { slug, label, del });
}

/** The marketing pages' own delete: `marketingFetch` does not throw on a
 *  non-2xx, so the proxy's envelope message has to be surfaced as an
 *  Error or a failed row would count as deleted. */
async function marketingDelete(path: string): Promise<void> {
  const r = await marketingFetch(`/api/v1/account/marketing/${path}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) {
    let message = `delete failed (${r.status})`;
    try {
      const body = (await r.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* keep the status-code message */
    }
    throw new Error(message);
  }
}

// Fail LOUD at module init, not on first sheet open: a group module
// that renames or drops a key would otherwise surface as "not a
// function" in front of a merchant. The test suite asserts the same
// thing; this catches it in dev too.
for (const key of ASSISTANT_RESOURCES) {
  if (typeof COMPOSED[key] !== 'function') {
    throw new Error(`resources registry is missing a builder for: ${key}`);
  }
}

export const RESOURCE_BUILDERS = COMPOSED as Record<AssistantResource, ResourceBuilder>;

/** The base (un-bulked) descriptor, for the sheet, bulk edit AND the
 *  docked chat's Apply. An action name outside the resource's declared
 *  vocabulary (capabilities.ts RESOURCE_EXTRA_ACTIONS) throws instead
 *  of falling into a builder whose apply treats "not edit" as create. */
function buildBaseResource(
  resource: AssistantResource,
  mode: AssistantMode,
  ctx?: ResourceContext,
): ResourceWithResult {
  if (!resourceSupports(resource, mode)) {
    throw new Error(`The ${resource} assistant surface does not support "${mode}"`);
  }
  const built = RESOURCE_BUILDERS[resource](mode, ctx);
  if (!built) {
    throw new Error(`The ${resource} assistant surface is not available here`);
  }
  return built;
}

/** The sheet's view: the package's exact `CrudResource`, with the write
 *  result dropped because `AgenticCrudSheet` has no use for it. */
export function buildCrudResource(
  resource: AssistantResource,
  mode: AssistantMode,
  ctx?: ResourceContext,
): CrudResource<Fields, AssistantMode> {
  const built = buildBaseResource(resource, mode, ctx);
  const bulk = BULK[resource];
  const descriptor = bulk ? withBulk(built, mode, bulk) : built;
  return {
    ...descriptor,
    apply: async (args) => {
      await descriptor.apply(args);
    },
  };
}

/** The chat's view: the same write, with the written record handed back
 *  so a later `$n` in the reply can reference its id (chat-actions.ts). */
export function applyResource(
  resource: AssistantResource,
  mode: AssistantMode,
  args: { fields: Fields; initial?: Partial<Fields> },
): Promise<unknown> {
  return buildBaseResource(resource, mode).apply({ mode, ...args });
}

// ── the batch fan-out ───────────────────────────────────────────────

/**
 * The loop every batch descriptor shares: one approved field set,
 * applied to N closure-captured records one at a time, continuing past
 * failures (stopping cannot undo what already went through, only lose
 * work). It owns two things a plain `for` loop does not.
 *
 * A PARTIAL RUN IS ITS OWN KIND OF FAILURE. "Deleted 2 of 3" is not
 * just a sentence — two records are GONE, so the list behind the sheet
 * is now wrong. `PartialApplyError` (@forjio/agent-ui >= 0.21.0) is
 * what tells the sheet to fire `onApplied` anyway so the host refetches;
 * a plain Error leaves the dead rows on screen looking alive. Nothing
 * applied stays a plain Error — nothing moved, so there is nothing to
 * reload, and an ordinary 400 can never read as "it half worked".
 *
 * RETRY MEANS RETRY THE FAILURES. The sheet stays OPEN on a partial run
 * and this closure outlives it, so a second Apply would otherwise
 * re-fire the whole selection at records that are already deleted /
 * already approved. Records that went through are remembered by index
 * and skipped, and the count keeps running against the ORIGINAL
 * selection — the retry still says "Deleted 2 of 3" (two of those three
 * really are gone), never "Deleted 0 of 3".
 *
 * The memory is keyed on the FIELD SET, because changing it is a new
 * instruction rather than a retry: move the selection to a different
 * category and every record is applied again, including the ones the
 * first category already took.
 */
function fanOut(
  pastTense: string,
  targets: Fields[],
  nameRow: (r: Fields) => string,
): (fields: Fields, applyOne: (t: Fields) => Promise<unknown>) => Promise<void> {
  const applied = new Set<number>();
  let signature: string | null = null;
  return async (fields, applyOne) => {
    const sig = JSON.stringify(fields);
    if (sig !== signature) {
      signature = sig;
      applied.clear();
    }
    const failed: string[] = [];
    for (const [i, t] of targets.entries()) {
      if (applied.has(i)) continue;
      try {
        await applyOne(t);
        applied.add(i);
      } catch (e) {
        failed.push(`${nameRow(t)} (${(e as Error).message})`);
      }
    }
    if (failed.length === 0) return;
    const message = `${pastTense} ${applied.size} of ${targets.length}. These did not: ${failed.join('; ')}`;
    throw applied.size > 0
      ? new PartialApplyError(message, applied.size, targets.length)
      : new Error(message);
  };
}

// ── bulk create ─────────────────────────────────────────────────────

/**
 * `+ New X` can be bulk or singular, and a row is a WHOLE form. So bulk
 * is not written per resource: `withBulk` wraps a finished descriptor
 * and derives everything from it —
 *
 *  - the repeater's `itemFields` ARE the resource's own create fields,
 *    so a field added to the form appears in the rows the same day and
 *    the two can never drift;
 *  - each row is applied by the resource's OWN `apply`, so a row cannot
 *    be created differently from the record above it — there is no
 *    second write path to keep in step.
 *
 * The singular form is untouched: an empty repeater makes exactly one
 * record, byte for byte as before. And the flat fields stay flat, which
 * matters beyond the manual tab — `fields` is also what the AGENT's
 * proposed plan is mapped onto, and a descriptor whose only field was a
 * repeater would render the agentic tab blank.
 *
 * Rows keep `visibleWhen` (needs @forjio/agent-ui >= 0.19.0; before it
 * a row rendered every field unconditionally).
 */
function alsoCreateRepeater(noun: string, singular: CrudSchemaField[]): CrudSchemaField {
  const cols = 4;
  return {
    name: 'alsoCreate',
    label: 'And also',
    kind: 'repeater',
    addLabel: `+ Add another ${noun}`,
    rowColumns: cols,
    // Groups are dropped — a row is a line, not a stack of titled panels
    // — but every field survives, conditionals included.
    itemFields: singular.map(({ group: _group, colSpan, ...f }) => ({
      ...f,
      colSpan: Math.min(colSpan ?? 2, cols),
    })),
    description: 'Each one is a full record, same as above. Leave empty to add just the one.',
  };
}

/**
 * A row as its own record — deliberately NOT merged over the record
 * above. A blank field is omitted exactly as it would be on the singular
 * form, and nothing crosses silently between records (a second customer
 * must not inherit the first one's name).
 */
function rowFields(row: Fields): Fields {
  const { alsoCreate: _drop, ...rest } = row;
  return rest;
}

/**
 * The rows the merchant actually typed into. A row counts as REAL when
 * ANY field is set — the half-filled row is kept, the resource's own
 * validation rejects it, and it is NAMED in the partial-failure message.
 * The all-blank row is the only one skipped, and that is precisely what
 * "+ Add another" leaves behind before anything is typed.
 */
function filledRows(v: unknown): Fields[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .filter((r): r is Fields => typeof r === 'object' && r !== null)
    .filter((r) =>
      Object.entries(r).some(
        ([k, val]) => k !== 'alsoCreate' && String(val ?? '').trim() !== '',
      ),
    );
}

/**
 * Split CSV text into cells. Handles quoted fields, embedded commas and
 * newlines, and the doubled-quote escape — a product description with a
 * comma in it is the normal case, not an edge one.
 */
function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += c;
  }
  row.push(cell);
  out.push(row);
  return out.filter((r) => r.some((v) => v.trim() !== ''));
}

/**
 * A pasted spreadsheet, as records. The header row names the fields, so
 * the columns a merchant can paste are exactly the fields the form
 * shows. An unrecognised column THROWS rather than being ignored — a
 * silently dropped column is a whole attribute missing from every
 * imported record with a green tick over it.
 */
function parseCsvRows(text: string, known: Set<string>): Fields[] {
  const grid = splitCsv(text);
  if (grid.length === 0) return [];
  const headers = grid[0].map((h) => h.trim());
  const unknown = headers.filter((h) => h && !known.has(h));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown column${unknown.length > 1 ? 's' : ''} in the pasted rows: ${unknown.join(', ')}. Use the field names shown above.`,
    );
  }
  if (grid.length === 1) {
    throw new Error('The pasted rows have a header but no rows under it.');
  }
  return grid.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map((h, i) => [h, (cells[i] ?? '').trim()]).filter(([h]) => h),
    ),
  );
}

export function withBulk(
  resource: ResourceWithResult,
  mode: AssistantMode,
  opts: { noun: string; rowKeys?: string[] },
): ResourceWithResult {
  if (mode !== 'create') return resource;
  const singular = resource.fields.filter(
    (f) => f.name !== 'alsoCreate' && f.name !== 'pasteRows',
  );
  // `rowKeys` only names a failed row in the message — it never decides
  // whether the row counts. See filledRows.
  const nameRow = (r: Fields) =>
    opts.rowKeys?.map((k) => str(r[k])).find(Boolean) ?? 'a row';

  const known = new Set(singular.map((f) => f.name));

  // What already went through, so a retry after a partial run does not
  // mint the same record twice. Not `fanOut`'s index memory: a "target"
  // here is DRAFT CONTENT, not a closure-captured row, and the merchant
  // reaches for Apply again precisely to fix the row that failed. So a
  // record is remembered by (position, exact content) and skipped only
  // when both still match — a row that was edited is a different record
  // and is created; a row left alone is not created a second time.
  // Nothing is ever skipped that was not successfully written.
  const madePrimary = { key: null as string | null };
  const madeRows = new Map<number, string>();
  const rowKey = (f: Fields) => {
    const { alsoCreate: _a, pasteRows: _p, ...rest } = f;
    return JSON.stringify(rest);
  };

  return {
    ...resource,
    fields: [
      ...singular,
      alsoCreateRepeater(opts.noun, singular),
      {
        name: 'pasteRows',
        label: 'Or paste rows',
        kind: 'textarea',
        placeholder: `${singular.slice(0, 3).map((f) => f.name).join(',')}\n…`,
        description:
          'A spreadsheet, pasted. First line names the columns using the field names above; every line under it becomes one more record, on top of anything typed above.',
      },
    ],
    apply: async (args) => {
      // Typed rows first, then pasted ones — the merchant's own order.
      const extras = [
        ...filledRows(args.fields.alsoCreate),
        ...(str(args.fields.pasteRows) ? parseCsvRows(str(args.fields.pasteRows)!, known) : []),
      ];
      const primaryKey = rowKey(args.fields);
      if (madePrimary.key !== primaryKey) {
        await resource.apply(args);
        madePrimary.key = primaryKey;
      }
      if (extras.length === 0) return;

      // The primary is already written by the time a row fails, so a bad
      // row does NOT abandon the rows after it — stopping cannot undo
      // anything, only lose work. A partial run is reported as a FAILURE
      // naming what did not land — as a PartialApplyError, so the sheet
      // also tells the page to refetch (the records that DID land are
      // missing from the list until it does).
      let made = 1;
      const failed: string[] = [];
      for (const [i, r] of extras.entries()) {
        const key = rowKey(r);
        if (madeRows.get(i) === key) {
          made++;
          continue;
        }
        try {
          await resource.apply({ ...args, fields: rowFields(r) });
          madeRows.set(i, key);
          made++;
        } catch (e) {
          failed.push(`${nameRow(r)} (${(e as Error).message})`);
        }
      }
      if (failed.length > 0) {
        // `made` is at least the primary, which is written above before
        // any row runs — so a partial here always moved something.
        throw new PartialApplyError(
          `Added ${made} of ${made + failed.length}. These did not: ${failed.join('; ')}`,
          made,
          made + failed.length,
        );
      }
    },
  };
}

/**
 * Which resources batch on `+ New X`, and the merchant's noun for one
 * record (`rowKeys` names a failed row in the partial-failure message).
 * Empty until descriptors land — add an entry alongside each builder
 * that should offer "And also" rows + pasted-CSV import.
 */
// BULK + BULK_EDIT_RESOURCES moved to ./capabilities (a no-heavy-imports
// module) so the page-level action picker in agentic-entry.tsx can read
// them without dragging this file's import graph onto every dashboard
// page. Re-exported so existing import sites and the registry tests are
// unchanged.
export { BULK, BULK_EDIT_RESOURCES, BULK_VERBS };

// ── bulk edit ───────────────────────────────────────────────────────

/** Value kinds a shared patch cannot express: row lists would REPLACE
 *  each record's own rows, and file pickers hold per-record uploads. */
const BULK_EDIT_DROP_KINDS = new Set(['repeater', 'keyed-rows', 'files', 'avatar']);

/** A field counts as SET when the merchant typed or picked something.
 *  Blank means "keep each record's current value" — which also means
 *  bulk edit cannot CLEAR a field to empty; that stays a one-record
 *  operation where '' unambiguously means "clear it". */
function isSet(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * One PATCH body, applied to every selected record through the
 * resource's OWN edit apply — the same no-second-write-path rule as
 * `withBulk`, in the other direction.
 *
 * Two deliberate shape changes on the fields:
 *
 *  - `required` is stripped everywhere: an empty field is an
 *    instruction to leave that field alone, so nothing is required.
 *  - a checkbox becomes an OPTIONAL select (Yes / No / — none —),
 *    because an untouched checkbox reads as `false` and would silently
 *    deactivate everything selected. Its values stay the strings
 *    'true' / 'false' — exactly what the checkbox control writes into
 *    the draft — so each resource's own coercions apply unchanged.
 *
 * Each target's own record is passed as `initial`, so applies that read
 * parent ids from the row keep working, and nothing is inherited across
 * records.
 */
export function buildBulkEditResource(
  resource: AssistantResource,
  targets: Fields[],
  ctx?: ResourceContext,
): CrudResource<Fields, AssistantMode> {
  const single = buildBaseResource(resource, 'edit', ctx);
  const bulk = BULK[resource];
  const nameRow = (r: Fields) =>
    bulk?.rowKeys?.map((k) => str(r[k])).find(Boolean) ?? str(r.id) ?? 'a record';

  const fields = single.fields
    .filter((f) => !BULK_EDIT_DROP_KINDS.has(String(f.kind)))
    .map((f) => {
      const base = { ...f, required: false };
      if (f.kind !== 'checkbox') return base;
      return {
        ...base,
        kind: 'select' as const,
        options: [
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ],
        description: f.description
          ? `${f.description} Leave unset to keep each record's current value.`
          : "Leave unset to keep each record's current value.",
      };
    });

  const fan = fanOut(pastVerb('edit'), targets, nameRow);

  return {
    ...single,
    fields,
    apply: async (args) => {
      const patch = Object.fromEntries(
        Object.entries(args.fields).filter(([, v]) => isSet(v)),
      );
      if (Object.keys(patch).length === 0) {
        throw new Error(
          'Fill in at least one field — blank fields keep their current values.',
        );
      }
      await fan(patch, (t) => single.apply({ mode: 'edit', fields: patch, initial: t }));
    },
  };
}

// ── bulk verbs ──────────────────────────────────────────────────────

/**
 * How a verb reads once it has happened, for the partial-failure
 * sentence — the product-wide contract shape ("… N of M. These did
 * not: …"), same as withBulk's "Added", bulk edit's "Changed" and
 * deleteMany's "Deleted".
 */
const VERB_PAST: Record<string, string> = {
  delete: 'Deleted',
  publish: 'Published',
  unpublish: 'Unpublished',
  approve: 'Approved',
  void: 'Voided',
  'set-category': 'Moved',
  edit: 'Changed',
};

export function pastVerb(verb: string): string {
  return VERB_PAST[verb] ?? 'Applied';
}

// 'static' is a CUSTOM renderer kind, registered in agentic-sheet.tsx's
// `fieldRenderers`. The package's kind union does not know custom
// kinds, but its lookup is `fieldRenderers[kind]` — any string
// resolves. Used for the batch sheets' read-only target line.
const STATIC = 'static' as NonNullable<CrudSchemaField['kind']>;

/**
 * The read-only line naming WHO a batch verb runs on.
 *
 * It carries the legibility the batch sheets were always supposed to
 * have (bang's original complaint: a form over an invisible selection),
 * and it is also what makes a FIELDLESS verb usable at all. The sheet
 * disables its primary button while the draft has no keys
 * (`Object.keys(draft).length === 0`) and seeds that draft from the
 * mount's `initial`; delete / publish / unpublish / approve / void
 * carry no fields, so without a seeded key their Apply is disabled
 * forever — a sheet that opens correctly titled over the right rows and
 * can never be applied.
 *
 * It is a LABEL, never a payload: the backend profile does not declare
 * the key (so the BFF's plan sanitizer drops it), and the batch apply
 * strips it before anything reaches a record.
 */
export const BATCH_TARGETS_FIELD = 'batchTargets';

/** What `BulkVerbSlot` must mount the verb sheet with — the ticked rows
 *  as the human list the sheet header already computes. Exported so the
 *  seed is one thing both the sheet and its regression test name. */
export function batchTargetsInitial(names: string): Fields {
  return { [BATCH_TARGETS_FIELD]: names };
}

/**
 * `buildBulkEditResource`, generalized past edit — the wave-2 half of
 * the batch story.
 *
 * A list page's Actions dropdown offers a verb over the ticked rows;
 * this builds the sheet for it. Exactly like bulk edit: ONE plan turn
 * (the agent proposes the verb's fields once — a category to move to,
 * or nothing at all for delete/publish/approve), then the apply fans
 * that one field set out over the closure-captured `targets` through
 * the resource's OWN single-record apply. No second write path, and
 * the verb's declared chrome (destructive → the sheet's confirm) rides
 * along with the descriptor.
 *
 * Two deliberate differences from bulk EDIT:
 *
 *  - `required` is NOT stripped and a checkbox is NOT weakened to a
 *    three-state select. Blank means "keep" on an edit patch; on a verb
 *    the fields ARE the verb's arguments (set-category needs a
 *    category), so they keep the descriptor's own rules. The exception
 *    is a field the fan-out reads off each ROW instead of asking for
 *    (ROW_SUPPLIED_FIELDS — the affiliate queues' programId); asking
 *    for it would bounce Apply on a value the merchant must not type.
 *  - a resource with a REAL ids[] endpoint declares `applyMany` and the
 *    whole selection goes in one request — a true batch, not a loop.
 *    Its all-or-nothing failure is the server's own message, so there
 *    is no partial sentence on that path (nothing partially happened).
 *
 * Every verb sheet opens on the seeded `BATCH_TARGETS_FIELD` line: what
 * the batch runs on, and — for the fieldless verbs, which is most of
 * them — the only reason the sheet's Apply is live at all.
 */
export function buildBulkVerbResource(
  resource: AssistantResource,
  verb: AssistantMode,
  targets: Fields[],
  ctx?: ResourceContext,
): CrudResource<Fields, AssistantMode> {
  if (!supportsBulkVerb(resource, verb)) {
    throw new Error(`${resource} does not offer "${verb}" over a selection`);
  }
  const single = buildBaseResource(resource, verb, ctx);
  const bulk = BULK[resource];
  const nameRow = (r: Fields) =>
    bulk?.rowKeys?.map((k) => str(r[k])).find(Boolean) ??
    str(r.name) ??
    str(r.title) ??
    str(r.label) ??
    str(r.id) ??
    'a record';

  const n = targets.length;
  const noun = n === 1 ? single.label : `${single.label}s`;
  const rowSupplied = new Set(ROW_SUPPLIED_FIELDS[resource] ?? []);
  const fan = fanOut(pastVerb(verb), targets, nameRow);

  const act = single.confirmLabel ?? single.title ?? verb;

  return {
    ...single,
    // The sheet's own title is written for one record ("Delete blog
    // post"); say what is actually about to happen instead.
    title: `${act} ${n} ${noun}`,
    // Both of these were inherited from the single-record descriptor,
    // and the package renders the destructive dialog as
    // `${confirmLabel} ${label}?` — so ticking three suppliers and
    // pressing the batch item put up "Delete supplier?", with no count
    // and in the singular, on the one screen a merchant is meant to
    // read before N records go. Live-observed on staging.
    confirmLabel: `${act} ${n}`,
    label: noun,
    fields: [
      {
        name: BATCH_TARGETS_FIELD,
        label: `${n} ${noun} selected`,
        kind: STATIC,
        description: 'The rows you ticked — this runs on these and nothing else.',
      },
      ...single.fields.filter((f) => !rowSupplied.has(f.name)),
    ],
    apply: async (args) => {
      // The seeded target line is chrome: strip it before ANY path,
      // so no record's apply is ever handed a field that only ever
      // existed to make the sheet legible and its Apply live.
      const fields = { ...args.fields };
      delete fields[BATCH_TARGETS_FIELD];

      if (single.applyMany) {
        await single.applyMany({ targets, fields });
        return;
      }
      await fan(fields, (t) => single.apply({ mode: verb, fields, initial: t }));
    },
  };
}
