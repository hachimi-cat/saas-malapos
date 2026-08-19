import { describe, it, expect } from 'vitest';
import { resourceActions, fieldAllowed, type ResourceSpec } from '@forjio/catentio-embed';
import { MALAPOS_PROFILE } from '../lib/catentio-profile.js';

/*
 * Wave-1 + wave-2 action declarations vs the synthesis they replace.
 *
 * Once a resource declares `actions`, the engine stops synthesizing
 * create/edit from the FieldSpec booleans — so each declaration
 * repeats them, and THIS test is the proof there is no field drift:
 * strip `actions` off the spec, let the engine synthesize, and compare
 * against the declared/resolved output. A field added to the FieldSpec
 * list without being added to the action allowlist (or vice versa)
 * fails here instead of silently changing what the sanitizer admits.
 *
 * The second half pins the verb shapes: delete is destructive +
 * approvalRequired with an id and NO fields; blog publish/unpublish are
 * direct id-only verbs; payouts mark-paid is the approval-chain proof
 * (its endpoint is deliberately off the delegation writable list —
 * delegation-paths.test.ts owns that half).
 *
 * Wave 2 adds products.set-category (the reconciliation of the
 * already-writable POST /products/bulk-category) and the two verb-only
 * affiliate queues.
 */

const WAVE1_CRUD = [
  'categories',
  'products',
  'customers',
  'webhook-subscriptions',
  'blog-posts',
] as const;

/** wave-3: the nine pages that already offered "Delete N selected" and
 *  had no declared verb behind it. Same create+edit-repeat shape as
 *  WAVE1_CRUD, so they ride the same drift check. */
const WAVE3_CRUD = [
  'plans',
  'outlets',
  'modifiers',
  'warehouses',
  'tables',
  'suppliers',
  'funnels',
  'marketing-campaigns',
  'discount-codes',
] as const;

/** Every resource that declares `actions` — the canary. A resource
 *  gaining a declaration joins this list, and the synthesized canary
 *  below shrinks by one; the two together cover the whole profile. */
/**
 * The two payment-settings singletons (bang, 2026-08-14). They declare
 * `edit` ALONE — not the create/edit pair — which is the whole point of
 * declaring for them: there is one manual adapter and one checkout
 * config, so the synthesized create the engine would otherwise hand out
 * is an action that can only overwrite the singleton. Their edit fields
 * are asserted against the synthesized ones by `settings singletons
 * declare edit and NOTHING else` below, so the no-drift rule still
 * holds; they are excluded from the WAVE1/WAVE3 pair sweep because that
 * sweep requires a declared create.
 *
 * `payment-templates` is NOT here: it is a real collection with a real
 * create, so it takes the synthesized pair like the wave-1 resources
 * that declare nothing.
 */
const SETTINGS_SINGLETONS = ['providers', 'checkout-settings'] as const;

const DECLARED = [
  ...WAVE1_CRUD,
  ...WAVE3_CRUD,
  ...SETTINGS_SINGLETONS,
  'payouts',
  'affiliate-enrollments',
  'affiliate-commissions',
  // wave-4 (2026-08-15), the malapos half of bang's marketing batch.
  // `programs` spells out its actions only so `delete` can join (ripllo
  // has served DELETE /programs/{id} all along); `contacts` gained a
  // real edit over PATCH /contacts/{id}; `contact-lists` declares
  // create+delete and NO edit, because ripllo has no update endpoint
  // for a list at all. creator-briefs is deliberately NOT here — it
  // declares no actions block, so engine synthesis stays.
  'programs',
  'contacts',
  'contact-lists',
  // Verb-only (approve/cancel/dispute) — no create, no edit.
  'collaborations',
] as const;

function synthesized(spec: ResourceSpec) {
  const { actions: _drop, ...rest } = spec;
  return resourceActions(rest as ResourceSpec);
}

