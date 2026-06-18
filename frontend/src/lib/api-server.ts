import 'server-only';
import { cookies, headers as nextHeaders } from 'next/headers';
import type { RequestOptions } from './api';

/**
 * Server-component helper. Ported from saas-plugipay.
 *
 * Server components don't share cookies with the client — so any
 * call into the backend from an RSC must forward the `Cookie`
 * header itself. `serverHeaders()` returns the forward bundle;
 * `serverFetchOpts()` merges it into a `RequestOptions` you pass to
 * `api.get()` / `apiRequest()`.
 *
 * Do NOT import this from a client component — `import 'server-only'`
 * will throw at build time. Use `api.ts` directly on the client.
 */

export async function serverHeaders(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const cookieStore = await cookies();
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  if (cookie) out.cookie = cookie;

  try {
    const h = await nextHeaders();
    const fwd = h.get('x-forwarded-for') ?? h.get('x-real-ip');
    if (fwd) out['x-forwarded-for'] = fwd;
  } catch {
    // headers() is unavailable outside a request — fine
  }

  return out;
}

/** Default fetch options for server-side data fetching. No caching
 *  by default — per-product code opts in with `cache: 'force-cache'`
 *  or `next: { revalidate }` when it makes sense. */
export async function serverFetchOpts(extra?: RequestOptions): Promise<RequestOptions> {
  return {
    ...extra,
    cache: extra?.cache ?? 'no-store',
    headers: { ...(await serverHeaders()), ...(extra?.headers ?? {}) },
  };
}
