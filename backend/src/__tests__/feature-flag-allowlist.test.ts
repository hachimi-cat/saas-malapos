import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * The pilot allowlist — the mechanism the catentio pilot rides on.
 *
 * The load-bearing property is the ORDER: an allowlisted subject gets the
 * feature while the flag is OFF. Check `enabled` first and the allowlist
 * becomes decoration, the pilot silently doesn't work, and the natural
 * "fix" is to enable the flag — which ships the feature to every customer.
 * That is the failure this file exists to prevent.
 */

const findMany = vi.fn();
vi.mock('../lib/db.js', () => ({ prisma: { featureFlag: { findMany } } }));

const BANG = 'usr_01KPHFKMCERET4RYTBPHKVK4ET';
const GOJO = 'usr_01KQXET0CV2A0ND610289DYEHA';

function flag(over: Record<string, unknown> = {}) {
  return {
    key: 'catentio.pilot_integration',
    label: 'Catentio pilot integration',
    description: null,
    enabled: false,
    rollout: null,
    allowlist: [BANG, GOJO],
    updatedAt: new Date('2026-07-31T00:00:00Z'),
    updatedBy: null,
    ...over,
  };
}

async function flags() {
  const m = await import('../lib/feature-flags.js');
  m.invalidateFeatureFlagCache();
  return m;
}

beforeEach(() => {
  vi.resetModules();
  findMany.mockReset();
});

describe('pilot allowlist', () => {
  it('lets an allowlisted subject through while the flag is OFF', async () => {
    findMany.mockResolvedValue([flag({ enabled: false })]);
    const { isEnabled } = await flags();
    expect(await isEnabled('catentio.pilot_integration', BANG)).toBe(true);
    expect(await isEnabled('catentio.pilot_integration', GOJO)).toBe(true);
  });

  it('keeps everyone else out while the flag is OFF', async () => {
    findMany.mockResolvedValue([flag({ enabled: false })]);
    const { isEnabled } = await flags();
    expect(await isEnabled('catentio.pilot_integration', 'usr_customer')).toBe(false);
    // No subject at all is also not on the allowlist.
    expect(await isEnabled('catentio.pilot_integration')).toBe(false);
  });

  it('matches case-insensitively, so an email typed in the admin box works', async () => {
    findMany.mockResolvedValue([flag({ allowlist: ['Adhya@Forjio.com'] })]);
    const { isEnabled } = await flags();
    expect(await isEnabled('catentio.pilot_integration', 'adhya@forjio.com')).toBe(true);
    expect(await isEnabled('catentio.pilot_integration', 'ADHYA@FORJIO.COM')).toBe(true);
  });

  it('does not let the allowlist keep a flag alive for everyone', async () => {
    // An empty allowlist must not accidentally match — `[].some()` is
    // false, but a truthy-check bug here would flip the whole product on.
    findMany.mockResolvedValue([flag({ enabled: false, allowlist: [] })]);
    const { isEnabled } = await flags();
    expect(await isEnabled('catentio.pilot_integration', BANG)).toBe(false);
  });

  it('still honours rollout for non-allowlisted subjects once ON', async () => {
    findMany.mockResolvedValue([flag({ enabled: true, rollout: 0 })]);
    const { isEnabled } = await flags();
    // rollout 0 = on, nobody yet — except the pilot, who bypasses it.
    expect(await isEnabled('catentio.pilot_integration', 'usr_customer')).toBe(false);
    expect(await isEnabled('catentio.pilot_integration', BANG)).toBe(true);
  });

  it('returns false instead of throwing when the store is unreadable', async () => {
    // Runs on live request paths. A flag subsystem that can 500 the
    // feature it guards turns a question nobody asked into an outage.
    findMany.mockRejectedValue(new Error('relation "feature_flags" does not exist'));
    const { isEnabled } = await flags();
    await expect(isEnabled('catentio.pilot_integration', BANG)).resolves.toBe(false);
  });

  it('is false for a key nobody declared', async () => {
    findMany.mockResolvedValue([flag()]);
    const { isEnabled } = await flags();
    expect(await isEnabled('never.declared', BANG)).toBe(false);
  });
});
