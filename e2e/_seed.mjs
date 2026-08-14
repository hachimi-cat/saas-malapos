/** Throwaway: seed / clean up the 3 rows the 0.22.0 live check ticks.
 *  `node _seed.mjs seed` then `node _seed.mjs clean`. Ids are kept in the
 *  scratchpad so cleanup deletes BY ID, never by name. */
import { request } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const MODE = process.argv[2] ?? 'seed';
const STORE = '/tmp/claude-0/-/67f36688-2ca1-46e5-b84e-7e34aa3a578d/scratchpad/v22-seeded.json';

const env = Object.fromEntries(
  readFileSync('/root/.config/agents/gojo/credentials.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [
      l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, ''),
    ]),
);

const PLAN = {
  malapos: {
    base: 'https://staging-malapos.forjio.com',
    path: '/api/v1/suppliers',
    pick: (j) => j.data.supplier.id,
    bodies: ['V22 Alpha', 'V22 Beta', 'V22 Gamma'].map((name) => ({ name })),
  },
  storlaunch: {
    base: 'https://staging-storlaunch.forjio.com',
    path: '/api/v1/testimonials',
    pick: (j) => (j.data.testimonial ?? j.data).id,
    bodies: ['V22 Alpha', 'V22 Beta', 'V22 Gamma'].map((authorName) => ({
      authorName,
      quote: 'Throwaway row for the agent-ui 0.22.0 batch-sheet check.',
      published: false,
    })),
  },
};

const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {};

for (const [brand, spec] of Object.entries(PLAN)) {
  const ctx = await request.newContext({ baseURL: spec.base });
  const login = await ctx.post('/api/v1/auth/login', {
    data: { email: 'gojo@forjio.com', password: env.GOJO_HUUDIS_PASSWORD },
    headers: { 'Idempotency-Key': `seed-${brand}-login` },
  });
  if (!login.ok()) {
    console.log(`${brand} login ${login.status()}`);
    await ctx.dispose();
    continue;
  }

  if (MODE === 'seed') {
    const ids = [];
    for (const [i, body] of spec.bodies.entries()) {
      const res = await ctx.post(spec.path, {
        data: body,
        headers: { 'Idempotency-Key': `seed-${brand}-${i}-${body.name ?? body.authorName}` },
      });
      if (!res.ok()) {
        console.log(`${brand} create ${res.status()} ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      ids.push(spec.pick(await res.json()));
    }
    store[brand] = ids;
    console.log(`${brand} seeded ${ids.length}: ${ids.join(', ')}`);
  } else {
    const ids = store[brand] ?? [];
    for (const id of ids) {
      const res = await ctx.delete(`${spec.path}/${id}`, {
        headers: { 'Idempotency-Key': `clean-${brand}-${id}` },
      });
      console.log(`${brand} delete ${id} -> ${res.status()}`);
    }
    // Verify BY ID that they are gone, rather than trusting the status.
    const left = await ctx.get(spec.path);
    const body = await left.text();
    const survivors = ids.filter((id) => body.includes(id));
    console.log(`${brand} survivors: ${survivors.length ? survivors.join(', ') : 'none'}`);
    store[brand] = survivors;
  }
  await ctx.dispose();
}

writeFileSync(STORE, JSON.stringify(store, null, 2));
console.log('store ->', STORE);
