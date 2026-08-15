import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROVIDERS,
  PROVIDER_BY_KEY,
  providerGuide,
  type Provider,
} from '@/lib/channel-providers';
import { buildCrudResource } from '@/components/catentio/resources';

/**
 * The channel provider catalog is read by two things that must agree:
 * the connect cards on /dashboard/marketing/channels, and the `channels`
 * assistant descriptor's provider + credentials guidance.
 *
 * bang, 2026-08-14: *"it can help user to setup channels. tell them how
 * to get key/token etc and help them to setup the channel in channels
 * page"*. An assistant that names a provider the form does not offer, or
 * a credential key the form does not collect, is worse than one that
 * says nothing — the merchant follows it and gets stuck. So the catalog
 * is ONE list and these are the ways it can rot.
 */

const SRC = join(__dirname, '..', '..');

/** The `Provider` union, read off the type so the test cannot drift from
 *  it by being updated in the same edit. */
function unionMembers(): string[] {
  const src = readFileSync(join(SRC, 'lib', 'channel-providers.ts'), 'utf8');
  const start = src.indexOf('export type Provider =');
  const end = src.indexOf(';', start);
  return [...src.slice(start, end).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

describe('the channel provider catalog is one list', () => {
  it('every member of the Provider union has a catalog entry', () => {
    // TypeScript checks each entry's `key` IS a Provider. It does NOT
    // check the other direction, so a provider added to the union and
    // forgotten in the array type-checks and renders no card at all.
    const missing = unionMembers().filter((p) => !(p in PROVIDER_BY_KEY));
    expect(missing, 'in the Provider union but not in PROVIDERS').toEqual([]);
  });

  it('the union and the array are the same size — no orphan entries', () => {
    expect(PROVIDERS).toHaveLength(unionMembers().length);
  });

  it('every non-OAuth provider names at least one credential field', () => {
    // authKind api_key / webhook_url means the merchant pastes
    // something. A provider with no fields would give the assistant
    // nothing to tell them to fetch.
    const silent = PROVIDERS.filter(
      (p) => p.authKind !== 'oauth' && (p.fields ?? []).length === 0,
    ).map((p) => p.key);
    expect(silent, 'needs credentials but declares no fields').toEqual([]);
  });

  it('OAuth providers declare NO fields', () => {
    // The guide tells the agent these have nothing to paste. If one grew
    // a field list the guide would be lying about it.
    const pasteable = PROVIDERS.filter(
      (p) => p.authKind === 'oauth' && (p.fields ?? []).length > 0,
    ).map((p) => p.key);
    expect(pasteable, 'OAuth — connecting is a redirect, not a paste').toEqual([]);
  });
});

describe('the channels descriptor teaches setup from that catalog', () => {
  const descriptor = buildCrudResource('channels', 'create');
  const providerField = descriptor.fields.find((f) => f.name === 'provider');
  const credentialsField = descriptor.fields.find((f) => f.name === 'credentials');

  it('names every provider the page can connect', () => {
    // The whole point of sharing the catalog. If someone re-inlines a
    // hand-written provider list into the descriptor, this fails on the
    // first provider the two lists disagree about.
    const text = providerField?.description ?? '';
    const unnamed = PROVIDERS.filter((p) => !text.includes(p.key)).map((p) => p.key);
    expect(unnamed, 'provider missing from the assistant guidance').toEqual([]);
  });

  it('names each provider credential key', () => {
    const text = providerField?.description ?? '';
    const missing: string[] = [];
    for (const p of PROVIDERS) {
      for (const f of p.fields ?? []) {
        if (!text.includes(f.key)) missing.push(`${p.key}.${f.key}`);
      }
    }
    expect(missing, 'credential key missing from the assistant guidance').toEqual([]);
  });

  it('positive control: the guidance is built, not empty', () => {
    // Without this, every sweep above passes on an empty string — an
    // absence reading as a clean result.
    expect(providerGuide().length).toBeGreaterThan(500);
    expect(providerField?.description ?? '').toContain(providerGuide());
  });

  it('still tells the agent not to invent credentials', () => {
    // The values are the merchant's. Explaining WHERE to find them is
    // the help; proposing them is a fabricated key that fails at send.
    expect(credentialsField?.description ?? '').toMatch(/never invent, guess or fill in/i);
  });

  it('its example prompts are setup questions, not form restatements', () => {
    // bang asked for help getting keys and tokens. An opening like
    // "Connect an email channel called X" is the form typed out in
    // words, and teaches nothing.
    const prompts = descriptor.examplePrompts ?? [];
    expect(prompts.length).toBeGreaterThan(0);
    expect(
      prompts.some((p) => /where|how|what do i need|walk me through/i.test(p)),
      'at least one opening should ask how to set a channel up',
    ).toBe(true);
  });
});

/** Guards the icon map the page keeps beside the catalog. */
describe('the page can draw every provider', () => {
  it('PROVIDER_ICONS covers the union', () => {
    const src = readFileSync(
      join(SRC, 'app', '(dashboard)', 'dashboard', 'marketing', 'channels', 'page.tsx'),
      'utf8',
    );
    const start = src.indexOf('const PROVIDER_ICONS');
    const end = src.indexOf('};', start);
    const block = src.slice(start, end);
    const missing = unionMembers().filter(
      (p: string) => !new RegExp(`\\b${p}:`).test(block),
    );
    expect(missing, 'provider with no icon renders a blank card').toEqual([]);
  });
});

// Referenced so the Provider type is exercised, not just imported.
export type _ProviderCheck = Provider;
