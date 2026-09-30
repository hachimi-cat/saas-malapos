import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

// `malapos api <area> <action>`: every feature route, generated from the API spec.
// The call goes through the CLI's own signed-in client (lib/context.ts newClient),
// stubbed here so nothing leaves the process.
const client = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};
vi.mock('../lib/context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/context.js')>();
  return { ...actual, newClient: vi.fn(async () => ({ client, session: {} })) };
});

const { API_ROUTES, buildApiCommand } = await import('../commands/api.generated.js');

class Exit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

// The same root flags as src/index.ts, with the generated `api` group mounted.
function program(): Command {
  const p = new Command()
    .name('malapos')
    .option('--json')
    .option('--profile <name>')
    .option('--base-url <url>')
    .option('--no-color')
    .exitOverride();
  p.addCommand(buildApiCommand());
  return p;
}

async function run(argv: string[]): Promise<number> {
  try {
    await program().parseAsync(argv, { from: 'user' });
    return 0;
  } catch (err) {
    if (err instanceof Exit) return err.code;
    throw err;
  }
}

let stdout: string[];
let stderr: string[];
beforeEach(() => {
  stdout = [];
  stderr = [];
  for (const fn of Object.values(client)) fn.mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => (stdout.push(String(s)), true));
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => (stderr.push(String(s)), true));
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exit(code ?? 0);
  }) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('malapos api', () => {
  it('has a command for every feature route', () => {
    const count = API_ROUTES.reduce((n, a) => n + a.routes.length, 0);
    expect(count).toBeGreaterThan(200);
    expect(API_ROUTES.map((a) => a.area)).toEqual(expect.arrayContaining(['outlets', 'products', 'sales']));
  });

  it('creates an outlet from flags, typed as the spec says', async () => {
    const code = await run([
      'api', 'outlets', 'create', '--name', 'Main', '--tax-rate-bps', '1100', '--tax-inclusive', 'false',
    ]);
    expect(code).toBe(0);
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/outlets',
      { name: 'Main', taxRateBps: 1100, taxInclusive: false },
      { query: {} },
    );
    expect(JSON.parse(stdout.join(''))).toEqual({ ok: true });
  });

  it('refuses a value the spec does not allow, and a missing required field', async () => {
    expect(await run(['api', 'products', 'create', '--name', 'Tea', '--kind', 'DRINK', '--variants', '[]'])).not.toBe(0);
    expect(await run(['api', 'products', 'create', '--kind', 'GOODS', '--variants', '[]'])).not.toBe(0);
    expect(client.post).not.toHaveBeenCalled();
    expect(stderr.join('')).toMatch(/missing --name/);
  });

  it('puts path parameters in the path and query fields in the query', async () => {
    expect(await run(['api', 'outlets', 'get', 'out 1'])).toBe(0);
    expect(client.get).toHaveBeenLastCalledWith('/api/v1/outlets/out%201', { query: {} });
    expect(await run(['api', 'products', 'list', '--q', 'tea', '--category-id', 'cat_1'])).toBe(0);
    expect(client.get).toHaveBeenLastCalledWith('/api/v1/products', { query: { q: 'tea', categoryId: 'cat_1' } });
    expect(await run(['api', 'floors', 'delete', 'fl_1'])).toBe(0);
    expect(client.delete).toHaveBeenLastCalledWith('/api/v1/floors/fl_1', { query: {} });
  });
});
