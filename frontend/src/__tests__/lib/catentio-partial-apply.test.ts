import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isPartialApply } from '@forjio/agent-ui';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBulkEditResource,
  buildBulkEditRows,
  buildBulkVerbResource,
  buildCrudResource,
  BULK_EDIT_ROWS,
} from '@/components/catentio/resources';
import { deleteMany } from '@/lib/bulk';
import { ApiRequestError } from '@/lib/api';

/**
 * A BATCH THAT GOT PART-WAY THROUGH.
 *
 * "Deleted 2 of 3" is not just a message: two records are GONE, so the
 * list behind the sheet is now wrong. Until @forjio/agent-ui 0.21.0 the
 * sheet had no way to know that — `onApplied` fired on TOTAL success
 * only, so after a partial run the two dead rows kept rendering as if
 * alive, the ticks stayed on them, and the merchant's next Apply
 * re-fired the whole selection at records that no longer existed.
 *
 * Two halves close it, and this suite pins both:
 *
 *  1. the fan-out throws `PartialApplyError` (not a plain Error) when —
 *     and only when — something actually moved, which is the signal the
 *     sheet turns into "tell the host to refetch". Nothing applied stays
 *     a plain Error, so an ordinary 400 can never read as "it half
 *     worked";
 *  2. the descriptor remembers WHICH records went through, so the
 *     second Apply retries the failures and nothing else — and the
 *     sentence keeps counting against the original selection instead of
 *     resetting to "Deleted 0 of 3".
 *
 * Same global fetch stub as the sibling batch suites.
 */

type Req = { method: string; url: string; body: Record<string, unknown> };

let reqs: Req[] = [];
/** Ids (in the URL) and names (in the body) the fake server refuses. */
let refuse = new Set<string>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  reqs = [];
  refuse = new Set();
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (method !== 'GET') {
      reqs.push({ method, url: String(url), body });
      const refused =
        [...refuse].some((r) => String(url).includes(r)) ||
        refuse.has(String(body.name ?? ''));
      if (refused) {
        throw new ApiRequestError(409, { code: 'CONFLICT', message: 'in use by a product' });
      }
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ data: { category: { id: `cat_${reqs.length}` } }, meta: {} }),
      text: async () => JSON.stringify({ data: { category: { id: `cat_${reqs.length}` } }, meta: {} }),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

/** Three ticked categories — the live case bang forced on staging. */
const THREE: Record<string, unknown>[] = [
  { id: 'cat_a', name: 'Alpha' },
  { id: 'cat_b', name: 'Beta' },
  { id: 'cat_c', name: 'Gamma' },
];

/** The ids each write hit, in order — one line per record touched. */
const touched = () => reqs.map((r) => r.url.split('/').pop());

async function applyAndCatch(
  apply: () => Promise<unknown>,
): Promise<Error & { applied?: number; total?: number }> {
  try {
    await apply();
  } catch (e) {
    return e as Error & { applied?: number; total?: number };
  }
  throw new Error('expected the apply to throw');
}

// ── the signal ──────────────────────────────────────────────────────

