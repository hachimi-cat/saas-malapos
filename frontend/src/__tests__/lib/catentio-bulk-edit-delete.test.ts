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
  // Ripllo marketing, 2026-08-15. commissionRate is a FRACTION —
  // 0.15 is 15%; closing a brief IS the edit that ends one, since
  // ripllo has no DELETE for a brief; and patching only lastName
  // leaves the contact's email untouched, which is the point of
  // ripllo's partial PATCH.
  programs: { commissionRate: 0.15 },
  'creator-briefs': { status: 'closed' },
  contacts: { firstName: 'Dewi' },
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
    // contacts renders none of the generic keys below; these two give
    // its rows something to be seeded FROM, the same way `title` and
    // `label` serve the other forms.
    email: 'first@example.com',
    firstName: 'First',
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
    email: 'second@example.com',
    firstName: 'Second',
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

describe('payment-templates — one instruction, all three kinds', () => {
  /**
   * The templates page reaches the assistant through ONE header entry
   * spanning EVERY template, instead of a per-kind selection (bang,
   * 2026-08-14: *"i should be able to do like, please make my checkout,
   * invoice and receipt template the same theme … so the assistant will
   * edit all 3 at once"*).
   *
   * `config` here is ONE opaque JSON field, so the single proposal
   * `mergePlan` fans across the rows would REPLACE each template's whole
   * body — handing the receipt the checkout's blob and dropping its
   * thank-you line. The apply merges onto each row's own current config
   * for exactly that reason. (plugipay is not exposed to this: its
   * descriptor has one flat field per config key.)
   */
  const TEMPLATES = [
    { id: 'tpl_r', name: 'Receipt', kind: 'receipt', config: { thankYouText: 'Terima kasih', accentColor: null } },
    { id: 'tpl_i', name: 'Invoice', kind: 'invoice', config: { termsText: 'Net 30', accentColor: null } },
    { id: 'tpl_c', name: 'Checkout', kind: 'checkout', config: { successMessage: 'Thanks!', accentColor: null } },
  ];

  const patches = () =>
    writes().filter((r) => r.method === 'PATCH' && r.url.includes('/templates/'));

  it('a shared theme lands on every template without clobbering its content', async () => {
    const bulk = buildBulkEditResource('payment-templates', TEMPLATES);
    const seeded = buildBulkEditRows(bulk, TEMPLATES) as Record<string, unknown>;
    // What the AGENT does: one proposal against the declared edit
    // fields, fanned to every row by mergePlan.
    const merged = bulk.mergePlan!({
      draft: seeded,
      plan: { config: { accentColor: '#6F4E37' } },
    });

    await bulk.apply({ mode: 'edit', fields: merged });

    expect(patches()).toHaveLength(3);
    const byId = Object.fromEntries(
      patches().map((r) => [r.url.split('/templates/')[1], r.body.config as Record<string, unknown>]),
    );
    for (const id of ['tpl_r', 'tpl_i', 'tpl_c']) {
      expect(byId[id]!.accentColor, `${id} missed the theme`).toBe('#6F4E37');
    }
    // Each KEPT the field only its own kind has — a replacing apply
    // passes the loop above and fails right here.
    expect(byId.tpl_r!.thankYouText).toBe('Terima kasih');
    expect(byId.tpl_i!.termsText).toBe('Net 30');
    expect(byId.tpl_c!.successMessage).toBe('Thanks!');
    expect(byId.tpl_r!.termsText).toBeUndefined();
    expect(byId.tpl_c!.thankYouText).toBeUndefined();
  });

  it('an untouched template is not written at all', async () => {
    // Every template is a target every time now, so without the dirty
    // check, restyling the checkout page would rewrite the other two.
    const bulk = buildBulkEditResource('payment-templates', TEMPLATES);
    const draft = buildBulkEditRows(bulk, TEMPLATES) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    draft[BULK_EDIT_ROWS]!.tpl_r!.name = 'Receipt v2';

    await bulk.apply({ mode: 'edit', fields: draft });

    expect(patches()).toHaveLength(1);
    expect(patches()[0]!.url).toContain('tpl_r');
  });
});

