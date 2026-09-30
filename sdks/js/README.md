# @forjio/malapos

TypeScript/JavaScript SDK for the [Malapos](https://malapos.com) point-of-sale REST API.
Sister to `forjio-malapos` (Python) and `github.com/hachimi-cat/malapos-go` (Go).

```bash
npm install @forjio/malapos
```

Node 20+ (uses the global `fetch`); ESM and CommonJS builds.

## Auth

`Authorization: Bearer <token>` — an `sk_live_…` API key (dashboard → **API keys**; it
acts in the workspace it was created in) or a Huudis-issued access token. Pass `token` or
set `MALAPOS_TOKEN`; `MALAPOS_BASE_URL` overrides `https://malapos.com`.

## Every route: `client.api`

`client.api` has one method per Malapos API route, generated from the API spec:
`client.api.<area><Action>(path params…, { query and body fields })`. Any body field the
spec does not list can be passed too.

```ts
import { MalaposClient, MalaposError, type Page } from '@forjio/malapos';

const client = new MalaposClient({ token: process.env.MALAPOS_TOKEN });

const products = await client.api.productsList({ q: 'kopi' });
await client.api.productsCreate({ name: 'Kopi susu', kind: 'GOODS', variants: [{ name: 'Default', price: 18000 }] });
await client.api.salesVoid('txn_…', { reason: 'wrong item' });

try {
  await client.api.salesGet('nope');
} catch (e) {
  if (e instanceof MalaposError) console.log(e.status, e.code, e.message, e.requestId);
}
```

Each call returns the envelope's `data`. A list route that pages returns its array with
`cursor` and `hasMore` on it (`Page<T>`); pass `{ cursor: page.cursor }` for the next
page. `client.request(method, path, { query, body })` calls any path;
`client.requestEnvelope(...)` returns the whole `{ data, error, meta }`.

The request and response fields of every route: <https://malapos.com/docs/api/reference>.
