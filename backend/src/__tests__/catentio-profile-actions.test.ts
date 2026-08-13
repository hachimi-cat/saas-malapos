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

/** Every resource that declares `actions` — the canary. A resource
 *  gaining a declaration joins this list, and the synthesized canary
 *  below shrinks by one; the two together cover the whole profile. */
const DECLARED = [...WAVE1_CRUD, 'payouts', 'affiliate-enrollments', 'affiliate-commissions'] as const;

function synthesized(spec: ResourceSpec) {
  const { actions: _drop, ...rest } = spec;
  return resourceActions(rest as ResourceSpec);
}

describe('no field drift — declared create/edit ≡ synthesized create/edit', () => {
  it.each(WAVE1_CRUD.map((r) => [r] as const))('%s', (key) => {
    const spec = MALAPOS_PROFILE.resources[key]!;
    expect(spec.actions, `${key} must declare actions in wave 1`).toBeTruthy();
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

describe('wave-1 verb shapes', () => {
  it.each(WAVE1_CRUD.map((r) => [r] as const))(
    '%s.delete: destructive + approvalRequired, id-only, no fields',
    (key) => {
      const del = resourceActions(MALAPOS_PROFILE.resources[key]!).delete!;
      expect(del).toMatchObject({
        label: 'Delete',
        requiresId: true,
        destructive: true,
        approvalRequired: true,
        fields: [],
        declared: true,
      });
    },
  );

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
    for (const key of [
      'refunds',
      'sale-voids',
      'po-receipts',
      'gift-cards',
      'inventory-adjustments',
      'inventory-transfers',
      'stock-batches',
      'discount-codes',
      'modifiers',
      'outlets',
      'tables',
      'floors',
      'suppliers',
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
