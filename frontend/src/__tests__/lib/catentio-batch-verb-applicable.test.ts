import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BATCH_TARGETS_FIELD,
  batchTargetsInitial,
  buildBulkEditResource,
  buildBulkVerbResource,
  BULK_VERBS,
  RESOURCE_BUILDERS,
  type Fields,
  type ResourceBuilder,
} from '@/components/catentio/resources';
import { ROW_SUPPLIED_FIELDS } from '@/components/catentio/capabilities';
import type { AssistantMode, AssistantResource } from '@/hooks/use-catentio';

/**
 * "A BATCH VERB SHEET IS APPLICABLE THE MOMENT IT OPENS."
 *
 * The wave-2 suite (catentio-bulk-verbs.test.ts) passed while every
 * batch verb was DEAD in the browser, because it calls the descriptor's
 * `apply()` directly and never goes near the two package lines that
 * decide whether a merchant can press Apply at all:
 *
 *   draft   = initial ?? {}                      (agentic-crud-sheet:34)
 *   Apply   disabled while Object.keys(draft).length === 0   (:120)
 *   pressed refuses on a required field the merge left empty (:59-68)
 *
 * A fieldless verb (delete / publish / unpublish / approve / void)
 * inherits an EMPTY field list, so nothing can ever put a key in that
 * draft and the primary button stays disabled through a whole plan
 * turn. Confirmed live on staging-storlaunch, reproduced here.
 *
 * The fix is the seeded read-only target line: the descriptor prepends
 * BATCH_TARGETS_FIELD and the slot mounts with `batchTargetsInitial()`,
 * which makes the draft non-empty AND renders WHO the verb runs on. It
 * is a label, never a payload — the apply strips it before anything
 * reaches a record.
 *
 * So this suite models those package lines instead of the descriptor
 * alone, and runs the model over EVERY (resource, verb) the slot can
 * mount — derived from BULK_VERBS, so a verb added tomorrow is covered
 * the day it is added.
 */

// ── the package's own gate, modelled ────────────────────────────────

const AGENT_UI_SHEET = join(
  __dirname,
  '..',
  '..',
  '..',
  'node_modules',
  '@forjio',
  'agent-ui',
  'dist',
  'agentic-crud',
  'agentic-crud-sheet.js',
);

type Draft = Record<string, unknown>;

interface SheetLike {
  fields: { name: string; label: string; required?: boolean; kind?: string }[];
  apply(args: { mode: AssistantMode; fields: Fields; initial?: Partial<Fields> }): Promise<unknown>;
}

/**
 * `AgenticCrudSheet`, as far as APPLICABILITY goes. Verbatim behaviour
 * of the three lines the canary below pins — nothing else about the
 * sheet is modelled, and nothing else needs to be: a merchant who
 * cannot press Apply never reaches the rest of it.
 *
 * `createDefaults` is left out on purpose: every verb descriptor sets
 * `seedDefaults: false` (resource-helpers.ts verbDescriptor), so the
 * merge the real sheet does reduces to exactly this one.
 */
function openSheet(resource: SheetLike, mode: AssistantMode, initial?: Draft) {
  const draft: Draft = { ...(initial ?? {}) };
  return {
    /** The primary button's enabled state the instant the sheet opens. */
    applyEnabled: Object.keys(draft).length > 0,
    /** Pressing it — `typed` stands in for a manual edit or a plan. */
    async pressApply(typed: Draft = {}) {
      const merged = { ...(initial ?? {}), ...draft, ...typed };
      for (const f of resource.fields) {
        if (f.required && merged[f.name] == null) {
          throw new Error(`Missing required field: ${f.label}`);
        }
      }
      return resource.apply({ mode, fields: merged, initial });
    },
  };
}