describe('no field drift — declared create/edit ≡ synthesized create/edit', () => {
  it.each([...WAVE1_CRUD, ...WAVE3_CRUD].map((r) => [r] as const))('%s', (key) => {
    const spec = MALAPOS_PROFILE.resources[key]!;
    expect(spec.actions, `${key} must declare actions`).toBeTruthy();
    const declared = resourceActions(spec);
    const synth = synthesized(spec);
    for (const mode of ['create', 'edit'] as const) {
      expect(declared[mode], `${key} must declare ${mode}`).toBeTruthy();
      expect(declared[mode]!.fields, `${key}.${mode} fields drifted`).toEqual(synth[mode]!.fields);
      expect(declared[mode]!.requiresId).toBe(synth[mode]!.requiresId);
      expect(declared[mode]!.requiresFields).toEqual(synth[mode]!.requiresFields);
      expect(declared[mode]!.approvalRequired).toBe(synth[mode]!.approvalRequired);
      expect(declared[mode]!.label).toBe(synth[mode]!.label);
    }
  });

  it('contacts: create is approvalRequired (a tightening, not drift) and edit stays direct', () => {
    // 2026-08-19. A contact CREATE with source 'manual' fires ripllo's
    // signup_form funnel trigger — every active funnel enrols the person
    // and starts sending. That is the reach-a-real-person class this
    // profile has always proposed rather than applied. The FIELDS still
    // match synthesis exactly; only the approval bit is tightened, and
    // only on create. The auth half is the PATCH-only grant in
    // middleware/auth.ts (delegation-paths.test.ts owns that).
    const spec = MALAPOS_PROFILE.resources.contacts!;
    const declared = resourceActions(spec);
    const synth = synthesized(spec);
    expect(declared.create!.fields).toEqual(synth.create!.fields);
    expect(declared.edit!.fields).toEqual(synth.edit!.fields);
    expect(declared.create!.approvalRequired).toBe(true);
    expect(synth.create!.approvalRequired).toBe(false); // the control — synthesis would NOT have tightened it
    expect(declared.edit!.approvalRequired).toBe(false);
  });

  it('payouts: declared create ≡ synthesized create (approval inherited); zero-field edit dropped', () => {
    const spec = MALAPOS_PROFILE.resources.payouts!;
    const declared = resourceActions(spec);
    const synth = synthesized(spec);
    expect(declared.create!.fields).toEqual(synth.create!.fields);
    expect(declared.create!.requiresFields).toEqual(synth.create!.requiresFields);
    expect(declared.create!.approvalRequired).toBe(true); // inherited from the resource
    // The synthesized edit carried NO fields (every FieldSpec is
    // edit:false) and there is no PATCH route — dropping it loses
    // nothing an agent could ever have applied.
    expect(synth.edit!.fields).toEqual([]);
    expect(declared.edit).toBeUndefined();
  });
});

/**
 * The honest label for each declared `delete`. Four of them are status
 * changes upstream, not deletes — found 2026-08-19 while porting the
 * marketing module onto ripllo and reading its routers: ripllo ARCHIVES
 * a marketing campaign and a funnel (status='archived'), and
 * `discountCodes.archive` (our own route) does what it says. A card
 * labelled "Delete" over a row that is still there afterwards is the
 * wrong surprise. Everything else is a real delete and stays "Delete".
 */
const DELETE_LABEL: Partial<Record<string, string>> = {
  funnels: 'Archive',
  'marketing-campaigns': 'Archive',
  'discount-codes': 'Archive',
};

