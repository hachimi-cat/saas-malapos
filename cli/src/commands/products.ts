/**
 * `malapos products` — the catalog.
 *
 * list   GET /api/v1/products   (the backend envelopes as { products })
 *          --category <id>  --active <true|false>  --q <term>
 */
import { Command } from 'commander';
import { formatOpts, getGlobalOpts, newClient } from '../lib/context.js';
import { handleError } from '../lib/error.js';
import { kv, printResult } from '../lib/output.js';

interface Variant {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price: number;
}

interface Product {
  id: string;
  name: string;
  kind?: string;
  isActive?: boolean;
  variants?: Variant[];
}

export function createProductsCommand(): Command {
  const products = new Command('products').description('Product catalog');

  products
    .command('list')
    .description('List products (with variants) in your workspace')
    .option('--category <id>', 'filter by category id')
    .option('--active <bool>', 'filter by active state (true|false)')
    .option('--q <term>', 'fuzzy name search')
    .action(async (opts: { category?: string; active?: string; q?: string }, cmd) => {
      const g = getGlobalOpts(cmd);
      try {
        const { client } = await newClient(g);
        const query: Record<string, string> = {};
        if (opts.category) query.categoryId = opts.category;
        if (opts.active) query.active = opts.active;
        if (opts.q) query.q = opts.q;
        const { products: rows } = await client.get<{ products: Product[] }>('/api/v1/products', {
          query,
        });
        printResult(
          rows,
          (list) =>
            list.length === 0
              ? ['No products.']
              : list.flatMap((p) => [
                  kv('ID', p.id, formatOpts(g)),
                  kv('Name', p.name, formatOpts(g)),
                  kv('Kind', p.kind ?? null, formatOpts(g)),
                  kv('Active', p.isActive === false ? 'no' : 'yes', formatOpts(g)),
                  kv('Variants', p.variants?.length ?? 0, formatOpts(g)),
                  ...(p.variants ?? []).map((v) =>
                    kv('  •', `${v.name} — ${v.price}${v.sku ? ` (sku ${v.sku})` : ''}`, formatOpts(g)),
                  ),
                  '',
                ]),
          formatOpts(g),
        );
      } catch (err) {
        handleError(err, g);
      }
    });

  return products;
}

export const products = createProductsCommand();