describe('the modelled sheet is the package\'s real one (canary)', () => {
  const src = readFileSync(AGENT_UI_SHEET, 'utf8');

  it('the draft starts life as the mount\'s `initial`', () => {
    expect(src).toMatch(/const \[draft, setDraft\] = useState\(\s*\(\) => initial \?\? \{\}/);
  });

  it('Apply is disabled while that draft has no keys — the whole bug', () => {
    expect(src).toContain('disabled: applying || Object.keys(draft).length === 0');
  });

  it('pressing it refuses on a required field the merge left empty', () => {
    expect(src).toContain('if (f.required && merged[f.name] == null)');
    expect(src).toContain('...initial ?? {}');
  });
});

// ── every verb a page can mount ─────────────────────────────────────

/** Two ticked rows carrying what any wave-2 apply reads off a row: the
 *  id, a name for the failure sentence, and the affiliate queues'
 *  parent programId. */
const TARGETS: Fields[] = [
  { id: 'row_1', name: 'First', title: 'First', programId: 'prog_1' },
  { id: 'row_2', name: 'Second', title: 'Second', programId: 'prog_1' },
];

/** What the slot computes for the header and seeds the draft with. A
 *  sentinel rather than a realistic list, so the wire assertions below
 *  can prove it never leaves the sheet. */
const NAMES = 'First, Second';

/** Every (resource, verb) `BulkVerbSlot` can mount — derived, never
 *  transcribed, so the table stays the single source of truth. */
const MOUNTABLE = Object.entries(BULK_VERBS).flatMap(([resource, verbs]) =>
  (verbs ?? []).map(
    (verb) => [`${resource}.${verb}`, resource as AssistantResource, verb as AssistantMode] as const,
  ),
);

/** The verbs that ask the merchant for NOTHING — the ones the empty
 *  draft killed outright. products.set-category is the only wave-2 verb
 *  with an argument of its own, and it is asserted separately below. */
const FIELDLESS = MOUNTABLE.filter(([name]) => name !== 'products.set-category');

describe('BulkVerbSlot — what it can mount', () => {
  it('covers all twenty pairs (guards the derivation itself)', () => {
    expect(MOUNTABLE.map(([name]) => name)).toEqual([
      'categories.delete',
      'products.set-category',
      'products.delete',
      'customers.delete',
      'webhook-subscriptions.delete',
      'blog-posts.publish',
      'blog-posts.unpublish',
      'blog-posts.delete',
      'affiliate-enrollments.approve',
      'affiliate-commissions.approve',
      'affiliate-commissions.void',
      // wave-3: the nine pages whose batch delete was manual-only.
      'plans.delete',
      'outlets.delete',
      'modifiers.delete',
      'warehouses.delete',
      'tables.delete',
      'suppliers.delete',
      'funnels.delete',
      'marketing-campaigns.delete',
      'discount-codes.delete',
    ]);
    expect(FIELDLESS).toHaveLength(19);
  });
});

describe('a batch verb sheet is applicable the moment it opens', () => {
  it.each(MOUNTABLE)('%s: the primary button is LIVE on open', (_name, resource, verb) => {
    const descriptor = buildBulkVerbResource(resource, verb, TARGETS);
    const sheet = openSheet(descriptor, verb, batchTargetsInitial(NAMES));
    expect(
      sheet.applyEnabled,
      'the sheet opened with an empty draft — Apply is disabled and no plan turn can change that',
    ).toBe(true);
  });

  it.each(MOUNTABLE)('%s: opens on the read-only target line', (_name, resource, verb) => {
    const descriptor = buildBulkVerbResource(resource, verb, TARGETS);
    const first = descriptor.fields[0];
    expect(first, 'a fieldless verb must still expose the target line').toBeDefined();
    expect(first!.name).toBe(BATCH_TARGETS_FIELD);
    expect(String(first!.kind)).toBe('static');
    expect(first!.required).toBeFalsy();
    // It names WHO, in the merchant's own nouns, and one row reads as
    // one record. Asserted as the RELATIONSHIP between the two labels:
    // this used to be `/^1 [^s].* selected$/`, which encoded "singular"
    // as "the noun does not start with s" and passed only because no
    // noun did — until wave-3 added `supplier`.
    const plural = first!.label;
    const singular = buildBulkVerbResource(resource, verb, [TARGETS[0]!]).fields[0]!.label;
    expect(plural).toMatch(/^2 .+s selected$/);
    expect(singular).toMatch(/^1 .+ selected$/);
    expect(singular).not.toMatch(/s selected$/);
    expect(plural).toBe(singular.replace(/^1 (.*) selected$/, '2 $1s selected'));
  });

  it.each(MOUNTABLE)('%s: the confirm names the COUNT and reads in the plural', (_n, resource, verb) => {
    // The package renders the destructive dialog as
    // `${confirmLabel} ${label}?`, and this descriptor spreads the
    // single-record one — so before wave-3 it inherited both, and
    // ticking three suppliers put up "Delete supplier?": no count, and
    // singular, on the one screen a merchant reads before N records go.
    // Live-observed on staging. Asserted as the STRING THE MERCHANT
    // READS, because asserting the parts is how the singular survived
    // in the sibling products.
    const many = buildBulkVerbResource(resource, verb, TARGETS);
    const sentence = `${many.confirmLabel} ${many.label}?`;
    expect(sentence, `${resource}.${verb} confirm must carry the count`).toMatch(/ 2 /);
    expect(sentence, `${resource}.${verb} confirm must be plural`).toMatch(/s\?$/);

    // One row reads as one record — the count is still there.
    const one = buildBulkVerbResource(resource, verb, [TARGETS[0]!]);
    expect(`${one.confirmLabel} ${one.label}?`).toMatch(/ 1 /);
  });

  it('the seed is what makes the draft non-empty — nothing else can', () => {
    // The verb descriptors carry no defaultValue and the sheet does not
    // seed them anyway (seedDefaults: false), so an unseeded mount is a
    // dead sheet however many fields the verb declares.
    for (const [, resource, verb] of MOUNTABLE) {
      const descriptor = buildBulkVerbResource(resource, verb, TARGETS);
      expect(openSheet(descriptor, verb, undefined).applyEnabled).toBe(false);
      expect(openSheet(descriptor, verb, batchTargetsInitial(NAMES)).applyEnabled).toBe(true);
    }
    expect(Object.keys(batchTargetsInitial(NAMES))).toEqual([BATCH_TARGETS_FIELD]);
  });
});

// ── open → Apply, with nothing typed ────────────────────────────────

type Req = { method: string; url: string; body: Record<string, unknown> };

let reqs: Req[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  reqs = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (method !== 'GET') reqs.push({ method, url: String(url), body });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ data: { id: `id_${reqs.length}`, ...body }, meta: {} }),
      text: async () => JSON.stringify({ data: { id: `id_${reqs.length}`, ...body }, meta: {} }),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('a fieldless verb runs on open — no field left for the merchant to find', () => {
  it.each(FIELDLESS)('%s: Apply reaches every ticked row', async (_name, resource, verb) => {
    const descriptor = buildBulkVerbResource(resource, verb, TARGETS);
    const sheet = openSheet(descriptor, verb, batchTargetsInitial(NAMES));
    // Nothing typed, no plan turn — the merchant ticked rows and
    // pressed the button. That must be the whole interaction.
    await expect(sheet.pressApply()).resolves.not.toThrow();
    expect(reqs).toHaveLength(TARGETS.length);
  });

  it('the affiliate queues take the program off the ROW, so the sheet never asks', () => {
    // programId is `required: true` on the single-record descriptor —
    // it is how a CHAT CARD names a program when there is no row to
    // read. On a batch every ticked row carries it and the apply
    // prefers the row, so leaving the field on the batch sheet would
    // bounce Apply on a value the merchant must not type
    // ("Missing required field: Program") — dead in a second way.
    expect(ROW_SUPPLIED_FIELDS).toEqual({
      'affiliate-enrollments': ['programId'],
      'affiliate-commissions': ['programId'],
    });
    for (const resource of ['affiliate-enrollments', 'affiliate-commissions'] as const) {
      const verbs = BULK_VERBS[resource] ?? [];
      for (const verb of verbs) {
        const descriptor = buildBulkVerbResource(resource, verb as AssistantMode, TARGETS);
        expect(descriptor.fields.map((f) => f.name)).toEqual([BATCH_TARGETS_FIELD]);
      }
      // …and the single-record descriptor keeps it, chat card intact.
      expect(
        buildBulkVerbResource(resource, 'approve', TARGETS).fields.some((f) => f.required),
      ).toBe(false);
    }
  });

  it('no batch verb sheet may open with a field the merchant must fill (except the one that asks)', () => {
    for (const [name, resource, verb] of FIELDLESS) {
      const descriptor = buildBulkVerbResource(resource, verb, TARGETS);
      for (const f of descriptor.fields) {
        expect(f.required, `${name} asks for ${f.name} — a fieldless verb must ask for nothing`)
          .toBeFalsy();
      }
    }
  });
});

