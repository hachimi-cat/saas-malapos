# forjio-malapos

Python SDK for the [Malapos](https://malapos.com) point-of-sale REST API. Sister to
`@forjio/malapos` (JS) and `github.com/hachimi-cat/malapos-go` (Go).

```bash
pip install forjio-malapos
```

Python 3.10+, `httpx`.

## Auth

`Authorization: Bearer <token>` — an `sk_live_…` API key (dashboard → **API keys**; it
acts in the workspace it was created in) or a Huudis-issued access token. Pass `token=`
or set `MALAPOS_TOKEN`; `MALAPOS_BASE_URL` overrides `https://malapos.com`.

## Every route: `client.api`

`client.api` has one method per Malapos API route, generated from the API spec:
`client.api.<area>_<action>(path params…, *, query and body fields…)`. A body the spec
knows no fields of takes `json_body=`; `json_body=` also passes a whole body on any
route (the keyword fields override it).

```python
from forjio_malapos import MalaposClient, MalaposError

client = MalaposClient(token="sk_live_…")

products = client.api.products_list(q="kopi")
client.api.products_create(name="Kopi susu", kind="GOODS", variants=[{"name": "Default", "price": 18000}])
client.api.sales_void("txn_…", reason="wrong item")

try:
    client.api.sales_get("nope")
except MalaposError as e:
    print(e.status, e.code, e.message, e.request_id)
```

Each call returns the envelope's `data`. A list route that pages returns a `Page` — a
`list` with `.cursor` and `.has_more`; pass `cursor=page.cursor` for the next page.
`client.request(method, path, query=, body=)` calls any path; `client.request_envelope(...)`
returns the whole `{data, error, meta}`.

The request and response fields of every route: <https://malapos.com/docs/api/reference>.
