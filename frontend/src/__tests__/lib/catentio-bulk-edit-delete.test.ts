import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pluralNoun } from '@/components/catentio/capabilities';
import {
  buildBulkEditResource,
  buildBulkEditRows,
  BULK_EDIT_ROWS,
  buildCrudResource,
  BULK_EDIT_RESOURCES,
} from '@/components/catentio/resources';
import { deleteMany, errorMessage } from '@/lib/bulk';
import { ApiRequestError } from '@/lib/api';

/**
 * Batch EDIT and batch DELETE — the selection-driven half of the
 * catentio sheet (batch create is exercised through withBulk in the same
 * registry). The contract, mirrored from storlaunch and plugipay:
 *
 *  - ONE patch body, applied to every selected record through the
 *    resource's OWN edit apply — no second write path.
 *  - blank means KEEP: only fields the merchant set travel, and a
 *    checkbox becomes an optional select so an untouched toggle cannot
 *    silently flip N records.
 *  - a failure does not abandon the records after it; a partial run
 *    THROWS naming what did not change / did not delete.
 *
 * Malapos speaks the same fetch client on every surface (marketing and
 * payment resources proxy through the backend, so they are fetch too),
 * so one global fetch stub captures every write.
 */

type Req = { method: string; url: string; body: Record<string, unknown> };

let reqs: Req[] = [];
let failOn: ((r: Req, n: number) => boolean) | null = null;
let seen = 0;
const realFetch = globalThis.fetch;

function record(method: string, url: string, body: Record<string, unknown>) {
  const r = { method: method.toUpperCase(), url, body };
  if (r.method === 'GET') return;
  reqs.push(r);
  if (failOn?.(r, ++seen)) {
    // Shape it like the real envelope so errorMessage has something to
    // read — an ApiRequestError, exactly what the api client throws.
    throw new ApiRequestError(409, { code: 'CONFLICT', message: 'rejected by the server' });
  }
}

