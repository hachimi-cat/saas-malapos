/**
 * Credentials beyond the Huudis device-flow session.
 *
 * What the CLI sends as `Authorization: Bearer …`, in order:
 *
 *   1. `MALAPOS_TOKEN` in the environment (CI, scripts, one-off overrides);
 *   2. an API key saved by `malapos auth login --api-key <key>` — stored in
 *      the active profile of `~/.malapos/credentials` as `api_key = …`;
 *   3. the Huudis session `malapos auth login` saved in that profile
 *      (the SDK Session; the ApiClient refreshes it).
 *
 * A profile holds one or the other: the SDK's `Session.save` rewrites the
 * whole section, and so does `saveApiKey`; `Session.clear` (auth logout)
 * removes either.
 */
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { fetchDiscovery, parseIni, serializeIni, type Session } from '@forjio/sdk';

export const TOKEN_ENV = 'MALAPOS_TOKEN';

export function envToken(): string | undefined {
  const v = process.env[TOKEN_ENV]?.trim();
  return v ? v : undefined;
}

async function readProfiles(path: string): Promise<Record<string, Record<string, string>>> {
  try {
    return parseIni(await fs.readFile(path, 'utf8'));
  } catch {
    return {};
  }
}

async function writeProfiles(path: string, profiles: Record<string, Record<string, string>>): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp.${process.pid}`;
  await fs.writeFile(tmp, serializeIni(profiles), { mode: 0o600 });
  await fs.rename(tmp, path);
}

/** The profile's saved credential kind, if any. */
export async function profileKind(session: Session): Promise<'api_key' | 'session' | null> {
  const p = (await readProfiles(session.credentialsPath))[session.profile];
  if (!p) return null;
  if (p.api_key) return 'api_key';
  return p.access_token ? 'session' : null;
}

export interface SavedApiKey {
  apiKey: string;
  savedAt?: string;
}

/** The API key saved under the session's profile, or null when the profile holds a session or nothing. */
export async function loadApiKey(session: Session): Promise<SavedApiKey | null> {
  const p = (await readProfiles(session.credentialsPath))[session.profile];
  return p?.api_key ? { apiKey: p.api_key, ...(p.saved_at ? { savedAt: p.saved_at } : {}) } : null;
}

/** Save an API key as the profile's credential (replacing a session there). */
export async function saveApiKey(session: Session, apiKey: string): Promise<SavedApiKey> {
  const profiles = await readProfiles(session.credentialsPath);
  const savedAt = new Date().toISOString();
  profiles[session.profile] = { api_key: apiKey, saved_at: savedAt };
  await writeProfiles(session.credentialsPath, profiles);
  return { apiKey, savedAt };
}

/** `sk_live_…wxyz` — enough to recognise a key without printing it. */
export function keyHint(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 3)}…`;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export interface Userinfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  [claim: string]: unknown;
}

/** Huudis's OIDC userinfo for an access token (endpoint from discovery). */
export async function fetchUserinfo(issuer: string, accessToken: string): Promise<Userinfo> {
  const base = issuer.replace(/\/+$/, '');
  const disco = await fetchDiscovery(base);
  const url = disco.userinfo_endpoint ?? `${base}/api/v1/oidc/userinfo`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const e = new Error(`Huudis rejected the session (HTTP ${res.status}). Run \`malapos auth login\` again.`);
    (e as Error & { status: number }).status = res.status;
    throw e;
  }
  return (await res.json()) as Userinfo;
}
