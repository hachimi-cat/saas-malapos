/**
 * Shared CLI context — pulls global flags + env into a single struct and
 * builds the API client on demand. All commands receive this via the
 * commander `Command` instance.
 *
 * Auth model: every command (except `auth login`) builds its client from,
 * in order, `MALAPOS_TOKEN`, an API key saved by `auth login --api-key`, or
 * the Session from `~/.malapos/credentials` (lib/credentials.ts). With a
 * Session, the SDK's ApiClient handles proactive + reactive refresh
 * transparently, so commands never touch tokens directly.
 *
 * Malapos has no dedicated `@forjio/malapos-node` SDK; we wire the generic
 * `@forjio/sdk` `ApiClient` straight at `${baseUrl}/api/v1/...` instead.
 */
import { Command } from 'commander';
import { ApiClient, Session } from '@forjio/sdk';
import type { FormatOpts } from './output.js';
import { envToken, loadApiKey, TOKEN_ENV } from './credentials.js';

export interface GlobalOpts {
  json: boolean;
  noColor: boolean;
  profile?: string;
  baseUrl?: string;
}

export function getGlobalOpts(cmd: Command): GlobalOpts {
  // walk up to the root command — flags are declared on the program itself
  let root: Command = cmd;
  while (root.parent) root = root.parent;
  const opts = root.opts() as {
    json?: boolean;
    color?: boolean;
    profile?: string;
    baseUrl?: string;
  };
  return {
    json: Boolean(opts.json),
    // commander turns --no-color into { color: false }; default is true
    noColor: opts.color === false,
    profile: opts.profile,
    baseUrl: opts.baseUrl,
  };
}

export function formatOpts(g: GlobalOpts): FormatOpts {
  return { json: g.json, noColor: g.noColor };
}

export function baseUrl(g: GlobalOpts): string {
  return g.baseUrl ?? process.env['MALAPOS_BASE_URL'] ?? 'https://malapos.com';
}

export function issuerUrl(): string {
  return (process.env['MALAPOS_HUUDIS_ISSUER'] || process.env['FORJIO_OIDC_ISSUER'] || 'https://huudis.com').replace(
    /\/+$/,
    '',
  );
}

export function clientId(): string {
  return process.env['MALAPOS_CLI_CLIENT_ID'] ?? 'malapos-cli';
}

export const DEFAULT_SCOPE = 'openid profile email';

/**
 * Build a Session bound to `~/.malapos/credentials` for the active profile.
 * Does NOT load — callers decide when to load() vs. construct empty.
 */
export function newSession(g: GlobalOpts): Session {
  const opts: { brand: string; profile?: string } = { brand: 'malapos' };
  if (g.profile) opts.profile = g.profile;
  return new Session(opts);
}

export type CredentialSource = 'env' | 'api_key' | 'session';

/** A client that sends a fixed bearer (an API key or `MALAPOS_TOKEN`). */
function bearerClient(g: GlobalOpts, token: string): ApiClient {
  return new ApiClient({ baseUrl: baseUrl(g), defaultHeaders: { authorization: `Bearer ${token}` } });
}

/**
 * Build an ApiClient ready to make authenticated calls against the Malapos
 * backend: `MALAPOS_TOKEN`, else the profile's saved API key, else its
 * Huudis session. Exits with a friendly message if none is present.
 */
export async function newClient(
  g: GlobalOpts,
): Promise<{ client: ApiClient; session?: Session; source: CredentialSource }> {
  const env = envToken();
  if (env) return { client: bearerClient(g, env), source: 'env' };
  const session = newSession(g);
  const saved = await loadApiKey(session);
  if (saved) return { client: bearerClient(g, saved.apiKey), source: 'api_key' };
  try {
    await session.load();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Not signed in (${msg}). Run \`malapos auth login\` (or \`malapos auth login --api-key <key>\`), or set ${TOKEN_ENV}.\n`,
    );
    process.exit(1);
  }
  const client = new ApiClient({ session, baseUrl: baseUrl(g) });
  return { client, session, source: 'session' };
}