describe('products.set-category — live on open, but still a real form', () => {
  it('Apply is live, and the declared argument is still required', async () => {
    const descriptor = buildBulkVerbResource('products', 'set-category', TARGETS);
    const sheet = openSheet(descriptor, 'set-category', batchTargetsInitial(NAMES));
    expect(sheet.applyEnabled).toBe(true);
    // The hazard the seeded line creates: this verb writes `null` to
    // CLEAR, so an unanswered Category on a live button is a mass-clear
    // of the whole selection. The required check catches the missing
    // case, so it is pinned here — but only the missing case: see below.
    await expect(sheet.pressApply()).rejects.toThrow('Missing required field: Category');
    expect(reqs).toHaveLength(0);
  });

  /*
   * REGRESSION. `required` is NOT the whole guard, and reading it as
   * though it were is how the mass-clear gets through.
   *
   * The package's check is `merged[f.name] == null` — an EMPTY STRING
   * sails past it. The BFF's plan sanitizer admits one too (`typeOk`
   * for a `string` field is `typeof value === 'string'`), so a plan
   * proposing `{"categoryId": ""}` reaches the draft of a verb that is
   * NOT destructive and therefore has no confirm dialog. Before the
   * fix, `categoryTarget('')` folded blank into `null` and one press of
   * a live "Set category" stripped the category off every ticked row —
   * up to 500 products in a single request, silently.
   *
   * Clearing is now only ever something the merchant ASKED for: an
   * explicit null, or the picker's own "Remove category" sentinel.
   */
  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('a blank Category (%s) is refused, NOT read as "clear them all"', async (_label, value) => {
    const descriptor = buildBulkVerbResource('products', 'set-category', TARGETS);
    const sheet = openSheet(descriptor, 'set-category', batchTargetsInitial(NAMES));
    // It gets past `required` — that is the whole point of this test.
    await expect(sheet.pressApply({ categoryId: value })).rejects.toThrow(/Pick a category/);
    expect(reqs, 'a blank answer must never reach the bulk route').toHaveLength(0);
  });

  it('clearing still works when it is ASKED for — sentinel or explicit null', async () => {
    const descriptor = buildBulkVerbResource('products', 'set-category', TARGETS);
    // The picker's "Remove category" row.
    await openSheet(descriptor, 'set-category', batchTargetsInitial(NAMES)).pressApply({
      categoryId: 'none',
    });
    expect(reqs[0]!.body).toEqual({ productIds: ['row_1', 'row_2'], categoryId: null });
    // …and a plan that says null outright (the chat-card path; the
    // sheet's own required check stops this one earlier).
    reqs = [];
    await descriptor.apply({ mode: 'set-category', fields: { categoryId: null } });
    expect(reqs[0]!.body.categoryId).toBeNull();
  });

  it('picking one sends the whole selection in one request, target line stripped', async () => {
    const descriptor = buildBulkVerbResource('products', 'set-category', TARGETS);
    const sheet = openSheet(descriptor, 'set-category', batchTargetsInitial(NAMES));
    await sheet.pressApply({ categoryId: 'cat_1' });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.body).toEqual({ productIds: ['row_1', 'row_2'], categoryId: 'cat_1' });
  });
});

