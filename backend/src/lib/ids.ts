import { ulid } from 'ulid';

/**
 * ULID-based ID factory + ARN builder. Ported from saas-plugipay.
 *
 * Each product narrows `IdPrefix` to its own bounded-context types
 * (e.g. plugipay uses `cus`/`sub`/`inv`/etc.). Template ships a
 * minimal baseline of cross-service prefixes.
 */
export type IdPrefix =
  | 'evt' // outbox event
  | 'req' // request id (prefer the request-id middleware)
  | 'idem'; // idempotency fallback

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid().toLowerCase()}`;
}

export function region(): string {
  return process.env.FORJIO_REGION ?? 'sgp1';
}

/**
 * Build a Forjio ARN for a resource owned by this service.
 *   forjio:<service>:<region>:<accountId>:<resource>/<id>
 *
 * Matches the ARN grammar in `@forjio/sdk` — see ADR-0002.
 */
export function buildArn(accountId: string, resource: string, id: string): string {
  const service = process.env.FORJIO_SERVICE ?? 'malapos';
  return `forjio:${service}:${region()}:${accountId}:${resource}/${id}`;
}
