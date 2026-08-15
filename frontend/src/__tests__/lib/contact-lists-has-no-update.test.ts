import { describe, it, expect } from 'vitest';
import { MALAPOS_PROFILE } from '../../../../backend/src/lib/catentio-profile';
import { resourceSupports, BULK_EDIT_RESOURCES } from '@/components/catentio/capabilities';

/**
 * contact-lists takes no EDIT, and the reason is structural rather than
 * taste — so it is recorded here instead of being "completed" by the
 * next person who notices the gap beside `contacts`.
 *
 * Ripllo (saas-ripllo routes/contact-lists.ts) exposes:
 *
 *     POST   /contact-lists                       create
 *     GET    /contact-lists, GET /contact-lists/:id
 *     POST   /contact-lists/:id/members           add a contact
 *     DELETE /contact-lists/:id/members/:contactId
 *     DELETE /contact-lists/:id                   delete the list
 *
 * There is no PATCH or PUT for the list itself. A declared edit would
 * sanitize cleanly, render a form, and then have nothing to call on
 * Apply — the failure would land on the merchant, at the end.
 *
 * When ripllo grows the endpoint, this file is the thing that fails,
 * and that failure is the go-ahead: declare `edit` in the profile, drop
 * contact-lists from CREATE_ONLY_RESOURCES, give the descriptor an edit
 * arm, and wire the row + batch on the audience page — the same four
 * moves `contacts` took on 2026-08-15.
 */
describe('contact-lists stays create-and-delete only', () => {
  const spec = MALAPOS_PROFILE.resources['contact-lists'];

  it('declares no edit action', () => {
    expect(spec, 'contact-lists left the profile entirely').toBeTruthy();
    expect(Object.keys(spec!.actions ?? {}).sort()).toEqual(['create', 'delete']);
  });

  it('no field is editable', () => {
    // The other half of the same fact. Declaring an action is one way in;
    // flipping a field to `edit: true` would make the engine synthesize
    // one, which is the quieter way to reintroduce the same bug.
    const editable = (spec!.fields ?? []).filter((f) => f.edit).map((f) => f.key);
    expect(editable, 'ripllo has no update endpoint to carry these').toEqual([]);
  });

  it('the frontend gate refuses the mode', () => {
    expect(resourceSupports('contact-lists', 'edit')).toBe(false);
    // …and the verbs it DOES have still work, so this is a door and not
    // a wall: a positive control, without which the assertion above
    // would pass on a resource that had vanished.
    expect(resourceSupports('contact-lists', 'create')).toBe(true);
    expect(resourceSupports('contact-lists', 'delete')).toBe(true);
  });

  it('takes no batch edit either', () => {
    expect(BULK_EDIT_RESOURCES).not.toContain('contact-lists');
  });

  it('positive control: contacts beside it DOES edit', () => {
    // The comparison that makes this file mean something. If contacts
    // ever loses its edit too, the explanation above stops being about
    // ripllo's routes and starts being about something broken here.
    expect(resourceSupports('contacts', 'edit')).toBe(true);
    expect(BULK_EDIT_RESOURCES).toContain('contacts');
    expect(Object.keys(MALAPOS_PROFILE.resources.contacts!.actions ?? {}).sort()).toEqual([
      'create',
      'delete',
      'edit',
    ]);
  });
});
