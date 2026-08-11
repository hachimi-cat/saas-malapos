import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildBulkEditResource,
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

const TARGETS: Record<string, unknown>[] = [
  { id: 'row_1', name: 'First', label: 'First', title: 'First', productId: 'prod_1', planId: 'plan_1' },
  { id: 'row_2', name: 'Second', label: 'Second', title: 'Second', productId: 'prod_1', planId: 'plan_1' },
];

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
      await bulk.apply({ mode: 'edit', fields: EDIT_PATCH[resource] });
      expect(writes().length).toBeGreaterThan(0);
      for (const w of writes()) {
        expect(['PATCH', 'PUT'], `${resource} issued a ${w.method} — bulk edit must not create`).toContain(
          w.method,
        );
      }
    },
  );

  it.each(BULK_EDIT_RESOURCES.map((r) => [r] as const))(
    '%s: nothing required, no per-record kinds survive, checkboxes become optional selects',
    (resource) => {
      const single = buildCrudResource(resource, 'edit');
      const bulk = buildBulkEditResource(resource, TARGETS);
      expect(bulk.fields.length).toBeGreaterThan(0);
      for (const f of bulk.fields) {
        expect(f.required, `${resource}.${f.name} is required`).toBeFalsy();
        expect(['repeater', 'keyed-rows', 'files', 'avatar']).not.toContain(String(f.kind));
      }
      const names = bulk.fields.map((f) => f.name);
      for (const key of Object.keys(EDIT_PATCH[resource])) {
        expect(names, `${resource}: fixture key ${key} not in descriptor`).toContain(key);
      }
      for (const f of single.fields.filter((f) => f.kind === 'checkbox')) {
        const b = bulk.fields.find((x) => x.name === f.name);
        expect(b?.kind, `${resource}.${f.name} should be a select`).toBe('select');
        expect(b?.options?.map((o) => o.value).sort()).toEqual(['false', 'true']);
      }
    },
  );

  it.each(BULK_EDIT_RESOURCES.map((r) => [r] as const))(
    '%s: one patch fans out to every target through the edit apply',
    async (resource) => {
      const bulk = buildBulkEditResource(resource, TARGETS);
      await bulk.apply({ mode: 'edit', fields: EDIT_PATCH[resource] });
      expect(writes()).toHaveLength(TARGETS.length);
      for (const [i, t] of TARGETS.entries()) {
        expect(writes()[i].url, `${resource}: write ${i} should target ${t.id}`).toContain(
          String(t.id),
        );
      }
    },
  );

  it('refuses an all-blank patch instead of writing nothing N times', async () => {
    const bulk = buildBulkEditResource('products', TARGETS);
    await expect(
      bulk.apply({ mode: 'edit', fields: { name: '', description: '' } }),
    ).rejects.toThrow('Fill in at least one field');
    expect(writes()).toHaveLength(0);
  });

  it('blank means KEEP: unset fields never travel', async () => {
    const bulk = buildBulkEditResource('customers', TARGETS);
    await bulk.apply({
      mode: 'edit',
      fields: { name: 'New name', phone: '', note: '' },
    });
    expect(writes()).toHaveLength(2);
    for (const w of writes()) {
      expect(w.body.name).toBe('New name');
      expect('phone' in w.body, 'blank field leaked into the patch').toBe(false);
    }
  });

  it('continues past a failure and throws naming the record that kept its values', async () => {
    failOn = (_r, n) => n === 1;
    const bulk = buildBulkEditResource('customers', TARGETS);
    await expect(
      bulk.apply({ mode: 'edit', fields: { name: 'New name' } }),
    ).rejects.toThrow(/^Changed 1 of 2\. These did not: First \(/);
    // Both writes were ATTEMPTED — the first failing did not strand row_2.
    expect(writes()).toHaveLength(2);
  });
});