beforeEach(() => {
  reqs = [];
  failOn = null;
  seen = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    record(init?.method ?? 'get', String(url), body);
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

const writes = () => reqs;

// ── batch delete ────────────────────────────────────────────────────

describe('deleteMany', () => {
  it('deletes every target and resolves', async () => {
    const gone: string[] = [];
    await deleteMany(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      async (id) => {
        gone.push(id);
      },
    );
    expect(gone).toEqual(['a', 'b']);
  });

  it('continues past a failure and throws naming the survivors', async () => {
    const gone: string[] = [];
    await expect(
      deleteMany(
        [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
        ],
        async (id) => {
          if (id === 'b') throw new Error('has sales history');
          gone.push(id);
        },
      ),
    ).rejects.toThrow('Deleted 2 of 3. These did not: B (has sales history)');
    // a AND c both went — the failure in the middle did not stop the run.
    expect(gone).toEqual(['a', 'c']);
  });

  it('errorMessage reads the ApiRequestError message the client already built', () => {
    expect(
      errorMessage(
        new ApiRequestError(409, {
          code: 'CONFLICT',
          message: 'this customer has sales history and cannot be deleted',
        }),
      ),
    ).toBe('this customer has sales history and cannot be deleted');
    expect(errorMessage(new Error('plain'))).toBe('plain');
    expect(errorMessage('nonsense')).toBe('unknown error');
  });
});

// ── batch edit ──────────────────────────────────────────────────────

/** One field each resource's edit path accepts, with a settable value.
 *  Asserted against the descriptor below, so a rename fails loudly here
 *  instead of making the fan-out tests vacuous. */
const EDIT_PATCH: Record<string, Record<string, unknown>> = {
  products: { name: 'Kopi Susu v2' },
  categories: { name: 'Minuman v2' },
  modifiers: { name: 'Ukuran v2' },
  outlets: { name: 'Cabang Selatan' },
  tables: { label: 'T-12' },
  suppliers: { name: 'PT Pemasok v2' },
  customers: { name: 'Budi v2' },
  'webhook-subscriptions': { active: 'true' },
  'discount-codes': { description: 'Batch Ramadan' },
  plans: { name: 'Pro v2' },
  warehouses: { name: 'Gudang Bandung' },
  'payment-customers': { name: 'Budi Bayar v2' },
  'marketing-campaigns': { name: 'Ramadan 2027' },
  'blog-posts': { title: 'Judul v2' },
  funnels: { name: 'Sambutan v2' },
};

/** Two records, carrying at least one field EVERY bulk-editable form
 *  renders — `active` for webhook-subscriptions (its whole edit form)
 *  and `description` for discount-codes. Without them the prefill
 *  assertion below would be vacuous for those two, which is exactly
 *  what its own guard refuses to let happen. */
const TARGETS: Record<string, unknown>[] = [
  {
    id: 'row_1',
    name: 'First',
    label: 'First',
    title: 'First',
    description: 'First',
    active: true,
    productId: 'prod_1',
    planId: 'plan_1',
  },
  {
    id: 'row_2',
    name: 'Second',
    label: 'Second',
    title: 'Second',
    description: 'Second',
    active: true,
    productId: 'prod_1',
    planId: 'plan_1',
  },
];

/** The merchant's edit typed into every row, on top of the prefill —
 *  which is what the sheet hands `apply` once the form is filled in. */
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

describe('buildBulkEditResource', () => {
  it('covers exactly the intended resources (canary)', () => {
    expect(BULK_EDIT_RESOURCES).toHaveLength(15);
    // Singletons (settings, loyalty/referral programs, feeds, pixels,
    // abandoned-cart, delivery-origin) are absent: there is one record,
    // nothing to select. Create-only resources (refunds, gift-cards,
    // stock moves, prices, payouts, shipments…) are absent because their
    // apply CREATES — bulk-editing them would mint N records.
    for (const r of BULK_EDIT_RESOURCES) {
      expect(EDIT_PATCH[r], `EDIT_PATCH fixture missing for ${r}`).toBeTruthy();
    }
  });

  it.each(BULK_EDIT_RESOURCES.map((r) => [r] as const))(
    '%s: bulk edit UPDATES, never creates (a create-only builder listed here would mint N records)',
    async (resource) => {
      const bulk = buildBulkEditResource(resource, TARGETS);
      await bulk.apply({ mode: 'edit', fields: editedRows(bulk, TARGETS, EDIT_PATCH[resource]) });
      expect(writes().length).toBeGreaterThan(0);
      for (const w of writes()) {
        expect(['PATCH', 'PUT'], `${resource} issued a ${w.method} — bulk edit must not create`).toContain(
          w.method,
        );
      }
    },
  );

  it.each(BULK_EDIT_RESOURCES.map((r) => [r] as const))(
    '%s: the whole form is one row per selected record, and a row IS the single-record form',
    (resource) => {
      const single = buildCrudResource(resource, 'edit');
      const bulk = buildBulkEditResource(resource, TARGETS);

      expect(bulk.fields.map((f) => f.name)).toEqual([BULK_EDIT_ROWS]);
      const rows = bulk.fields[0];
      expect(rows.kind).toBe('keyed-rows');
      expect(rows.rowKeys?.map((r) => r.key)).toEqual(TARGETS.map((t) => t.id));

      const carried = single.fields.filter(
        (f) => !['repeater', 'keyed-rows', 'files', 'avatar'].includes(String(f.kind)),
      );
      expect(rows.itemFields?.map((f) => f.name)).toEqual(carried.map((f) => f.name));
      for (const f of carried) {
        const item = rows.itemFields?.find((x) => x.name === f.name);
        expect(item?.kind, `${resource}.${f.name} kind`).toBe(f.kind);
        expect(
          Boolean(item?.required),
          `${resource}.${f.name} required must mirror the single form`,
        ).toBe(Boolean(f.required));
      }
      const names = rows.itemFields?.map((f) => f.name) ?? [];
      for (const key of Object.keys(EDIT_PATCH[resource])) {
        expect(names, `${resource}: fixture key ${key} not in descriptor`).toContain(key);
      }
      // The relaxation the shared-patch form needed is gone: a checkbox
      // is a checkbox again, because an untouched one now reads that
      // record's OWN stored value rather than a blanket false.
      for (const f of single.fields.filter((f) => f.kind === 'checkbox')) {
        expect(rows.itemFields?.find((x) => x.name === f.name)?.kind).toBe('checkbox');
      }
    },
  );

  it.each(BULK_EDIT_RESOURCES.map((r) => [r] as const))(
    '%s: each row is seeded from its own record and PATCHes only that record',
    async (resource) => {
      const bulk = buildBulkEditResource(resource, TARGETS);
      const draft = buildBulkEditRows(bulk, TARGETS) as Record<
        string,
        Record<string, Record<string, unknown>>
      >;
      expect(Object.keys(draft[BULK_EDIT_ROWS])).toEqual(TARGETS.map((t) => t.id));
      // The row OPENS on its record. Asserted against the fixture
      // rather than by recomputing the projection, so an empty prefill
      // cannot pass: every field this form renders that the record
      // actually has must be in its row, holding that record's value.
      const shown = new Set(bulk.fields[0].itemFields?.map((f) => f.name) ?? []);
      for (const t of TARGETS) {
        const expected = Object.entries(t).filter(([k]) => shown.has(k));
        expect(
          expected.length,
          `${resource}: the fixture carries no field this form renders — the assertion below would be vacuous`,
        ).toBeGreaterThan(0);
        for (const [k, v] of expected) {
          expect(draft[BULK_EDIT_ROWS][String(t.id)][k], `${resource}.${k} not seeded`).toBe(v);
        }
      }
      // The same value in both rows — it has to be VALID for the field,
      // and rows edited to DIFFERENT values are covered on customers
      // below.
      for (const t of TARGETS) {
        Object.assign(draft[BULK_EDIT_ROWS][String(t.id)], EDIT_PATCH[resource]);
      }
      await bulk.apply({ mode: 'edit', fields: draft });
      expect(writes()).toHaveLength(TARGETS.length);
      for (const [i, t] of TARGETS.entries()) {
        expect(writes()[i].url, `${resource}: write ${i} should target ${t.id}`).toContain(
          String(t.id),
        );
      }
    },
  );

  it('names N of them in English — "3 categorys" is not a plural', () => {
    // Every batch surface that names the noun goes through pluralNoun,
    // which is why the form's own heading can be asserted here.
    expect(pluralNoun('categories', 3)).toBe('categories');
    expect(pluralNoun('categories', 1)).toBe('category');
    expect(pluralNoun('products', 3)).toBe('products');
    const bulk = buildBulkEditResource('categories', TARGETS);
    expect(bulk.fields[0].label).toBe('Selected categories');
  });

  it('two rows edited differently each get their own body', async () => {
    const bulk = buildBulkEditResource('customers', TARGETS);
    const draft = buildBulkEditRows(bulk, TARGETS) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    draft[BULK_EDIT_ROWS].row_1.name = 'First, revised';
    draft[BULK_EDIT_ROWS].row_2.name = 'Second, revised';
    await bulk.apply({ mode: 'edit', fields: draft });
    expect(writes()).toHaveLength(2);
    expect(writes()[0].url).toContain('row_1');
    expect(writes()[0].body.name).toBe('First, revised');
    expect(writes()[1].url).toContain('row_2');
    expect(writes()[1].body.name).toBe('Second, revised');
  });

  it('an untouched row is not written at all', async () => {
    const bulk = buildBulkEditResource('customers', TARGETS);
    const draft = buildBulkEditRows(bulk, TARGETS) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    draft[BULK_EDIT_ROWS].row_2.name = 'Second, revised';
    await bulk.apply({ mode: 'edit', fields: draft });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].url).toContain('row_2');
  });

  it('an assistant patch is fanned into every row, not parked beside them', () => {
    const bulk = buildBulkEditResource('customers', TARGETS);
    const merged = bulk.mergePlan!({
      draft: buildBulkEditRows(bulk, TARGETS),
      plan: { name: 'Shared name' },
    }) as Record<string, Record<string, Record<string, unknown>>>;
    expect(merged[BULK_EDIT_ROWS].row_1.name).toBe('Shared name');
    expect(merged[BULK_EDIT_ROWS].row_2.name).toBe('Shared name');
    // The flat key does not survive alongside the rows (apply reads
    // rows only), and re-merging at Apply changes nothing.
    expect((merged as Record<string, unknown>).name).toBeUndefined();
    expect(bulk.mergePlan!({ draft: merged, plan: { name: 'Shared name' } })).toEqual(merged);
  });

  it('refuses a form nobody touched instead of rewriting every record with itself', async () => {
    const bulk = buildBulkEditResource('products', TARGETS);
    await expect(
      bulk.apply({ mode: 'edit', fields: buildBulkEditRows(bulk, TARGETS) }),
    ).rejects.toThrow('Nothing changed');
    expect(writes()).toHaveLength(0);
  });

  it('a row carries its OWN record’s values, and a field it never had stays absent', async () => {
    const bulk = buildBulkEditResource('customers', TARGETS);
    await bulk.apply({ mode: 'edit', fields: editedRows(bulk, TARGETS, { name: 'New name' }) });
    expect(writes()).toHaveLength(2);
    for (const w of writes()) {
      expect(w.body.name).toBe('New name');
      // TARGETS carry no phone, so the row never had one and malapos's
      // sparse apply leaves the stored value alone.
      expect('phone' in w.body, 'a field the row never held leaked into the patch').toBe(false);
    }
  });

  it('continues past a failure and throws naming the record that kept its values', async () => {
    failOn = (_r, n) => n === 1;
    const bulk = buildBulkEditResource('customers', TARGETS);
    await expect(
      bulk.apply({ mode: 'edit', fields: editedRows(bulk, TARGETS, { name: 'New name' }) }),
    ).rejects.toThrow(/^Changed 1 of 2\. These did not: First \(/);
    // Both writes were ATTEMPTED — the first failing did not strand row_2.
    expect(writes()).toHaveLength(2);
  });
});
