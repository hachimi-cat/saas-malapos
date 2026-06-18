/**
 * Cursor pagination helpers. Ported from saas-plugipay.
 *
 * A cursor is a base64url-encoded `{ createdAt, id }` pair. `id` ties
 * the cursor to a specific row (so ties on `createdAt` are resolved
 * deterministically). Pass the cursor as `?cursor=<string>` and the
 * server decodes it into a where-clause.
 */

export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const s = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(s) as Cursor;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Pull pagination params out of a parsed query object. Clamps limit
 * into [1, 100], defaults order to 'desc'. Decodes cursor or returns
 * null on malformed input.
 */
export function parsePagination(q: Record<string, unknown>): {
  limit: number;
  order: 'asc' | 'desc';
  cursor: Cursor | null;
} {
  const rawLimit = q.limit;
  let limit = 20;
  if (typeof rawLimit === 'string') {
    const n = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(n)) limit = Math.max(1, Math.min(100, n));
  }
  const order: 'asc' | 'desc' = q.order === 'asc' ? 'asc' : 'desc';
  const cursor = decodeCursor(typeof q.cursor === 'string' ? q.cursor : null);
  return { limit, order, cursor };
}
