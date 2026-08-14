import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildBulkVerbResource,
  buildCrudResource,
  pastVerb,
  BULK_VERBS,
} from '@/components/catentio/resources';
import { RESOURCE_EXTRA_ACTIONS, resourceSupports } from '@/components/catentio/capabilities';
import { actMany } from '@/lib/bulk';
import { ApiRequestError } from '@/lib/api';

/**
 * WAVE 2 — batch verbs over a selection (Pattern A), and the one real
 * ids[] endpoint (Pattern B).
 *
 * `buildBulkVerbResource` is `buildBulkEditResource` generalized past
 * `edit`, so the contract it inherits is the same one
 * catentio-bulk-edit-delete.test.ts pins:
 *
 *  - ONE approved field set (or none at all — delete/publish/approve
 *    carry no fields), applied to every selected record through the
 *    resource's OWN single-record apply. No second write path.
 *  - a failure does not abandon the records after it; a partial run
 *    THROWS naming what did not happen, in the product-wide shape
 *    "<Past> N of M. These did not: …".
 *  - where the backend takes ids[] in ONE request, the descriptor
 *    declares `applyMany` and the sheet uses it instead of a loop —
 *    atomic, so there is no partial sentence on that path.
 *
 * Same global fetch stub as the sibling suites: every malapos surface
 * (POS, marketing proxy, payments) speaks the one fetch client.
 */

type Req = { method: string; url: string; body: Record<string, unknown> };

let reqs: Req[] = [];
let failOn: ((r: Req, n: number) => boolean) | null = null;
let seen = 0;
const realFetch = globalThis.fetch;

