/**
 * How the generated `malapos api <area> <action>` commands (commands/api.generated.ts)
 * make their call: this CLI's own session (`malapos auth login`) and `@forjio/sdk`
 * ApiClient, its own output and errors.
 */
import type { Command } from 'commander';
import { getGlobalOpts, newClient } from './context.js';
import { handleError } from './error.js';
import { printJson } from './output.js';

type QueryValue = string | number | boolean | undefined;

export async function callRoute(
  cmd: Command,
  method: string,
  path: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
): Promise<void> {
  const g = getGlobalOpts(cmd);
  try {
    const q: Record<string, QueryValue> = Object.fromEntries(
      Object.entries(query).map(([k, v]): [string, QueryValue] => [
        k,
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : JSON.stringify(v),
      ]),
    );
    const { client } = await newClient(g);
    let data: unknown;
    switch (method) {
      case 'GET':
        data = await client.get<unknown>(path, { query: q });
        break;
      case 'POST':
        data = await client.post<unknown>(path, body, { query: q });
        break;
      case 'PATCH':
        data = await client.patch<unknown>(path, body, { query: q });
        break;
      case 'PUT':
        data = await client.put<unknown>(path, body, { query: q });
        break;
      case 'DELETE':
        data = await client.delete<unknown>(path, { query: q });
        break;
      default:
        throw new Error(`unsupported method ${method}`);
    }
    printJson(data ?? null);
  } catch (err) {
    handleError(err, g);
  }
}

/** Bad input to a generated command (a missing field, a value the spec does not allow). */
export async function failRoute(cmd: Command, err: unknown): Promise<never> {
  handleError(err, getGlobalOpts(cmd));
}
