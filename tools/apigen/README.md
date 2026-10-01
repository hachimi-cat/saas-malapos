# apigen — one API spec per product, made from its own code

`spec.mjs` writes `openapi.json` for a product backend from its own source: every Express
route (from Express's route table), the zod schema each route validates (body/query),
the fields a handler reads when nothing validates them, the route's guards and source
line. Nothing is written by hand, so the spec cannot fall behind the code; SDKs, CLI,
docs and Catent's tools are generated from it.

    cd <product>/backend
    node --import tsx ../../forjio-service-template/tools/apigen/spec.mjs --out openapi.json

A query field a handler reads without a schema is optional, unless the handler refuses
the request without it (`if (!req.query.q) return …400…`, or the same test on the local
it was read into): then it is required, in the docs, SDKs and CLI alike.

The product loads with the network stopped (fetch and sockets throw). A copy of `src/` is
loaded in which each file also hands its top-level values to a registry, so every zod
schema and router is reachable as a real object; the copy is removed afterwards.

A file upload through multer — `upload.single('file')`, `.array('photos')` or
`.fields([{ name: … }])` among the route's middleware, `upload` a multer instance — is a
`multipart/form-data` body: the file fields (`format: binary`; `single`'s is required
unless the handler reads `req.file?.…`) and the text fields the handler reads. When the file
is optional and the handler also reads a body, the route keeps its JSON body too (listed
first, so the SDKs and CLI keep calling it with JSON) and the form is the alternative.

A Next.js app's route handlers get the same from `spec-next.mjs` (statically, from the
TypeScript). `--internal <regex>` marks routes the product calls itself (a proxy's auth
check, a diagnostics beacon) as `x-forjio.internal`: they stay in the spec but leave the
docs, CLI, SDKs and Catent's tools.

What counts as a feature is one function, `isFeature` in `common.mjs`: not sign-in, the
operator's admin routes (`/admin`, `/<x>-admin`, operator-only guards), plumbing and BFF
proxies, cron calls, unsubscribe pages, a webhook another system sends in, or a route
marked internal.

## SDKs — `sdk.mjs`

    node tools/apigen/sdk.mjs --lang python --spec backend/openapi.json --out sdk/python/<pkg>/api_generated.py
    node tools/apigen/sdk.mjs --lang node   --spec backend/openapi.json --out sdk/node/src/api.generated.ts
    node tools/apigen/sdk.mjs --lang go --package <pkg> --spec backend/openapi.json --out sdk/go/api_generated.go

One method per feature route: `client.api.<area>_<action>(…)` (python),
`client.api.<area><Action>(…)` (node), `client.API.<Area><Action>(ctx, …)` (go). Two routes of an area with the same
action are told apart by their verb: `PATCH /config` is `update_config` next to `GET
/config`'s `config`, and `GET /groups/{id}` is `get_groups` next to the list, `GET /groups`
(a name still taken gets a number). Names a route had before the second rule (`groups_2`)
stay, as deprecated aliases of the new ones. Add
`--check` to verify instead of write (a text comparison; the Go file is written
gofmt-clean, so checking it needs no Go toolchain).

The generated file only calls a hook each SDK's client writes once, in its own code, so
the generated surface signs requests and reads responses exactly like the rest of that
SDK:

- python: `_apigen_request(method, path, *, query, body)` returning the envelope's data;
- node: `apigenRequest(method, path, query, body)` returning the envelope's data;
- go: `apigenRequest(ctx, method, path string, query url.Values, body map[string]any)
  (json.RawMessage, error)` — `query` nil or the query string, `body` nil (no body) or the
  JSON body — returning the envelope's `data`. The client sets `API: &GeneratedAPI{c: c}`
  in its constructor.

Go specifics: names are Go-cased with golint initialisms (`APIKeysCreate`,
`ContactIDs`); each route with inputs takes an `*<Method>Args` (nil for none) whose query
fields are tagged `query:"…"` and body fields `json:"…"`. Required fields are plain values,
optional ones pointers (`Ptr(v)`), slices or maps that nil leaves out. `Body map[string]any`
passes the whole body (python's `json_body`); the fields that are set replace its keys. A
required body string, slice or map that is neither set nor in `Body` is an error before
any request; a required number or boolean is sent as given. A body that is one of several
shapes (anyOf / oneOf) offers every shape's fields, all optional.

## CLI — `cli.mjs`

    node tools/apigen/cli.mjs --spec backend/openapi.json --out cli/src/commands/api.generated.ts \
      [--reserved mode,account,quiet]

One command per feature route: `<brand> api <area> <action> [path params…] [--<field> value …]`,
with `--body-json` for the whole body. The call goes through the product's
`cli/src/lib/apigen-call.ts` (`callRoute`, and `callForm` for a file upload, whose file
fields are paths). A field whose flag would clash with an option the command already has
(`--help`, `--json`, `--profile`, `--on-behalf-of`, …) is given as `--field-<name>`;
`--reserved a,b,c` adds the product CLI's own global options to that list, so e.g. a
`mode` body field is `--field-mode` and the global `--mode` keeps working. Actions are
named as in the SDKs (`get-groups` next to `groups`); an old name (`groups-2`) still
works, hidden from help. Add `--check`
to verify instead of write.

## Docs — `docs.mjs`

    node tools/apigen/docs.mjs --spec backend/openapi.json --out copy/docs/api/reference \
      --nav frontend/src/lib/docs-reference.generated.ts --brand <brand> --base-url https://<brand>.com \
      --auth-header "Authorization: Bearer <your API key>" [--auth-file <rules.json>]

One page per area, every feature route with its parameters, body fields and a curl
example that carries `--auth-header`. When some routes authenticate differently — an
app-to-app surface on client credentials, routes that also take a signing key, routes
only a signed-in person may call — pass `--auth-file`, a JSON file of rules:

    { "rules": [
      { "prefix": "/api/v1/app/", "header": "Authorization: Basic <base64 of client_id:client_secret>",
        "note": "Your app's OIDC client credentials." },
      { "route": "GET /api/v1/iam/users", "note": "Also takes an access key." } ] }

A rule matches a route by `route` (`<METHOD> <path>`, the spec's `{param}` spelling) or
by path `prefix`. The example uses the `header` of the first matching rule that has one;
the section prints every matching rule's `note` under **Authentication**. Products
generate the file from their own code (e.g. the table that decides which routes a key may
call), so the docs follow the code like everything else here.
