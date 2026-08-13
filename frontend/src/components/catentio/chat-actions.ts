import type { ChatAction } from '@forjio/agent-ui';
import type { AssistantMode, AssistantResource } from '@/hooks/use-catentio';
import { applyResource } from './resources';

/**
 * The docked chat's Apply path (review mode) — executes a BFF-sanitized
 * ChatAction with the USER's own session. The agent only ever proposed
 * it.
 *
 * This file used to carry a per-resource `if (action.resource === …)`
 * ladder that hand-implemented categories and products and threw a
 * not-supported error for everything else — so all 19 approvalRequired
 * resources (refunds, voids, adjustments, gift cards…) were proposed
 * by the prompt, survived the sanitizer, rendered a card, and then
 * failed on Apply. A second write path is
 * also free to drift: the same request, made from the chat instead of
 * the sheet, quietly sends a different body.
 *
 * So there is one write path per (resource, action), in the descriptor
 * registry (resources.ts `applyResource`, storlaunch's shape), and
 * this file only does what is genuinely chat-specific: resolve `$n`
 * cross-references against earlier applied actions, then hand the
 * field set to that resource's `apply`. An action name outside the
 * registry's vocabulary rejects cleanly there.
 */

const ACTION_REF_RE = /^\$([1-9])$/;

/**
 * Fields that may carry a `$n` reference to an earlier action in the
 * same reply, and the resource that action must have been — keyed
 * `resource.field` because the same field name points at different
 * books depending on who carries it (`customerId` is the POS customer
 * book on gift-cards but the Plugipay billing book on subscriptions
 * and checkout-sessions). Mirrors `MALAPOS_PROFILE.crossRefs` — the
 * BFF already rebased and validated these, so this map only has to
 * resolve them to real ids.
 */
const CROSS_REF_TARGETS: Record<string, AssistantResource> = {
  'products.categoryId': 'categories',
  'tables.outletId': 'outlets',
  'tables.floorId': 'floors',
  'floors.outletId': 'outlets',
  'purchase-orders.supplierId': 'suppliers',
  'subscriptions.customerId': 'payment-customers',
  'subscriptions.planId': 'plans',
  'checkout-sessions.customerId': 'payment-customers',
  'prices.planId': 'plans',
  'gift-cards.customerId': 'customers',
};

function resolveRef(
  wanted: AssistantResource,
  value: unknown,
  earlier: { action: ChatAction; result?: unknown }[],
): unknown {
  if (typeof value !== 'string') return value;
  const m = ACTION_REF_RE.exec(value);
  if (!m) return value;
  const prior = earlier[Number(m[1]) - 1];
  if (!prior || prior.action.resource !== wanted) {
    throw new Error(`This item references a ${wanted} action that does not exist`);
  }
  const created = prior.result as { id?: unknown } | undefined;
  const id = typeof created?.id === 'string' ? created.id : undefined;
  if (!id) {
    throw new Error(`Apply the ${wanted} action first — this item attaches to it`);
  }
  return id;
}

export async function applyChatAction(
  action: ChatAction,
  earlier: { action: ChatAction; result?: unknown }[],
): Promise<unknown> {
  const resource = action.resource as AssistantResource;
  const mode = action.mode as AssistantMode;

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(action.fields ?? {})) {
    const wanted = CROSS_REF_TARGETS[`${action.resource}.${key}`];
    fields[key] = wanted ? resolveRef(wanted, value, earlier) : value;
  }

  // `initial` is how an apply learns WHICH record it is touching. In
  // the sheet that is the row the user opened; here it is the id the
  // agent looked up and the BFF validated (actions whose ActionSpec
  // requires an id are dropped server-side without one).
  const initial = action.id ? { id: action.id } : undefined;

  // applyResource, not buildCrudResource — the sheet's wrapper swallows
  // the write result, and `$n` needs the created record's id back.
  return applyResource(resource, mode, { fields, initial });
}
