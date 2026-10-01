/**
 * Where Malapos may send a merchant's webhooks — the SSRF guard.
 *
 * A merchant chooses the URL, and Malapos's server makes the request,
 * so an unchecked URL lets anyone with an API key make our server call
 * its own loopback, the private network behind it, or the cloud
 * metadata service. Same guard as Secronna's webhooks (services/
 * webhooks.ts there), which this follows:
 *
 *  - https only (`WEBHOOK_ALLOW_HTTP=true` lets a staging box accept
 *    http://); http is accepted only when NODE_ENV is development or
 *    test;
 *  - the hostname is resolved and EVERY address it resolves to is
 *    checked against a denylist (loopback, RFC1918 private, CGNAT —
 *    the tailnet —, link-local incl. 169.254.169.254, ULA, multicast,
 *    unspecified, reserved), plus `localhost` / `*.local` /
 *    `*.internal` names, which are refused before any lookup;
 *  - it runs when an endpoint is registered or its URL changes (fast
 *    feedback) AND on every delivery: `assertSafeWebhookUrl` before the
 *    request, and `guardedLookup` as the socket's own DNS lookup, so the
 *    address actually connected to is the one that was checked and a
 *    DNS answer that changes in between (rebinding) cannot slip through;
 *  - redirects are never followed (the deliverer treats a 3xx as a
 *    failed attempt), since a followed redirect would skip all of this.
 *
 * `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` turns the address check off for
 * local development and tests (a receiver on 127.0.0.1). It is honoured
 * only when NODE_ENV is development or test: any other NODE_ENV —
 * production, staging, unset — gets the strict rules (fail closed).
 */
import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';

/** A target Malapos refuses to call. The message is safe to show the
 *  merchant (it ends up in the delivery log and in 400 responses). */
export class BlockedTargetError extends Error {
  readonly code = 'BLOCKED_TARGET';
}

export type WebhookResolver = (host: string) => Promise<Array<{ address: string; family: number }>>;
const defaultResolver: WebhookResolver = (host) => dnsLookup(host, { all: true, verbatim: true });
let resolver: WebhookResolver = defaultResolver;

/** Test seam: answer DNS from a table instead of the network (`null` restores it). */
export function __setWebhookResolver(r: WebhookResolver | null): void {
  resolver = r ?? defaultResolver;
}

/** Only a developer's machine and the test suite may relax the rules. */
function isDevOrTest(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

export function httpAllowed(): boolean {
  return isDevOrTest() || process.env.WEBHOOK_ALLOW_HTTP === 'true';
}

export function privateTargetsAllowed(): boolean {
  return isDevOrTest() && process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true';
}

// ── address classification ──────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  const p = ip.split('.').map(Number);
  return (((p[0] ?? 0) * 16777216) + ((p[1] ?? 0) * 65536) + ((p[2] ?? 0) * 256) + (p[3] ?? 0)) >>> 0;
}

const V4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this host" / unspecified
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // RFC6598 CGNAT (the tailnet)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. 255.255.255.255
];

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