describe('wave-1 verb shapes', () => {
  it.each([...WAVE1_CRUD, ...WAVE3_CRUD].map((r) => [r] as const))(
    '%s.delete: destructive + approvalRequired, id-only, no fields',
    (key) => {
      const del = resourceActions(MALAPOS_PROFILE.resources[key]!).delete!;
      expect(del).toMatchObject({
        label: DELETE_LABEL[key] ?? 'Delete',
        requiresId: true,
        destructive: true,
        approvalRequired: true,
        fields: [],
        declared: true,
      });
    },
  );

  it('the two Ripllo-side deletes that are not deletes carry the honest label too', () => {
    // DELETE /contacts/{id} unsubscribes on every channel and keeps the
    // row; DELETE /programs/{id} closes the programme. Not in the CRUD
    // sweep above (contacts' create is tightened; programs is wave-4).
    expect(resourceActions(MALAPOS_PROFILE.resources.contacts!).delete!.label).toBe('Unsubscribe');
    expect(resourceActions(MALAPOS_PROFILE.resources.programs!).delete!.label).toBe('Close');
    // control — a real delete is still "Delete"
    expect(resourceActions(MALAPOS_PROFILE.resources['contact-lists']!).delete!.label).toBe('Delete');
  });

  it('campaign-invitations is approvalRequired — the prompt half finally matches the gate', () => {
    // middleware/auth.ts has refused POST /account/marketing/campaigns/
    // {id}/invitations since the grant was written (delegation-paths
    // .test.ts pins it false); the profile never said so, so an
    // auto-apply run was told it could invite directly and met a 403.
    expect(MALAPOS_PROFILE.resources['campaign-invitations']!.approvalRequired).toBe(true);
    for (const a of Object.values(resourceActions(MALAPOS_PROFILE.resources['campaign-invitations']!))) {
      expect(a.approvalRequired).toBe(true);
    }
    expect(MALAPOS_PROFILE.endpointsLine.indexOf('/campaigns/{id}/invitations'))
      .toBeGreaterThan(MALAPOS_PROFILE.endpointsLine.indexOf('PROPOSED'));
  });

  it('blog-posts publish/unpublish: direct id-only verbs', () => {
    const actions = resourceActions(MALAPOS_PROFILE.resources['blog-posts']!);
    for (const [name, label] of [
      ['publish', 'Publish'],
      ['unpublish', 'Unpublish'],
    ] as const) {
      expect(actions[name]).toMatchObject({
        label,
        requiresId: true,
        fields: [],
        approvalRequired: false,
        destructive: false,
        declared: true,
      });
    }
  });

  it('payouts.mark-paid: approvalRequired, id + reference only', () => {
    const spec = MALAPOS_PROFILE.resources.payouts!;
    expect(resourceActions(spec)['mark-paid']).toMatchObject({
      label: 'Mark paid',
      requiresId: true,
      fields: ['reference'],
      approvalRequired: true,
      declared: true,
    });
    // `reference` belongs to mark-paid ALONE — it must never leak into
    // the create payload the agent proposes.
    expect(fieldAllowed(spec, 'mark-paid', 'reference')).toBe(true);
    expect(fieldAllowed(spec, 'create', 'reference')).toBe(false);
    expect(fieldAllowed(spec, 'mark-paid', 'amount')).toBe(false);
  });

  it('untouched resources stay synthesized — refunds keeps the pre-0.8.0 pair', () => {
    // wave-3 moved discount-codes, modifiers, outlets, tables and
    // suppliers onto the declared side — each had a manual batch delete
    // on its page. `floors` stays: it has a DELETE route but no batch
    // surface, so there is nothing to make agentic yet.
    for (const key of [
      'refunds',
      'sale-voids',
      'po-receipts',
      'gift-cards',
      'inventory-adjustments',
      'inventory-transfers',
      'stock-batches',
      'floors',
      'settings',
    ]) {
      const spec = MALAPOS_PROFILE.resources[key]!;
      expect(spec.actions, `${key} must NOT declare actions here`).toBeUndefined();
      expect(Object.keys(resourceActions(spec))).toEqual(['create', 'edit']);
    }
  });

  it('exactly these resources declare actions (canary)', () => {
    const declared = Object.entries(MALAPOS_PROFILE.resources)
      .filter(([, spec]) => spec!.actions)
      .map(([key]) => key)
      .sort();
    expect(declared).toEqual([...DECLARED].sort());
  });

  it.each(SETTINGS_SINGLETONS)('%s declares edit and NOTHING else', (key) => {
    const spec = MALAPOS_PROFILE.resources[key]!;
    const declared = resourceActions(spec);
    // No create. A singleton is amended, never minted — and the write
    // behind both of these REPLACES what is there (PUT /adapters/manual,
    // PATCH /checkout/settings), so a create action would be an
    // overwrite wearing the wrong name.
    expect(Object.keys(declared).sort()).toEqual(['edit']);
    // The no-drift rule still holds for the action they DO declare:
    // its field list is exactly the FieldSpec `edit: true` set.
    expect(declared.edit!.fields).toEqual(synthesized(spec).edit!.fields);
    expect(declared.edit!.requiresId).toBe(false);
    // …and nothing is creatable, which is what makes the omission safe
    // rather than a gap: a synthesized create here would carry no fields
    // at all.
    expect(spec.fields.filter((f) => f.create)).toEqual([]);
  });

  it('providers declares the manual adapter and NOT one API secret', () => {
    // The sharpest line in this profile. Every other adapter's write
    // body IS a credential, and a credential that reaches a transcript
    // outlives both the run and the review step — so none of them is a
    // field here, and middleware/auth.ts denies their paths outright
    // (delegation-paths.test.ts pins that half).
    const spec = MALAPOS_PROFILE.resources.providers!;
    expect(spec.fields.map((f) => f.key).sort()).toEqual(['bankAccounts', 'instructions']);
    const asText = JSON.stringify(spec).toLowerCase();
    for (const secret of ['secretkey', 'clientsecret', 'serverkey', 'clientid', 'apikey']) {
      expect(asText, `providers must not declare ${secret}`).not.toContain(`"key":"${secret}"`);
    }
  });

  it('checkout-settings does not declare methodAdapter', () => {
    // Which provider routes each method decides where a buyer's money
    // actually goes. The per-method Select on the payment-methods page
    // is where that changes; a plan naming it is dropped by the
    // sanitizer before it can silently reroute live payments.
    const spec = MALAPOS_PROFILE.resources['checkout-settings']!;
    expect(spec.fields.map((f) => f.key)).not.toContain('methodAdapter');
    // Positive control on the same read: the fields it DOES declare.
    expect(spec.fields.map((f) => f.key)).toContain('enabledMethods');
  });
});

