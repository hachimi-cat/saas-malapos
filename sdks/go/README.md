# malapos-go

Go SDK for the [Malapos](https://malapos.com) point-of-sale REST API. Sister to
`@forjio/malapos` (JS) and `forjio-malapos` (Python).

```bash
go get github.com/hachimi-cat/malapos-go@latest
```

Go 1.22+, standard library only.

## Auth

`Authorization: Bearer <token>` — an `sk_live_…` API key (dashboard → **API keys**; it
acts in the workspace it was created in) or a Huudis-issued access token.
`Config.Token` or `MALAPOS_TOKEN`; `MALAPOS_BASE_URL` overrides `https://malapos.com`.

## Every route: `client.API`

`client.API` has one method per Malapos API route, generated from the API spec: path
parameters as arguments, then an `*<Method>Args` with the query and body fields
(optional fields are pointers — `malapos.Ptr(v)`; `Body` passes the whole JSON body, for
routes whose fields the spec does not know). Each returns the response's `data` as
`json.RawMessage`, or an `*malapos.Error` with the API's error code, status and request id.

```go
import malapos "github.com/hachimi-cat/malapos-go"

c := malapos.New(malapos.Config{Token: os.Getenv("MALAPOS_TOKEN")})
products, err := c.API.ProductsList(ctx, &malapos.ProductsListArgs{Q: "kopi"})
_, err = c.API.SalesVoid(ctx, saleID, &malapos.SalesVoidArgs{Reason: malapos.Ptr("wrong item")})
```

List routes that page put `cursor` and `hasMore` in the envelope's meta: call
`c.DoEnvelope(ctx, "GET", path, query, nil)` to read them, and pass the cursor as the
route's `cursor` query field. `c.Do` calls any path.

The request and response fields of every route: <https://malapos.com/docs/api/reference>.