beforeEach(() => {
  reqs = [];
  failOn = null;
  seen = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (method !== 'GET') {
      const r = { method, url: String(url), body };
      reqs.push(r);
      if (failOn?.(r, ++seen)) {
        throw new ApiRequestError(409, { code: 'CONFLICT', message: 'rejected by the server' });
      }
    }
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

/** Two selected rows carrying everything any wave-2 verb's apply reads
 *  off a row: the id, a name for the failure sentence, and the
 *  affiliate rows' parent programId. */
const TARGETS: Record<string, unknown>[] = [
  { id: 'row_1', name: 'First', title: 'First', programId: 'prog_1' },
  { id: 'row_2', name: 'Second', title: 'Second', programId: 'prog_1' },
];

// ── the table ───────────────────────────────────────────────────────

describe('BULK_VERBS — what a list page may offer over a selection', () => {
  it('covers exactly the intended pairs (canary)', () => {
    expect(BULK_VERBS).toEqual({
      categories: ['delete'],
      products: ['set-category', 'delete'],
      customers: ['delete'],
      'webhook-subscriptions': ['delete'],
      'blog-posts': ['publish', 'unpublish', 'delete'],
      'affiliate-enrollments': ['approve'],
      'affiliate-commissions': ['approve', 'void'],
      // wave-3: the nine pages whose batch delete was manual-only.
      plans: ['delete'],
      outlets: ['delete'],
      modifiers: ['delete'],
      warehouses: ['delete'],
      tables: ['delete'],
      suppliers: ['delete'],
      funnels: ['delete'],
      'marketing-campaigns': ['delete'],
      'discount-codes': ['delete'],
    });
  });

  it('every batch verb is a DECLARED verb of its resource', () => {
    // The frontend mirror of the profile's ActionSpecs. A batch item
    // for an undeclared verb is a sheet whose plan the BFF would 422 —
    // a resource keeps its manual dialog alone until it declares one.
    // wave-3 declared nine of them; `floors` is the shape still left
    // out (a DELETE route, but no batch surface on its page).
    for (const [resource, verbs] of Object.entries(BULK_VERBS)) {
      for (const verb of verbs!) {
        expect(
          RESOURCE_EXTRA_ACTIONS[resource as keyof typeof RESOURCE_EXTRA_ACTIONS] ?? [],
          `${resource}.${verb} is offered as a batch verb but not declared`,
        ).toContain(verb);
      }
    }
  });

  it('refuses a pair no page offers — fail loud, not a silent write', () => {
    // floors has a DELETE route and no batch surface — suppliers was
    // this example until wave-3 gave it one.
    expect(() => buildBulkVerbResource('floors', 'delete', TARGETS)).toThrow(
      /floors does not offer "delete"/,
    );
    // Bulk EDIT has its own builder; the verb sheet must not become a
    // second way in.
    expect(() => buildBulkVerbResource('products', 'edit', TARGETS)).toThrow(
      /does not offer "edit"/,
    );
  });

  it('the affiliate queues are verb-only — create/edit are refused outright', () => {
    for (const resource of ['affiliate-enrollments', 'affiliate-commissions'] as const) {
      expect(resourceSupports(resource, 'create')).toBe(false);
      expect(resourceSupports(resource, 'edit')).toBe(false);
      expect(resourceSupports(resource, 'approve')).toBe(true);
      expect(() => buildCrudResource(resource, 'create')).toThrow(/does not support "create"/);
    }
    expect(resourceSupports('affiliate-commissions', 'void')).toBe(true);
    expect(resourceSupports('affiliate-enrollments', 'void')).toBe(false);
  });

  it('the partial-failure sentence names the verb in the past', () => {
    expect(pastVerb('delete')).toBe('Deleted');
    expect(pastVerb('publish')).toBe('Published');
    expect(pastVerb('approve')).toBe('Approved');
    expect(pastVerb('void')).toBe('Voided');
    // An unmapped verb still produces the contract shape rather than a
    // broken sentence.
    expect(pastVerb('archive')).toBe('Applied');
  });
});

// ── Pattern A: fan-out over the selection ───────────────────────────

/** Every (resource, verb) that fans out, with the field set the sheet
 *  approves and what each per-record write must look like. */
const FANOUT: Array<{
  resource: 'categories' | 'products' | 'customers' | 'webhook-subscriptions' | 'blog-posts' | 'affiliate-enrollments' | 'affiliate-commissions';
  verb: string;
  fields?: Record<string, unknown>;
  method: string;
  /** A fragment every write's URL must carry, `{id}` standing in for
   *  the target's own id. */
  url: string;
}> = [
  { resource: 'categories', verb: 'delete', method: 'DELETE', url: '/api/v1/categories/{id}' },
  { resource: 'products', verb: 'delete', method: 'DELETE', url: '/api/v1/products/{id}' },
  { resource: 'customers', verb: 'delete', method: 'DELETE', url: '/api/v1/customers/{id}' },
  {
    resource: 'webhook-subscriptions',
    verb: 'delete',
    method: 'DELETE',
    url: '/api/v1/webhook-subscriptions/{id}',
  },
  { resource: 'blog-posts', verb: 'delete', method: 'DELETE', url: '/api/v1/account/blog/posts/{id}' },
  {
    resource: 'blog-posts',
    verb: 'publish',
    method: 'POST',
    url: '/api/v1/account/blog/posts/{id}/publish',
  },
  {
    resource: 'blog-posts',
    verb: 'unpublish',
    method: 'POST',
    url: '/api/v1/account/blog/posts/{id}/unpublish',
  },
  {
    resource: 'affiliate-enrollments',
    verb: 'approve',
    method: 'POST',
    url: '/api/v1/account/marketing/programs/prog_1/enrollments/{id}/approve',
  },
  {
    resource: 'affiliate-commissions',
    verb: 'approve',
    method: 'POST',
    url: '/api/v1/account/marketing/programs/prog_1/commissions/{id}/approve',
  },
  {
    resource: 'affiliate-commissions',
    verb: 'void',
    method: 'POST',
    url: '/api/v1/account/marketing/programs/prog_1/commissions/{id}/void',
  },
];

describe('buildBulkVerbResource — one plan turn, N applies', () => {
  it.each(FANOUT.map((c) => [`${c.resource}.${c.verb}`, c] as const))(
    '%s: hits the resource\'s own per-record route once per target',
    async (_name, c) => {
      const bulk = buildBulkVerbResource(c.resource, c.verb, TARGETS);
      await bulk.apply({ mode: c.verb, fields: c.fields ?? {} });
      expect(reqs).toHaveLength(TARGETS.length);
      for (const [i, t] of TARGETS.entries()) {
        expect(reqs[i].method).toBe(c.method);
        expect(reqs[i].url).toContain(c.url.replace('{id}', String(t.id)));
      }
    },
  );

  it.each(FANOUT.map((c) => [`${c.resource}.${c.verb}`, c] as const))(
    '%s: a failure does not abandon the rest, and the run reports what did not happen',
    async (_name, c) => {
      failOn = (_r, n) => n === 1;
      const bulk = buildBulkVerbResource(c.resource, c.verb, TARGETS);
      await expect(bulk.apply({ mode: c.verb, fields: c.fields ?? {} })).rejects.toThrow(
        new RegExp(`^${pastVerb(c.verb)} 1 of 2\\. These did not: First \\(`),
      );
      // BOTH were attempted — the first failing did not strand row_2.
      expect(reqs).toHaveLength(2);
    },
  );

  it('a destructive verb keeps its chrome on the batch sheet', () => {
    for (const [resource, verb] of [
      ['products', 'delete'],
      ['blog-posts', 'delete'],
      ['affiliate-commissions', 'void'],
    ] as const) {
      expect(
        buildBulkVerbResource(resource, verb, TARGETS).destructive,
        `${resource}.${verb} must confirm before applying`,
      ).toBe(true);
    }
    // …and a non-destructive one does not borrow it.
    expect(buildBulkVerbResource('blog-posts', 'publish', TARGETS).destructive).toBe(false);
  });

  it('the sheet says how many records it is about to touch', () => {
    expect(buildBulkVerbResource('blog-posts', 'publish', TARGETS).title).toBe(
      'Publish 2 blog posts',
    );
    expect(buildBulkVerbResource('blog-posts', 'publish', [TARGETS[0]]).title).toBe(
      'Publish 1 blog post',
    );
  });

  it('the affiliate applies read the program off the ROW, never a guess', async () => {
    // A row with no programId is a failure with a named cause, not a
    // POST to /programs/undefined/….
    const bulk = buildBulkVerbResource('affiliate-commissions', 'approve', [
      { id: 'com_1', name: 'Budi' },
    ]);
    await expect(bulk.apply({ mode: 'approve', fields: {} })).rejects.toThrow(
      /Approved 0 of 1\. These did not: Budi \(Missing affiliate program id\)/,
    );
    expect(reqs).toHaveLength(0);
  });

  it('a chat card supplies the program as a declared FIELD (no row to read)', async () => {
    const single = buildCrudResource('affiliate-commissions', 'approve');
    await single.apply({
      mode: 'approve',
      fields: { programId: 'prog_9' },
      initial: { id: 'com_7' },
    });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].url).toContain(
      '/api/v1/account/marketing/programs/prog_9/commissions/com_7/approve',
    );
  });
});