// ── the line is a LABEL, never a payload ────────────────────────────

describe('the seeded target line never reaches a record', () => {
  const saved = new Map<AssistantResource, ResourceBuilder>();

  afterEach(() => {
    for (const [key, builder] of saved) RESOURCE_BUILDERS[key] = builder;
    saved.clear();
  });

  /** Swap a resource's builder for a probe that records exactly what
   *  the batch fan-out hands its single-record apply. Nothing else can
   *  see those args, and they are the whole contract: the fan-out must
   *  strip the seeded line before the record's own apply runs. */
  function probe(resource: AssistantResource) {
    const calls: { fields: Fields; initial?: Partial<Fields> }[] = [];
    saved.set(resource, RESOURCE_BUILDERS[resource]);
    RESOURCE_BUILDERS[resource] = () => ({
      slug: resource,
      label: 'record',
      fields: [],
      examplePrompts: [],
      buildAgentPrompt: () => '',
      apply: async ({ fields, initial }) => {
        calls.push({ fields, initial });
        return undefined;
      },
    });
    return calls;
  }

  it('the single-record apply never sees it, whatever the merge carried in', async () => {
    const calls = probe('categories');
    const descriptor = buildBulkVerbResource('categories', 'delete', TARGETS);
    const sheet = openSheet(descriptor, 'delete', batchTargetsInitial(NAMES));
    await sheet.pressApply();

    expect(calls).toHaveLength(TARGETS.length);
    for (const [i, call] of calls.entries()) {
      expect(
        Object.keys(call.fields),
        'the target line is chrome — a record apply must never be handed it',
      ).not.toContain(BATCH_TARGETS_FIELD);
      // The row acted on is still the row the merchant ticked.
      expect(call.initial).toEqual(TARGETS[i]);
    }
  });

  it('a plan that echoes it back is stripped too', async () => {
    const calls = probe('customers');
    const descriptor = buildBulkVerbResource('customers', 'delete', TARGETS);
    const sheet = openSheet(descriptor, 'delete', batchTargetsInitial(NAMES));
    await sheet.pressApply({ [BATCH_TARGETS_FIELD]: 'something the agent made up' });
    for (const call of calls) {
      expect(Object.keys(call.fields)).not.toContain(BATCH_TARGETS_FIELD);
    }
  });

  it('nothing on the wire carries it either', async () => {
    for (const [, resource, verb] of FIELDLESS) {
      reqs = [];
      const descriptor = buildBulkVerbResource(resource, verb, TARGETS);
      await openSheet(descriptor, verb, batchTargetsInitial(NAMES)).pressApply();
      expect(JSON.stringify(reqs)).not.toContain(BATCH_TARGETS_FIELD);
    }
  });
});

