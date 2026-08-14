import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyResource, buildCrudResource } from '@/components/catentio/resources';
import { resourceSupports } from '@/components/catentio/capabilities';

/**
 * The three payments-settings descriptors (bang, 2026-08-14: *"add
 * them"*). malapos had NO agentic surface on providers / payment
 * methods / templates, so these arrived as new capability rather than
 * as a relabel of an existing entry.
 *
 * What is worth asserting here is the WIRE. A descriptor with the right
 * fields and the wrong URL renders perfectly and writes into nothing —
 * and these three sit behind a proxy prefix malapos spells differently
 * from storlaunch (`/payments/plugipay-settings`, not `/payment/…`),
 * which is exactly the kind of difference a transcription loses. So
 * every test below reads the method + path the apply actually issued.
 */

type Req = { method: string; url: string; body: Record<string, unknown> };

let reqs: Req[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  reqs = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const method = (init?.method ?? 'get').toUpperCase();
    if (method !== 'GET') reqs.push({ method, url: String(url), body });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ data: { id: 'tpl_new', ...body }, meta: {} }),
      text: async () => JSON.stringify({ data: { id: 'tpl_new', ...body }, meta: {} }),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

/** The one write the apply issued. Fails loudly on 0 or 2+, so a test
 *  cannot pass on "something happened". */
function onlyWrite(): Req {
  expect(reqs, 'expected exactly one write').toHaveLength(1);
  return reqs[0]!;
}

describe('providers — the manual adapter, and nothing that carries a secret', () => {
  it('PUTs /adapters/manual, the one adapter path the backend grants', async () => {
    await applyResource('providers', 'edit', {
      fields: {
        bankAccounts: [{ bankName: 'BCA', accountNumber: '1234567890', accountHolder: 'PT Warung Maju' }],
        instructions: 'Send the transfer receipt to our WhatsApp.',
      },
    });
    const w = onlyWrite();
    expect(w.method).toBe('PUT');
    // malapos proxies at /payments/… (plural). storlaunch's is
    // /payment/… — transcribing the descriptor across without fixing
    // this writes into a 404 that the sheet reports as a save.
    expect(w.url).toContain('/payments/plugipay-settings/adapters/manual');
    expect(w.body.bankAccounts).toEqual([
      { bankName: 'BCA', accountNumber: '1234567890', accountHolder: 'PT Warung Maju' },
    ]);
  });

  it('drops the blank row "+ Add another" leaves behind', async () => {
    await applyResource('providers', 'edit', {
      fields: {
        bankAccounts: [
          { bankName: 'BCA', accountNumber: '1234567890', accountHolder: 'PT Warung Maju' },
          { bankName: '', accountNumber: '', accountHolder: '' },
        ],
      },
    });
    // Plugipay would store the empty one, and the merchant would see a
    // blank account offered to buyers at checkout.
    expect((onlyWrite().body.bankAccounts as unknown[]).length).toBe(1);
  });

  it('an untouched sheet writes NOTHING rather than blanking the adapter', async () => {
    // The PUT is a full replace. "Nothing to change" has to throw, or
    // opening the sheet and closing it would clear the accounts.
    await expect(applyResource('providers', 'edit', { fields: {} })).rejects.toThrow(
      /nothing to change/i,
    );
    expect(reqs).toHaveLength(0);
  });

  it('offers no create at all — a singleton is amended, never minted', () => {
    expect(() => buildCrudResource('providers', 'create')).toThrow(/not available here/i);
  });

  it('declares no field that could carry an API key', () => {
    const names = buildCrudResource('providers', 'edit').fields.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining(['bankAccounts', 'instructions']),
    );
    for (const secret of ['secretKey', 'clientSecret', 'serverKey', 'clientId', 'apiKey']) {
      expect(names, `${secret} must never be a sheet field`).not.toContain(secret);
    }
    // The read-only status panels DO ride along — that is how the agent
    // answers "which providers are connected" without seeing a key.
    expect(names).toContain('xenditStatus');
  });
});