// ── Pattern B: the real ids[] endpoint ──────────────────────────────

describe('products.set-category — the one true batch route', () => {
  it('sends the WHOLE selection in ONE request, not a loop', async () => {
    const bulk = buildBulkVerbResource('products', 'set-category', TARGETS);
    await bulk.apply({ mode: 'set-category', fields: { categoryId: 'cat_1' } });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].method).toBe('POST');
    expect(reqs[0].url).toContain('/api/v1/products/bulk-category');
    expect(reqs[0].body).toEqual({ productIds: ['row_1', 'row_2'], categoryId: 'cat_1' });
  });

  it("'Remove category' clears it — the sentinel never reaches the wire", async () => {
    const bulk = buildBulkVerbResource('products', 'set-category', TARGETS);
    await bulk.apply({ mode: 'set-category', fields: { categoryId: 'none' } });
    expect(reqs[0].body.categoryId).toBeNull();
    // A plan may say null outright; same result.
    reqs = [];
    await bulk.apply({ mode: 'set-category', fields: { categoryId: null } });
    expect(reqs[0].body.categoryId).toBeNull();
  });

  it('the single-record path (a chat card) uses the same route with one id', async () => {
    const single = buildCrudResource('products', 'set-category');
    await single.apply({
      mode: 'set-category',
      fields: { categoryId: 'cat_2' },
      initial: { id: 'prod_9' },
    });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].url).toContain('/api/v1/products/bulk-category');
    expect(reqs[0].body).toEqual({ productIds: ['prod_9'], categoryId: 'cat_2' });
  });

  it('refuses a selection past the route cap in the merchant\'s own words', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ id: `p_${i}`, name: `P${i}` }));
    const bulk = buildBulkVerbResource('products', 'set-category', many);
    await expect(
      bulk.apply({ mode: 'set-category', fields: { categoryId: 'cat_1' } }),
    ).rejects.toThrow(/Move at most 500 products at a time — 501 are selected\./);
    expect(reqs).toHaveLength(0);
  });
});

// ── the assistant-OFF executor ──────────────────────────────────────

describe('actMany', () => {
  it('acts on every target and resolves', async () => {
    const done: string[] = [];
    await actMany('Approved', [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], async (id) => {
      done.push(id);
    });
    expect(done).toEqual(['a', 'b']);
  });

  it('continues past a failure and throws naming what did not happen', async () => {
    const done: string[] = [];
    await expect(
      actMany(
        'Published',
        [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
        ],
        async (id) => {
          if (id === 'b') throw new Error('already published');
          done.push(id);
        },
      ),
    ).rejects.toThrow('Published 2 of 3. These did not: B (already published)');
    expect(done).toEqual(['a', 'c']);
  });

  it("reads the server's own words off an ApiRequestError", async () => {
    await expect(
      actMany('Voided', [{ id: 'a', label: 'A' }], async () => {
        throw new ApiRequestError(409, { code: 'CONFLICT', message: 'already paid out' });
      }),
    ).rejects.toThrow('Voided 0 of 1. These did not: A (already paid out)');
  });
});
