/**
 * The event catalogue — every event type Malapos sends to webhook
 * subscriptions, in one place. GET /api/v1/webhook-subscriptions/event-types
 * serves it, the dashboard's event picker renders from that response, and
 * copy/docs/api-reference.md lists the same types; a test checks that every
 * type the code writes to the outbox is here.
 *
 * Types are `malapos.<object>.<verb>.v1`. A subscription's `events` may also
 * hold `*` (everything) or a prefix ending in `*` (`malapos.kds.*`).
 */
export const EVENT_TYPES = [
  { type: 'malapos.sale.completed.v1', description: 'A sale was finalized and paid at the point of sale.' },
  { type: 'malapos.sale.voided.v1', description: 'A recorded sale was voided.' },
  { type: 'malapos.sale.refunded.v1', description: 'A sale was partially or fully refunded.' },
  { type: 'malapos.purchase_order.received.v1', description: 'Purchase-order lines were received into stock.' },
  { type: 'malapos.kds.advanced.v1', description: 'A kitchen ticket moved forward a step.' },
  { type: 'malapos.kds.reverted.v1', description: 'A kitchen ticket moved back a step.' },
  { type: 'malapos.kds.item_advanced.v1', description: 'One kitchen-ticket item moved forward.' },
  { type: 'malapos.kds.item_reverted.v1', description: 'One kitchen-ticket item moved back.' },
  { type: 'malapos.kds.served.v1', description: "A table's ready items were served." },
  { type: 'malapos.shipping_credit.topped_up.v1', description: 'Fulfillment shipping credit was topped up.' },
  { type: 'malapos.billing.subscribed.v1', description: 'The workspace started or upgraded a paid plan.' },
  { type: 'malapos.billing.canceled.v1', description: 'The workspace canceled its subscription.' },
  {
    type: 'malapos.webhook_subscription.disabled.v1',
    description: 'Malapos switched off one of your webhook endpoints because it kept failing (sent to your other endpoints).',
  },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]['type'];

const KNOWN = new Set<string>(EVENT_TYPES.map((e) => e.type));

export function isEventType(s: string): s is EventType {
  return KNOWN.has(s);
}

/** `*` matches every type, `malapos.kds.*` every type with that prefix,
 *  anything else only the exact type. */
export function eventMatches(patterns: unknown, type: string): boolean {
  if (!Array.isArray(patterns)) return false;
  return patterns.some((p) => {
    if (typeof p !== 'string' || p.length === 0) return false;
    if (p === '*' || p === type) return true;
    return p.endsWith('*') && type.startsWith(p.slice(0, -1));
  });
}
