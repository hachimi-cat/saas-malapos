import { ApiRequestError } from '@/lib/api';

/**
 * Delete every selected record, continuing past failures.
 *
 * Same contract as the batch-create fan-out in
 * components/catentio/resources.ts: a bad record does not abandon the
 * ones after it (stopping cannot undo what is already gone, only lose
 * work), and a partial run is reported as a FAILURE naming what
 * survived — the alternative is a green tick over a list still holding
 * records the merchant asked to remove. Servers refuse some deletes on
 * purpose (a product with sales history answers 409), so the named
 * failure with the server's own reason is the normal path, not an edge.
 */
export async function deleteMany(
  targets: { id: string; label: string }[],
  deleteOne: (id: string) => Promise<unknown>,
): Promise<void> {
  let deleted = 0;
  const failed: string[] = [];
  for (const t of targets) {
    try {
      await deleteOne(t.id);
      deleted++;
    } catch (e) {
      failed.push(`${t.label} (${errorMessage(e)})`);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `Deleted ${deleted} of ${targets.length}. These did not: ${failed.join('; ')}`,
    );
  }
}

/** The server's own words when it sent any — malapos's api client
 *  throws ApiRequestError with the envelope's message already on it,
 *  so `.message` is the whole story (no axios envelope digging). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'unknown error';
}
