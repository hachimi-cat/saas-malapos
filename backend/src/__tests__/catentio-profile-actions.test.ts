import { describe, it, expect } from 'vitest';
import { resourceActions, fieldAllowed, type ResourceSpec } from '@forjio/catentio-embed';
import { MALAPOS_PROFILE } from '../lib/catentio-profile.js';

/*
 * Wave-1 action declarations vs the synthesis they replace.
 *
 * Once a resource declares `actions`, the engine stops synthesizing
 * create/edit from the FieldSpec booleans — so each wave-1 declaration
 * repeats them, and THIS test is the proof there is no field drift:
 * strip `actions` off the spec, let the engine synthesize, and compare
 * against the declared/resolved output. A field added to the FieldSpec
 * list without being added to the action allowlist (or vice versa)
 * fails here instead of silently changing what the sanitizer admits.
 *
 * The second half pins the wave-1 verb shapes: delete is destructive +
 * approvalRequired with an id and NO fields; blog publish/unpublish are
 * direct id-only verbs; payouts mark-paid is the approval-chain proof
 * (its endpoint is deliberately off the delegation writable list —
 * delegation-paths.test.ts owns that half).
 */

const WAVE1_CRUD = [
  'categories',
  'products',
  'customers',
  'webhook-subscriptions',
  'blog-posts',
] as const;

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
      expect(spec.actions, `${key} must NOT declare actions in wave 1`).toBeUndefined();
      expect(Object.keys(resourceActions(spec))).toEqual(['create', 'edit']);
    }
  });
});
