import crypto from 'node:crypto';

/**
 * API-key minting + hashing. Key-hash pattern ported from
 * saas-plugipay (via suppuo): the plaintext is shown ONCE at creation;
 * only the sha256 hex digest is persisted, and Bearer lookups hash the
 * presented token and match on the unique `keyHash` column.
 */

/** All Malapos API keys carry this prefix; `requireAuth` branches on it
 *  BEFORE attempting JWT verification. */
export const API_KEY_PREFIX = 'sk_live_';

/** Display-safe prefix length stored alongside the hash
 *  ("sk_live_" + 4 hex chars). */
const DISPLAY_PREFIX_LEN = API_KEY_PREFIX.length + 4;

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Mint a new key: `sk_live_<48hex>` (24 random bytes). */
export function generateApiKey(): { plaintext: string; keyPrefix: string; keyHash: string } {
  const plaintext = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
  return {
    plaintext,
    keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LEN),
    keyHash: hashApiKey(plaintext),
  };
}