/** An IPv6 literal as 8 hextets, or null when it does not parse. */
function expandV6(input: string): number[] | null {
  let s = input;
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const v4tail = s.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4tail) {
    const o = (v4tail[2] ?? '').split('.').map(Number);
    if (o.length !== 4 || o.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
    s = `${v4tail[1]}${(((o[0]! << 8) | o[1]!) & 0xffff).toString(16)}:${(((o[2]! << 8) | o[3]!) & 0xffff).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const side = (x: string): number[] | null => {
    if (x === '') return [];
    const out: number[] = [];
    for (const g of x.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const left = side(halves[0] ?? '');
  if (!left) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const right = side(halves[1] ?? '');
  if (!right) return null;
  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;
  return [...left, ...Array<number>(fill).fill(0), ...right];
}

function isBlockedV6(ip: string): boolean {
  const h = expandV6(ip);
  if (!h) return true; // fail closed on anything unclassifiable
  const g = (i: number) => h[i] ?? 0;
  if (h.every((x) => x === 0)) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && g(7) === 1) return true; // ::1
  if (h.slice(0, 5).every((x) => x === 0) && g(5) === 0xffff) {
    // ::ffff:a.b.c.d — judge the IPv4 inside
    return isBlockedV4(`${g(6) >> 8}.${g(6) & 0xff}.${g(7) >> 8}.${g(7) & 0xff}`);
  }
  if (h.slice(0, 6).every((x) => x === 0)) return true; // ::/96, deprecated IPv4-compatible
  const b0 = g(0) >> 8;
  const b1 = g(0) & 0xff;
  if (b0 === 0xfe && (b1 & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if ((b0 & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (b0 === 0xff) return true; // ff00::/8 multicast
  if (g(0) === 0x64 && g(1) === 0xff9b) return true; // 64:ff9b::/96 NAT64 — can reach private v4
  return false;
}

export function isBlockedAddress(address: string, family?: number): boolean {
  const fam = family === 4 || family === 6 ? family : isIP(address);
  if (fam === 4) return isBlockedV4(address);
  if (fam === 6) return isBlockedV6(address);
  return true;
}

const BLOCKED_NAMES = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i];

// ── the checks ──────────────────────────────────────────────────────

/** Parse + scheme + hostname checks — everything that needs no DNS.
 *  Returns the hostname to resolve (IPv6 brackets stripped). */
export function checkWebhookUrlShape(raw: string): { url: URL; host: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedTargetError('url must be an absolute http(s) URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BlockedTargetError('url must be an https URL');
  }
  if (url.protocol === 'http:' && !httpAllowed()) {
    throw new BlockedTargetError('url must be an https URL');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) throw new BlockedTargetError('url has no host');
  if (!privateTargetsAllowed() && BLOCKED_NAMES.some((re) => re.test(host))) {
    throw new BlockedTargetError(`blocked: ${host} is a private host name`);
  }
  return { url, host };
}

/**
 * The whole check: shape, then resolve the host and refuse when ANY
 * address it resolves to is private/loopback/link-local. Throws
 * BlockedTargetError.
 */
export async function assertSafeWebhookUrl(raw: string): Promise<void> {
  const { host } = checkWebhookUrlShape(raw);
  if (privateTargetsAllowed()) return;
  let addrs: Array<{ address: string; family: number }>;
  if (isIP(host)) {
    addrs = [{ address: host, family: isIP(host) }];
  } else {
    try {
      addrs = await resolver(host);
    } catch {
      throw new BlockedTargetError(`blocked: could not resolve ${host}`);
    }
  }
  if (!addrs || addrs.length === 0) throw new BlockedTargetError(`blocked: ${host} did not resolve`);
  for (const a of addrs) {
    if (isBlockedAddress(a.address, a.family)) {
      throw new BlockedTargetError(`blocked: ${host} resolves to a private, loopback or link-local address (${a.address})`);
    }
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * DNS lookup for the delivery socket (`lookup` option of http.request):
 * the same resolver and the same denylist, applied to the answer the
 * connection then uses. Handles both the single-address and the
 * `all: true` (happy-eyeballs) call shapes.
 */
export function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  resolver(hostname)
    .then((addrs) => {
      let list = addrs.filter((a) => !options.family || a.family === options.family);
      if (list.length === 0) list = addrs;
      if (list.length === 0) throw new BlockedTargetError(`blocked: ${hostname} did not resolve`);
      if (!privateTargetsAllowed()) {
        const bad = list.find((a) => isBlockedAddress(a.address, a.family));
        if (bad) {
          throw new BlockedTargetError(
            `blocked: ${hostname} resolves to a private, loopback or link-local address (${bad.address})`,
          );
        }
      }
      if (options.all) callback(null, list.map((a) => ({ address: a.address, family: a.family })));
      else callback(null, list[0]!.address, list[0]!.family);
    })
    .catch((e: Error) => callback(e as NodeJS.ErrnoException, '', 0));
}
