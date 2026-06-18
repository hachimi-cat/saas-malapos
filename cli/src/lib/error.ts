/**
 * Uniform error handling: in --json mode emit a JSON error envelope,
 * otherwise a chalked one-liner on stderr. Always exits non-zero.
 */
import chalk from 'chalk';
import type { GlobalOpts } from './context.js';

export function handleError(err: unknown, g: GlobalOpts): never {
  const msg = err instanceof Error ? err.message : String(err);
  // ApiError from the SDK exposes `status` + `code` fields.
  const e = err as { status?: number; code?: string };
  if (g.json) {
    process.stderr.write(
      `${JSON.stringify({ error: { message: msg, status: e.status, code: e.code } })}\n`,
    );
  } else {
    const tag = g.noColor ? 'Error:' : chalk.red('Error:');
    process.stderr.write(`${tag} ${msg}\n`);
  }
  process.exit(1);
}