describe('a batch verb that got part-way through', () => {
  it('throws PartialApplyError carrying how many actually moved', async () => {
    refuse = new Set(['cat_c']);
    const bulk = buildBulkVerbResource('categories', 'delete', THREE);

    const e = await applyAndCatch(() => bulk.apply({ mode: 'delete', fields: {} }));

    // The CLASS is the whole point — it is what makes the sheet fire
    // onApplied so the page refetches. The sentence is unchanged.
    expect(e.name).toBe('PartialApplyError');
    expect(isPartialApply(e)).toBe(true);
    expect(e.applied).toBe(2);
    expect(e.total).toBe(3);
    expect(e.message).toBe(
      'Deleted 2 of 3. These did not: Gamma (in use by a product)',
    );
    // …and the failure did not abandon anything: all three were tried.
    expect(touched()).toEqual(['cat_a', 'cat_b', 'cat_c']);
  });

  it('stays an ORDINARY error when nothing moved — no reload to ask for', async () => {
    refuse = new Set(['cat_a', 'cat_b', 'cat_c']);
    const bulk = buildBulkVerbResource('categories', 'delete', THREE);

    const e = await applyAndCatch(() => bulk.apply({ mode: 'delete', fields: {} }));

    expect(e.name).toBe('Error');
    expect(isPartialApply(e)).toBe(false);
    expect(e.message).toBe(
      'Deleted 0 of 3. These did not: Alpha (in use by a product); Beta (in use by a product); Gamma (in use by a product)',
    );
  });

  it('throws nothing at all when every record goes through', async () => {
    const bulk = buildBulkVerbResource('categories', 'delete', THREE);
    await expect(bulk.apply({ mode: 'delete', fields: {} })).resolves.toBeUndefined();
    expect(touched()).toEqual(['cat_a', 'cat_b', 'cat_c']);
  });
});

// ── the retry ───────────────────────────────────────────────────────

/** The prefilled batch-edit form with the merchant's edit typed into
 *  every row — what the sheet hands `apply`. */
function editedRows(
  bulk: ReturnType<typeof buildBulkEditResource>,
  targets: Record<string, unknown>[],
  patchFields: Record<string, unknown>,
) {
  const draft = buildBulkEditRows(bulk, targets) as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  for (const t of targets) Object.assign(draft[BULK_EDIT_ROWS][String(t.id)], patchFields);
  return draft;
}

describe('Apply again, after a partial run', () => {
  it('retries ONLY the failures, and keeps counting against the whole selection', async () => {
    refuse = new Set(['cat_c']);
    const bulk = buildBulkVerbResource('categories', 'delete', THREE);
    await applyAndCatch(() => bulk.apply({ mode: 'delete', fields: {} }));

    // The sheet stays open on a partial run, so this descriptor — and
    // its memory of who went through — is the same one.
    reqs = [];
    const e = await applyAndCatch(() => bulk.apply({ mode: 'delete', fields: {} }));

    expect(touched(), 'cat_a and cat_b are already gone — re-deleting them is a 404 storm').toEqual(['cat_c']);
    // Truthful: two of those three ARE deleted. Not "Deleted 0 of 3".
    expect(e.message).toBe('Deleted 2 of 3. These did not: Gamma (in use by a product)');
    expect(e.applied).toBe(2);
    expect(e.total).toBe(3);
  });

  it('finishes clean once the last one relents — one request, no throw', async () => {
    refuse = new Set(['cat_c']);
    const bulk = buildBulkVerbResource('categories', 'delete', THREE);
    await applyAndCatch(() => bulk.apply({ mode: 'delete', fields: {} }));

    refuse = new Set();
    reqs = [];
    await expect(bulk.apply({ mode: 'delete', fields: {} })).resolves.toBeUndefined();
    expect(touched()).toEqual(['cat_c']);
  });

  it('bulk edit remembers PER ROW: fixing the refusal writes only that row', async () => {
    // Bulk edit is the fan-out whose records each carry their own body
    // now, so its memory is keyed per row. Under the old whole-batch
    // key, editing the one row the server refused counted as a new
    // instruction and re-PATCHed the two that already landed.
    refuse = new Set(['cat_c']);
    const bulk = buildBulkEditResource('categories', THREE);
    const draft = editedRows(bulk, THREE, { sortOrder: '1' });
    await applyAndCatch(() => bulk.apply({ mode: 'edit', fields: draft }));
    expect(touched()).toEqual(['cat_a', 'cat_b', 'cat_c']);

    // The merchant fixes the row that was refused and presses Apply.
    refuse = new Set();
    reqs = [];
    draft[BULK_EDIT_ROWS].cat_c.sortOrder = '2';
    await bulk.apply({ mode: 'edit', fields: draft });
    expect(touched(), 'cat_a and cat_b already carry their value').toEqual(['cat_c']);

    // …and the SAME form again is a retry with nothing left to do.
    reqs = [];
    await bulk.apply({ mode: 'edit', fields: draft });
    expect(touched()).toEqual([]);
  });

  it('editing a row that already landed writes it again — it is a new value', async () => {
    const bulk = buildBulkEditResource('categories', THREE);
    const draft = editedRows(bulk, THREE, { sortOrder: '1' });
    await bulk.apply({ mode: 'edit', fields: draft });
    expect(touched()).toEqual(['cat_a', 'cat_b', 'cat_c']);

    reqs = [];
    draft[BULK_EDIT_ROWS].cat_a.sortOrder = '9';
    await bulk.apply({ mode: 'edit', fields: draft });
    expect(touched()).toEqual(['cat_a']);
  });
});

