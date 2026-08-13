import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChatAction } from '@forjio/agent-ui';
import { applyChatAction } from '@/components/catentio/chat-actions';

/*
 * The docked chat's Apply path dispatches through the descriptor
 * registry (applyResource) — the ladder that hand-implemented only
 * categories+products and threw a not-supported error for the other
 * 36 resources is gone. Under test:
 *
 *  - CRUD and the wave-1 verbs (delete / publish / unpublish /
 *    mark-paid) reach the SAME api calls the pages make;
 *  - an approvalRequired resource's card now applies (gift-cards was
 *    one of the 19 that always failed);
 *  - `$n` cross-refs resolve against earlier applied results;
 *  - an unknown action rejects cleanly instead of falling into a
 *    builder whose apply treats "not edit" as create.
 *
 * Same global fetch stub as catentio-bulk-edit-delete.test.ts — every
 * malapos surface speaks the one fetch client.
 */

type Req = { method: string; url: string; body: Record<string, unknown> };

let reqs: Req[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  reqs = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (method !== 'GET') reqs.push({ method, url: String(url), body });
    // Envelope shape per surface: core POS creates wrap the record
    // under its noun key (sendCreated(res, req, { category })); the
    // Plugipay proxies return the bare record.
    const record = { id: `id_${reqs.length}`, ...body };
    const data = /\/categories$/.test(String(url))
      ? { category: record }
      : /\/outlets$/.test(String(url))
        ? { outlet: record }
        : record;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ data, meta: {} }),
      text: async () => JSON.stringify({ data, meta: {} }),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const act = (a: Partial<ChatAction>): ChatAction =>
  ({ resource: 'categories', mode: 'create', fields: {}, ...a }) as ChatAction;

describe('applyChatAction — registry dispatch', () => {
  it('create goes through the descriptor and returns the created record', async () => {
    const result = await applyChatAction(
      act({ resource: 'categories', mode: 'create', fields: { name: 'Kopi' } }),
      [],
    );
    expect(reqs).toHaveLength(1);
    expect(reqs[0].method).toBe('POST');
    expect(reqs[0].url).toContain('/api/v1/categories');
    expect(reqs[0].body).toMatchObject({ name: 'Kopi' });
    // Unwrapped from the { category } envelope — `$n` needs the id.
    expect((result as { id?: string })?.id).toBeTruthy();
  });

  it('$n categoryId resolves from the earlier applied category', async () => {
    const catAction = act({ resource: 'categories', mode: 'create', fields: { name: 'Kopi' } });
    const category = await applyChatAction(catAction, []);
    await applyChatAction(
      act({
        resource: 'products',
        mode: 'create',
        fields: { name: 'Es Kopi Susu', price: 18000, categoryId: '$1' },
      }),
      [{ action: catAction, result: category }],
    );
    const productReq = reqs.at(-1)!;
    expect(productReq.url).toContain('/api/v1/products');
    expect(productReq.body.categoryId).toBe((category as { id: string }).id);
  });

  it('an unapplied $n target fails with the apply-first message, not a write', async () => {
    const catAction = act({ resource: 'categories', mode: 'create', fields: { name: 'Kopi' } });
    await expect(
      applyChatAction(
        act({ resource: 'products', mode: 'create', fields: { name: 'X', price: 1, categoryId: '$1' } }),
        [{ action: catAction }], // proposed but never applied — no result
      ),
    ).rejects.toThrow(/Apply the categories action first/);
    expect(reqs).toHaveLength(0);
  });

  it('delete dispatches the same DELETE the list page makes', async () => {
    await applyChatAction(act({ resource: 'products', mode: 'delete', id: 'prod_1' }), []);
    expect(reqs).toEqual([
      expect.objectContaining({ method: 'DELETE', url: expect.stringContaining('/api/v1/products/prod_1') }),
    ]);
  });

  it('blog publish/unpublish dispatch the lifecycle POSTs', async () => {
    await applyChatAction(act({ resource: 'blog-posts', mode: 'publish', id: 'post_1' }), []);
    await applyChatAction(act({ resource: 'blog-posts', mode: 'unpublish', id: 'post_1' }), []);
    expect(reqs.map((r) => r.url)).toEqual([
      expect.stringContaining('/api/v1/account/blog/posts/post_1/publish'),
      expect.stringContaining('/api/v1/account/blog/posts/post_1/unpublish'),
    ]);
    expect(reqs.every((r) => r.method === 'POST')).toBe(true);
  });

  it('payouts mark-paid posts the transition with the reference', async () => {
    await applyChatAction(
      act({ resource: 'payouts', mode: 'mark-paid', id: 'po_1', fields: { reference: 'TRX-2231' } }),
      [],
    );
    expect(reqs).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('/api/v1/payments/payouts/po_1/mark-paid'),
        body: { reference: 'TRX-2231' },
      }),
    ]);
  });

  it('an approvalRequired resource applies through the registry (the old ladder threw here)', async () => {
    await applyChatAction(
      act({ resource: 'gift-cards', mode: 'create', fields: { amount: 100000 } }),
      [],
    );
    expect(reqs).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('/api/v1/gift-cards'),
        body: expect.objectContaining({ amount: 100000 }),
      }),
    ]);
  });

  it('an unknown action rejects cleanly — never falls into a create', async () => {
    await expect(
      applyChatAction(act({ resource: 'products', mode: 'restock', id: 'prod_1' }), []),
    ).rejects.toThrow(/does not support "restock"/);
    await expect(
      applyChatAction(act({ resource: 'categories', mode: 'mark-paid', id: 'cat_1' }), []),
    ).rejects.toThrow(/does not support "mark-paid"/);
    expect(reqs).toHaveLength(0);
  });

  it('a verb on a resource that does not offer it rejects — payouts edit', async () => {
    await expect(
      applyChatAction(act({ resource: 'payouts', mode: 'edit', id: 'po_1' }), []),
    ).rejects.toThrow(/not available here/);
    expect(reqs).toHaveLength(0);
  });
});
