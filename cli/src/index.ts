/**
 * Malapos CLI entrypoint.
 *
 * Wires up the commander root with global flags shared by every subcommand
 * (`--json`, `--profile`, `--base-url`, `--no-color`) and registers each
 * command group. Auth uses Huudis device-flow OIDC via `@forjio/sdk`'s
 * `Session`; resource calls go through the SDK's `ApiClient` against
 * `${baseUrl}/api/v1/...`.
 */
import { Command } from 'commander';
import { auth } from './commands/auth.js';
import { outlets } from './commands/outlets.js';
import { products } from './commands/products.js';

export const program = new Command()
  .name('malapos')
  .description('CLI for Malapos — point-of-sale for the Forjio commerce suite.')
  .version('0.1.0');

program
  .option('--json', 'machine-readable JSON output')
  .option('--profile <name>', 'credential profile in ~/.malapos/credentials')
  .option('--base-url <url>', 'override API base URL (default: $MALAPOS_BASE_URL or https://malapos.com)')
  .option('--no-color', 'disable ANSI colors');

program.addCommand(auth);
program.addCommand(outlets);
program.addCommand(products);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