// ── the other two fan-outs ──────────────────────────────────────────

describe('bulk edit', () => {
  it('reports a partial patch as a PartialApplyError in the same shape', async () => {
    refuse = new Set(['cat_c']);
    const bulk = buildBulkEditResource('categories', THREE);

    const e = await applyAndCatch(() =>
      bulk.apply({ mode: 'edit', fields: editedRows(bulk, THREE, { name: 'Renamed' }) }),
    );

    expect(isPartialApply(e)).toBe(true);
    expect(e.applied).toBe(2);
    expect(e.total).toBe(3);
    expect(e.message).toBe('Changed 2 of 3. These did not: Gamma (in use by a product)');
  });

  it('a patch nothing accepted is an ordinary error', async () => {
    refuse = new Set(['cat_a', 'cat_b', 'cat_c']);
    const bulk = buildBulkEditResource('categories', THREE);
    const e = await applyAndCatch(() =>
      bulk.apply({ mode: 'edit', fields: editedRows(bulk, THREE, { name: 'Renamed' }) }),
    );
    expect(isPartialApply(e)).toBe(false);
    expect(e.message).toMatch(/^Changed 0 of 3\. These did not: /);
  });
});

describe('bulk create (the "And also" rows)', () => {
  /** The singular record plus two more rows, one of which the server
   *  refuses by name. */
  const rows = { name: 'Alpha', alsoCreate: [{ name: 'Beta' }, { name: 'Gamma' }] };

  it('a row that did not land leaves the ones that DID needing a reload', async () => {
    refuse = new Set(['Gamma']);
    const create = buildCrudResource('categories', 'create');

    const e = await applyAndCatch(() => create.apply({ mode: 'create', fields: rows }));

    expect(isPartialApply(e)).toBe(true);
    expect(e.applied).toBe(2);
    expect(e.total).toBe(3);
    expect(e.message).toBe('Added 2 of 3. These did not: Gamma (in use by a product)');
    expect(reqs.map((r) => r.body.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('Apply again does not mint Alpha and Beta a second time', async () => {
    refuse = new Set(['Gamma']);
    const create = buildCrudResource('categories', 'create');
    await applyAndCatch(() => create.apply({ mode: 'create', fields: rows }));

    reqs = [];
    const e = await applyAndCatch(() => create.apply({ mode: 'create', fields: rows }));
    expect(reqs.map((r) => r.body.name), 'the two that landed must not be created twice').toEqual(['Gamma']);
    expect(e.message).toBe('Added 2 of 3. These did not: Gamma (in use by a product)');
  });

  it('an EDITED row is a different record and is created', async () => {
    refuse = new Set(['Gamma']);
    const create = buildCrudResource('categories', 'create');
    await applyAndCatch(() => create.apply({ mode: 'create', fields: rows }));

    reqs = [];
    await expect(
      create.apply({
        mode: 'create',
        fields: { name: 'Alpha', alsoCreate: [{ name: 'Beta' }, { name: 'Delta' }] },
      }),
    ).resolves.toBeUndefined();
    expect(reqs.map((r) => r.body.name)).toEqual(['Delta']);
  });
});

// ── the manual (assistant-off) executors ────────────────────────────

describe('lib/bulk stays on a plain Error, deliberately', () => {
  /**
   * `deleteMany` / `actMany` back the ASSISTANT-OFF flows (the
   * BulkDeleteDialog, the row confirms), which already reload in a
   * `finally` — all 15 call sites do — so the class carries no signal
   * there. And the reason not to change it anyway is hard: lib/bulk.ts
   * is statically imported by pages, so importing @forjio/agent-ui into
   * it would drag the package into every one of their bundles.
   */
  it('names what did not happen without claiming a reload', async () => {
    const e = await applyAndCatch(() =>
      deleteMany(
        [
          { id: 'cat_a', label: 'Alpha' },
          { id: 'cat_c', label: 'Gamma' },
        ],
        async (id) => {
          if (id === 'cat_c') throw new Error('in use by a product');
        },
      ),
    );
    expect(e.message).toBe('Deleted 1 of 2. These did not: Gamma (in use by a product)');
    expect(isPartialApply(e)).toBe(false);
  });
});

// ── every wired page must behave ────────────────────────────────────

describe('the pages behind the batch sheets', () => {
  /**
   * A partial run reloads the list WITHOUT closing the sheet, so a
   * page's `onApplied` may no longer treat every call as "done": it has
   * to refetch on both outcomes but close and clear the ticks only on
   * 'applied'. A page that skips the branch tears its own sheet down
   * mid-error and loses the retry.
   *
   * The list is derived from the source rather than typed out, so a new
   * batch page joins this contract the day it mounts a slot.
   */
  const SRC = join(__dirname, '..', '..');
  const pages = [
    'app/(dashboard)/dashboard/products/page.tsx',
    'app/(dashboard)/dashboard/categories/page.tsx',
    'app/(dashboard)/dashboard/customers/page.tsx',
    'app/(dashboard)/dashboard/webhooks/page.tsx',
    'app/(dashboard)/dashboard/modifiers/page.tsx',
    'app/(dashboard)/dashboard/outlets/page.tsx',
    'app/(dashboard)/dashboard/tables/page.tsx',
    'app/(dashboard)/dashboard/purchasing/page.tsx',
    'app/(dashboard)/dashboard/fulfillment/warehouses/page.tsx',
    'app/(dashboard)/dashboard/payments/plans/page.tsx',
    'app/(dashboard)/dashboard/payments/customers/page.tsx',
    'app/(dashboard)/dashboard/marketing/blog/page.tsx',
    'app/(dashboard)/dashboard/marketing/campaigns/page.tsx',
    'app/(dashboard)/dashboard/marketing/discount-codes/page.tsx',
    'app/(dashboard)/dashboard/marketing/funnels/page.tsx',
    'app/(dashboard)/dashboard/marketing/affiliate-approvals/page.tsx',
  ];

  it.each(pages)('%s branches its slot handlers on the outcome', (rel) => {
    const src = readFileSync(join(SRC, rel), 'utf8');
    const slots = src.match(/<Bulk(Edit|Verb)Slot\b/g) ?? [];
    expect(slots.length, `${rel}: no batch slot — drop it from this list`).toBeGreaterThan(0);
    const handlers = src.match(/onApplied=\{async \(outcome\) => \{/g) ?? [];
    expect(handlers.length, `${rel}: every slot handler must take the outcome`).toBe(slots.length);
    expect((src.match(/if \(outcome === 'applied'\) \{/g) ?? []).length).toBe(slots.length);
  });

  it('no batch slot anywhere still swallows the outcome', () => {
    // The whole-tree sweep: a page not on the list above must not mount
    // a slot with the old argument-less handler either.
    const offenders: string[] = [];
    for (const rel of pages) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      const before = src.split(/<Bulk(?:Edit|Verb)Slot\b/).slice(1);
      for (const chunk of before) {
        const head = chunk.slice(0, chunk.indexOf('/>'));
        if (head.includes('onApplied={async () =>')) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
