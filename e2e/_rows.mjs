/** Throwaway: how many selectable rows does gojo have on each staging
 *  product? Decides whether the 0.22.0 live check needs to seed. */
import { request } from '@playwright/test';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('/root/.config/agents/gojo/credentials.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [
      l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, ''),
    ]),
);

const TARGETS = [
  ['malapos', 'https://staging-malapos.forjio.com', '/api/v1/suppliers'],
  ['plugipay', 'https://staging-plugipay.forjio.com', '/api/v1/customers'],
  ['storlaunch', 'https://staging-storlaunch.forjio.com', '/api/v1/testimonials'],
  ['linksnap', 'https://staging-linksnap.forjio.com', '/api/v1/links'],
];

const count = (j) => {
  const d = j?.data ?? j;
  if (Array.isArray(d)) return d.length;
  for (const v of Object.values(d ?? {})) if (Array.isArray(v)) return v.length;
  return `? ${JSON.stringify(j).slice(0, 120)}`;
};

for (const [brand, base, path] of TARGETS) {
  const ctx = await request.newContext({ baseURL: base });
  try {
    const login = await ctx.post('/api/v1/auth/login', {
      data: { email: 'gojo@forjio.com', password: env.GOJO_HUUDIS_PASSWORD },
      headers: { 'Idempotency-Key': `rows-${brand}-login` },
    });
    if (!login.ok()) {
      console.log(`${brand.padEnd(11)} login ${login.status()} ${(await login.text()).slice(0, 120)}`);
      await ctx.dispose();
      continue;
    }
    const res = await ctx.get(path);
    console.log(`${brand.padEnd(11)} ${path} ${res.status()} rows=${res.ok() ? count(await res.json()) : (await res.text()).slice(0, 120)}`);
  } catch (e) {
    console.log(`${brand.padEnd(11)} threw ${e.message.slice(0, 140)}`);
  }
  await ctx.dispose();
}
