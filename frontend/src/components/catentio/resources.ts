import type { CrudResource, CrudSchemaField } from '@forjio/agent-ui';
import type { ModulesState } from '@/hooks/use-modules';
import type { AssistantMode, AssistantResource } from '@/hooks/use-catentio';
import { BULK, BULK_EDIT_RESOURCES } from './capabilities';

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
export type { Fields, ResourceContext, ResourceBuilder } from './resource-helpers';
export { buildAgentPrompt, defined, strOrNull } from './resource-helpers';

import type { Fields, ResourceContext, ResourceBuilder } from './resource-helpers';
import { str } from './resource-helpers';
import { CORE_BUILDERS } from './resources/core';
import { BOOKS_BUILDERS } from './resources/books';
import { MARKETING_BUILDERS } from './resources/marketing';
import { PAYFUL_BUILDERS } from './resources/payful';
import { ASSISTANT_RESOURCES } from '@/hooks/use-catentio';

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

/** The base (un-bulked) descriptor, for both the sheet and bulk edit. */
function buildBaseResource(
  resource: AssistantResource,
  mode: AssistantMode,
  ctx?: ResourceContext,
): CrudResource<Fields> {
  const built = RESOURCE_BUILDERS[resource](mode, ctx);
  if (!built) {
    throw new Error(`The ${resource} assistant surface is not available here`);
  }
  return built;
}

export function buildCrudResource(
  resource: AssistantResource,
  mode: AssistantMode,
  ctx?: ResourceContext,
): CrudResource<Fields> {
  const built = buildBaseResource(resource, mode, ctx);
  const bulk = BULK[resource];
  return bulk ? withBulk(built, mode, bulk) : built;
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
  resource: CrudResource<Fields>,
  mode: AssistantMode,
  opts: { noun: string; rowKeys?: string[] },
): CrudResource<Fields> {
  if (mode !== 'create') return resource;
  const singular = resource.fields.filter(
    (f) => f.name !== 'alsoCreate' && f.name !== 'pasteRows',
  );
  // `rowKeys` only names a failed row in the message — it never decides
  // whether the row counts. See filledRows.
  const nameRow = (r: Fields) =>
    opts.rowKeys?.map((k) => str(r[k])).find(Boolean) ?? 'a row';

  const known = new Set(singular.map((f) => f.name));

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
      await resource.apply(args);
      if (extras.length === 0) return;

      // The primary is already written by the time a row fails, so a bad
      // row does NOT abandon the rows after it — stopping cannot undo
      // anything, only lose work. A partial run is reported as a FAILURE
      // naming what did not land.
      let made = 1;
      const failed: string[] = [];
      for (const r of extras) {
        try {
          await resource.apply({ ...args, fields: rowFields(r) });
          made++;
        } catch (e) {
          failed.push(`${nameRow(r)} (${(e as Error).message})`);
        }
      }
      if (failed.length > 0) {
        throw new Error(
          `Added ${made} of ${made + failed.length}. These did not: ${failed.join('; ')}`,
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
export { BULK, BULK_EDIT_RESOURCES };

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
): CrudResource<Fields> {
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
      let changed = 0;
      const failed: string[] = [];
      for (const t of targets) {
        try {
          await single.apply({ mode: 'edit', fields: patch, initial: t });
          changed++;
        } catch (e) {
          failed.push(`${nameRow(t)} (${(e as Error).message})`);
        }
      }
      if (failed.length > 0) {
        throw new Error(
          `Changed ${changed} of ${targets.length}. These did not: ${failed.join('; ')}`,
        );
      }
    },
  };
}
