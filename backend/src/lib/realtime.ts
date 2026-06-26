import { EventEmitter } from 'node:events';

/*
 * In-process realtime bus for the F&B boards (KDS / floor / serve).
 *
 * A single Node EventEmitter shared across the backend process. Mutations
 * that change an F&B board call `emitFnbChange(accountId, outletId, topic)`
 * AFTER their DB transaction commits; the SSE endpoint (routes/events.ts)
 * subscribes per connection and pushes a `change` event to the browser, which
 * refetches the affected board immediately (no polling lag).
 *
 * Single backend process → in-process is sufficient. If the service is ever
 * scaled to multiple replicas this would need a shared transport (Redis
 * pub/sub etc.), but today (pawpado/ripllo model: one `pm2` Node process per
 * product) every mutation and every SSE client live in the same process.
 */

export type FnbTopic = 'kds' | 'floor' | 'serve';

export interface FnbChange {
  accountId: string;
  /** Null = account-wide broadcast (reaches every subscriber regardless of
   *  their outlet filter). A concrete id only reaches subscribers with no
   *  filter or a matching one. */
  outletId: string | null;
  topic: FnbTopic;
}

const EVENT = 'fnb:change';

// One process-wide bus. setMaxListeners(0) = unlimited: every open SSE
// connection adds a listener, and a busy F&B floor can hold many.
const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Publish a board change. Call AFTER the DB transaction commits so a
 *  subscriber that refetches immediately reads the new state. */
export function emitFnbChange(
  accountId: string,
  outletId: string | null,
  topic: FnbTopic,
): void {
  const change: FnbChange = { accountId, outletId: outletId ?? null, topic };
  bus.emit(EVENT, change);
}

/** Subscribe to every board change. Returns an unsubscribe fn — the SSE
 *  endpoint calls it on `req.on('close')`. The listener must do its own
 *  account/outlet filtering. */
export function subscribeFnb(listener: (change: FnbChange) => void): () => void {
  bus.on(EVENT, listener);
  return () => {
    bus.off(EVENT, listener);
  };
}