describe('buildBulkEditResource', () => {
  it('covers exactly the intended resources (canary)', () => {
    // 18 since programs, creator-briefs and contacts joined 2026-08-15.
    expect(BULK_EDIT_RESOURCES).toHaveLength(18);
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

/**
 * THE seam the tests above assumed instead of checking. They hand
 * `mergePlan` a flat plan by hand and prove the fan-out — but the agent
 * is the thing that has to PRODUCE that flat plan, and it only will if
 * the payload it is shown looks nothing like rows.
 *
 * It did look like rows. `buildAgentPrompt` shipped the whole `records`
 * map as the draft, the model answered in the same shape, and the BFF's
 * sanitizer — which keeps declared schema fields only — dropped every
 * key. Proven live on plugipay staging: both a cross-kind ask and a
 * sheet's OWN example prompt came back `plan: null,
 * droppedFields: ['records']`. The agentic tab of every batch edit had
 * been dead since the rows landed (malapos 4f4d521).
 *
 * So this asserts the payload, not the aftermath.
 */
describe('the payload the agent is shown', () => {
  const ROWS = [
    { id: 'tpl_r', name: 'Receipt', kind: 'receipt', config: { thankYouText: 'Terima kasih' } },
    { id: 'tpl_i', name: 'Invoice', kind: 'invoice', config: { termsText: 'Net 30' } },
  ];

  const envelope = (userPrompt = 'make them the same theme') => {
    const bulk = buildBulkEditResource('payment-templates', ROWS);
    const seeded = buildBulkEditRows(bulk, ROWS) as Record<string, unknown>;
    const env = JSON.parse(
      bulk.buildAgentPrompt!({
        draft: seeded,
        mode: 'edit',
        userPrompt,
        history: '',
      }),
    ) as { prompt: string; draft: Record<string, unknown> };
    return { ...env, seeded };
  };

  it('never hands the agent the rows key it must not answer in', () => {
    const { draft, prompt } = envelope();
    // The draft is what the BFF renders as <current_draft> — the block
    // the model mirrors. It must not carry the rows.
    expect(draft).toEqual({});
    expect(Object.keys(draft)).not.toContain(BULK_EDIT_ROWS);
    expect(prompt).not.toContain(`"${BULK_EDIT_ROWS}":`);
  });

  it('still shows every record\'s current values, so "the same" has a reference', () => {
    const { prompt, seeded } = envelope();
    // Positive control: stripping the draft would satisfy the test above
    // all on its own. Every record's values have to SURVIVE, verbatim.
    const rows = seeded[BULK_EDIT_ROWS] as Record<string, unknown>;
    expect(Object.keys(rows).length).toBeGreaterThan(1);
    for (const row of Object.values(rows)) {
      expect(prompt).toContain(JSON.stringify(row));
    }
  });

  it('asks in the user\'s own words first, then for ONE flat set of fields', () => {
    const { prompt } = envelope('paint them all forest green');
    // The transport slices at 4k; the instruction must never be what
    // gets cut, so it leads.
    expect(prompt.startsWith('paint them all forest green')).toBe(true);
    expect(prompt).toMatch(/never a per-record object/i);
    expect(prompt).toMatch(new RegExp(`\`${BULK_EDIT_ROWS}\` key`, 'i'));
  });

  it('drops rows rather than the instruction when the batch is huge', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      id: `tpl_${i}`,
      name: `Template ${i}`,
      kind: 'receipt',
      config: { thankYouText: 'x'.repeat(40) },
    }));
    const bulk = buildBulkEditResource('payment-templates', many);
    const { prompt } = JSON.parse(
      bulk.buildAgentPrompt!({
        draft: buildBulkEditRows(bulk, many) as Record<string, unknown>,
        mode: 'edit',
        userPrompt: 'make them the same theme',
        history: '',
      }),
    ) as { prompt: string };
    // Under the transport's 4k slice, so nothing is silently cut...
    expect(prompt.length).toBeLessThan(4_000);
    // ...the instruction survives at both ends...
    expect(prompt.startsWith('make them the same theme')).toBe(true);
    expect(prompt).toMatch(/never a per-record object/i);
    // ...and what was left out is STATED, not silently dropped.
    expect(prompt).toMatch(/\(\+\d+ more, not shown here/);
    expect(prompt).toContain('all 400 records');
  });
});