describe('checkout-settings — the payment-methods page', () => {
  it('PATCHes /checkout/settings', async () => {
    await applyResource('checkout-settings', 'edit', {
      fields: { enabledMethods: ['qris', 'bank_transfer'], brandName: 'Warung Maju' },
    });
    const w = onlyWrite();
    expect(w.method).toBe('PATCH');
    expect(w.url).toContain('/payments/plugipay-settings/checkout/settings');
    expect(w.body).toEqual({ enabledMethods: ['qris', 'bank_transfer'], brandName: 'Warung Maju' });
  });

  it('an EMPTIED method list still travels — that is a real intent', async () => {
    // The difference between "leave it alone" and "turn everything off"
    // is a real one, and collapsing the second into the first would
    // silently refuse a merchant closing checkout.
    await applyResource('checkout-settings', 'edit', { fields: { enabledMethods: [] } });
    expect(onlyWrite().body).toEqual({ enabledMethods: [] });
  });

  it('an untouched field does not travel, so a PATCH cannot blank it', async () => {
    await applyResource('checkout-settings', 'edit', { fields: { brandTagline: 'Kopi tiap hari' } });
    const body = onlyWrite().body;
    expect(Object.keys(body)).toEqual(['brandTagline']);
    expect(body).not.toHaveProperty('enabledMethods');
  });

  it('does not offer methodAdapter — where the money routes is not plannable', () => {
    const names = buildCrudResource('checkout-settings', 'edit').fields.map((f) => f.name);
    expect(names).not.toContain('methodAdapter');
    // Positive control on the same read.
    expect(names).toContain('enabledMethods');
  });

  it('offers no create', () => {
    expect(() => buildCrudResource('checkout-settings', 'create')).toThrow(/not available here/i);
  });
});

describe('payment-templates — create and edit are different writes', () => {
  it('create POSTs the collection', async () => {
    await applyResource('payment-templates', 'create', {
      fields: { kind: 'receipt', name: 'Ramadan', config: { footerText: 'Terima kasih' } },
    });
    const w = onlyWrite();
    expect(w.method).toBe('POST');
    expect(w.url).toMatch(/\/payments\/plugipay-settings\/templates$/);
    expect(w.body).toMatchObject({ kind: 'receipt', name: 'Ramadan' });
  });

  it('edit PATCHes the template the merchant OPENED, by its own id', async () => {
    await applyResource('payment-templates', 'edit', {
      fields: { name: 'Ramadan 2026' },
      // `id` comes from the row, never from a plan — the page passes it
      // in `initial`.
      initial: { id: 'tpl_7', kind: 'receipt', name: 'Ramadan' },
    });
    const w = onlyWrite();
    expect(w.method).toBe('PATCH');
    expect(w.url).toContain('/payments/plugipay-settings/templates/tpl_7');
    expect(w.body).toEqual({ name: 'Ramadan 2026' });
    // kind is create-only: PATCH takes name + config and nothing else,
    // so a plan proposing a kind change must not reach the wire.
    expect(w.body).not.toHaveProperty('kind');
  });

  it('edit without an id refuses rather than guessing one', async () => {
    await expect(
      applyResource('payment-templates', 'edit', { fields: { name: 'Nameless' } }),
    ).rejects.toThrow();
    expect(reqs).toHaveLength(0);
  });

  it('kind and isDefault are on the create form only', () => {
    const create = buildCrudResource('payment-templates', 'create').fields.map((f) => f.name);
    const edit = buildCrudResource('payment-templates', 'edit').fields.map((f) => f.name);
    expect(create).toEqual(expect.arrayContaining(['kind', 'name', 'config', 'isDefault']));
    expect(edit).not.toContain('kind');
    expect(edit).not.toContain('isDefault');
    expect(edit).toEqual(expect.arrayContaining(['name', 'config']));
  });
});

describe('the three are declared, and declare nothing more', () => {
  it('each supports exactly the modes its page uses', () => {
    expect(resourceSupports('providers', 'edit')).toBe(true);
    expect(resourceSupports('checkout-settings', 'edit')).toBe(true);
    expect(resourceSupports('payment-templates', 'edit')).toBe(true);
    expect(resourceSupports('payment-templates', 'create')).toBe(true);
    // No verbs. make-default, duplicate and delete are the page's own
    // buttons, and the backend leaves all three off the delegated
    // writable list (delegation-paths.test.ts pins that).
    for (const verb of ['delete', 'make-default', 'duplicate']) {
      expect(resourceSupports('payment-templates', verb), `${verb} must not be declared`).toBe(false);
      expect(resourceSupports('providers', verb)).toBe(false);
      expect(resourceSupports('checkout-settings', verb)).toBe(false);
    }
  });
});
