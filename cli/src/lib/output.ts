/**
 * Output helpers for the Malapos CLI.
 *
 * Two modes:
 *   - human (default) — chalk-styled key/value or table output
 *   - json (--json)   — single JSON document on stdout, suitable for piping
 *
 * Anything human-readable goes through `printHuman`; structured payloads go
 * through `printJson`. Use `printResult` when the caller wants either based
 * on the global `--json` flag.
 */
import chalk from 'chalk';

export interface FormatOpts {
  json: boolean;
  noColor: boolean;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printHuman(lines: string[]): void {
  process.stdout.write(`${lines.join('\n')}\n`);
}

export function printResult<T>(
  value: T,
  humanLines: (v: T) => string[],
  opts: FormatOpts,
): void {
  if (opts.json) {
    printJson(value);
    return;
  }
  printHuman(humanLines(value));
}

export function kv(label: string, value: string | number | undefined | null, opts: FormatOpts): string {
  const v = value === undefined || value === null || value === '' ? chalk.dim('–') : String(value);
  if (opts.noColor) return `${label.padEnd(18)} ${v}`;
  return `${chalk.dim(label.padEnd(18))} ${v}`;
}

export function ok(msg: string, opts: FormatOpts): string {
  return opts.noColor ? `OK ${msg}` : `${chalk.green('OK')} ${msg}`;
}

export function warn(msg: string, opts: FormatOpts): string {
  return opts.noColor ? `WARN ${msg}` : `${chalk.yellow('WARN')} ${msg}`;
}
