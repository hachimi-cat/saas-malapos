/**
 * Test-mode access key registry. Ported (stripped) from saas-plugipay.
 *
 * Template ships an empty registry — each product fills in the keys
 * its HMAC middleware or test harness looks up. Never ship real
 * secrets here; these are for unit/integration tests that exercise
 * the signing flow without hitting a real key store.
 *
 * For production, replace with a real access-key store (DB table or
 * secret-manager lookup) — see ADR-0005.
 */

export interface AccessKey {
  keyId: string;
  secret: string;
  accountId: string;
  mode: 'live' | 'test';
  scopes: string[];
}

const KEYS: Record<string, AccessKey> = {
  // Populate with test keys per product. Example:
  // AKIA_MALAPOS_TEST_A: {
  //   keyId: 'AKIA_MALAPOS_TEST_A',
  //   secret: 'secret-a-do-not-ship-to-prod',
  //   accountId: 'acc_test_malapos_a',
  //   mode: 'test',
  //   scopes: ['malapos:*:*'],
  // },
};

export function lookupAccessKey(keyId: string): AccessKey | null {
  return KEYS[keyId] ?? null;
}

/**
 * Does `scopes` grant `required`?  Supports exact match, `service:*`,
 * `service:resource:*` glob trailing wildcards.
 */
export function hasScope(scopes: string[], required: string): boolean {
  for (const s of scopes) {
    if (s === required) return true;
    if (s.endsWith(':*')) {
      const prefix = s.slice(0, -1);
      if (required.startsWith(prefix)) return true;
    }
    if (s.endsWith('*')) {
      const prefix = s.slice(0, -1);
      if (required.startsWith(prefix)) return true;
    }
  }
  return false;
}