/*
 * WAVE 2 — the batch-shaped verbs.
 */
describe('wave-2 verb shapes', () => {
  it('products.set-category: direct write, id + categoryId only', () => {
    const spec = MALAPOS_PROFILE.resources.products!;
    expect(resourceActions(spec)['set-category']).toMatchObject({
      label: 'Set category',
      requiresId: true,
      fields: ['categoryId'],
      // Which shelf a product sits on is configuration, exactly like
      // the categoryId the declared edit already writes directly.
      approvalRequired: false,
      destructive: false,
      declared: true,
    });
    // The verb's allowlist is categoryId ALONE — a plan that smuggled a
    // price into a set-category card would be sanitized down to
    // nothing.
    expect(fieldAllowed(spec, 'set-category', 'categoryId')).toBe(true);
    expect(fieldAllowed(spec, 'set-category', 'price')).toBe(false);
    expect(fieldAllowed(spec, 'set-category', 'name')).toBe(false);
  });

  it('products keeps its wave-1 vocabulary alongside the new verb', () => {
    expect(Object.keys(resourceActions(MALAPOS_PROFILE.resources.products!)).sort()).toEqual(
      ['create', 'delete', 'edit', 'set-category'].sort(),
    );
  });

  it.each([
    ['affiliate-enrollments', ['approve']],
    ['affiliate-commissions', ['approve', 'void']],
  ] as const)(
    '%s: verb-only — nothing creates or edits, every verb proposes',
    (key, verbs) => {
      const spec = MALAPOS_PROFILE.resources[key]!;
      const actions = resourceActions(spec);
      // No create/edit at all: every FieldSpec is create:false/edit:false,
      // so the synthesized pair would have been two empty actions.
      expect(Object.keys(actions)).toEqual([...verbs]);
      for (const verb of verbs) {
        expect(actions[verb], `${key}.${verb}`).toMatchObject({
          requiresId: true,
          // programId travels with the card because the Ripllo proxy
          // path needs the program as well as the record.
          fields: ['programId'],
          approvalRequired: true,
          declared: true,
        });
        expect(fieldAllowed(spec, verb, 'programId')).toBe(true);
        expect(fieldAllowed(spec, verb, 'amount')).toBe(false);
      }
    },
  );

  it('affiliate-commissions.void is destructive; approve is not', () => {
    const actions = resourceActions(MALAPOS_PROFILE.resources['affiliate-commissions']!);
    expect(actions.void!.destructive).toBe(true);
    expect(actions.approve!.destructive).toBe(false);
  });

  it('the affiliate queues link to the approvals page (a report may not mint a URL)', () => {
    for (const key of ['affiliate-enrollments', 'affiliate-commissions'] as const) {
      expect(MALAPOS_PROFILE.pageLinks![key]).toBe('/dashboard/marketing/affiliate-approvals');
    }
  });
});

/*
 * Prose advertises exactly the declared surface — a verb the agent may
 * propose but the endpoints line never names is a verb it will not
 * reach for, and an endpoint the line names without a declaration is an
 * invitation to a 422.
 */
describe('prose matches the declared surface', () => {
  const line = MALAPOS_PROFILE.endpointsLine;

  it('the reconciled bulk route is advertised as a direct write', () => {
    expect(line).toContain('POST /api/v1/products/bulk-category');
  });

  it('the affiliate verbs are advertised as PROPOSED, and their queues as reads', () => {
    for (const path of [
      'POST /api/v1/account/marketing/programs/{programId}/enrollments/{id}/approve',
      'POST /api/v1/account/marketing/programs/{programId}/commissions/{id}/approve',
      'POST /api/v1/account/marketing/programs/{programId}/commissions/{id}/void',
    ]) {
      expect(line).toContain(path);
      // …and after the PROPOSED marker, not among the direct writes.
      expect(line.indexOf(path)).toBeGreaterThan(line.indexOf('PROPOSED'));
    }
    expect(line).toContain('/api/v1/account/marketing/programs/{programId}/enrollments');
  });

  it('rejection is NOT advertised — it stays a hand-typed action', () => {
    expect(line).not.toContain('/reject');
    expect(
      resourceActions(MALAPOS_PROFILE.resources['affiliate-enrollments']!).reject,
    ).toBeUndefined();
  });

  it('the writables summary names both new capabilities', () => {
    expect(MALAPOS_PROFILE.writablesSummary).toContain('moving a batch of them into a category');
    expect(MALAPOS_PROFILE.writablesSummary).toContain('approving affiliate enrollments');
  });
});