// ── the edit path is untouched ──────────────────────────────────────

describe('bulk EDIT keeps its own contract', () => {
  it('no target line, and a blank form is still the instruction to keep', () => {
    const descriptor = buildBulkEditResource('products', TARGETS);
    expect(descriptor.fields.map((f) => f.name)).not.toContain(BATCH_TARGETS_FIELD);
    // Blank-means-keep, so the sheet legitimately opens un-appliable
    // until the merchant types the change they want.
    expect(openSheet(descriptor, 'edit', undefined).applyEnabled).toBe(false);
  });
});

// ── the wiring the model stands in for ──────────────────────────────

const SHEET_TSX = readFileSync(
  join(__dirname, '..', '..', 'components', 'catentio', 'agentic-sheet.tsx'),
  'utf8',
);

function componentSource(name: string): string {
  const at = SHEET_TSX.indexOf(`export function ${name}(`);
  expect(at, `${name} is gone from agentic-sheet.tsx`).toBeGreaterThan(-1);
  const next = SHEET_TSX.indexOf('\nexport function ', at + 1);
  return SHEET_TSX.slice(at, next === -1 ? undefined : next);
}

describe('the verb slot actually mounts with the seed', () => {
  it('CatentioBulkVerbSheet passes batchTargetsInitial as `initial`', () => {
    // The model above proves the seed makes Apply live; this is the
    // only thing left that could still ship it dead — a sheet mounted
    // without it. (No jsdom in this project, so the mount is read
    // rather than rendered — same idiom as the zero-sparkle guard.)
    expect(componentSource('CatentioBulkVerbSheet')).toContain(
      'initial={batchTargetsInitial(names)}',
    );
  });

  it('the static kind has a renderer, or the target line renders as nothing', () => {
    expect(SHEET_TSX).toMatch(/static: \{ render:/);
  });

  it('CatentioBulkEditSheet still mounts with NO initial', () => {
    expect(componentSource('CatentioBulkEditSheet')).not.toContain('initial=');
  });
});
