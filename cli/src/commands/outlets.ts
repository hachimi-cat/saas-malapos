/**
 * `malapos outlets` — store locations.
 *
 * list   GET /api/v1/outlets   (the backend envelopes as { outlets })
 */
import { Command } from 'commander';
import { formatOpts, getGlobalOpts, newClient } from '../lib/context.js';
import { handleError } from '../lib/error.js';
import { kv, printResult } from '../lib/output.js';

interface Outlet {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  timezone?: string;
  isActive?: boolean;
}

export function createOutletsCommand(): Command {
  const outlets = new Command('outlets').description('Store outlets / locations');

  outlets
    .command('list')
    .description('List outlets in your workspace')
    .action(async (_opts, cmd) => {
      const g = getGlobalOpts(cmd);
      try {
        const { client } = await newClient(g);
        const { outlets: rows } = await client.get<{ outlets: Outlet[] }>('/api/v1/outlets');
        printResult(
          rows,
          (list) =>
            list.length === 0
              ? ['No outlets.']
              : list.flatMap((o) => [
                  kv('ID', o.id, formatOpts(g)),
                  kv('Name', o.name, formatOpts(g)),
                  kv('Address', o.address ?? null, formatOpts(g)),
                  kv('Phone', o.phone ?? null, formatOpts(g)),
                  kv('Timezone', o.timezone ?? null, formatOpts(g)),
                  kv('Active', o.isActive === false ? 'no' : 'yes', formatOpts(g)),
                  '',
                ]),
          formatOpts(g),
        );
      } catch (err) {
        handleError(err, g);
      }
    });

  return outlets;
}

export const outlets = createOutletsCommand();
