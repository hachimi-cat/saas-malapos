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

/**
 * `deleteMany` for every OTHER batch verb — approve, void, publish,
 * unpublish. Same contract: keep going past failures (stopping cannot
 * undo what already went through, only lose work), and report a partial
 * run as a FAILURE naming what did NOT make it, in the server's own
 * words.
 *
 * `pastVerb` is how the verb reads once it has happened ("Approved",
 * "Published") so the sentence matches the product-wide shape — the
 * same one `withBulk`, `buildBulkEditResource`, `buildBulkVerbResource`
 * and `deleteMany` all produce.
 *
 * This is the ASSISTANT-OFF path: with the assistant on, a page's batch
 * verb opens the agentic verb sheet, whose descriptor fans out through
 * the resource's own apply. Both end at the same per-record endpoint.
 */
export async function actMany(
  pastVerb: string,
  targets: { id: string; label: string }[],
  actOne: (id: string) => Promise<unknown>,
): Promise<void> {
  let done = 0;
  const failed: string[] = [];
  for (const t of targets) {
    try {
      await actOne(t.id);
      done++;
    } catch (e) {
      failed.push(`${t.label} (${errorMessage(e)})`);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `${pastVerb} ${done} of ${targets.length}. These did not: ${failed.join('; ')}`,
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
