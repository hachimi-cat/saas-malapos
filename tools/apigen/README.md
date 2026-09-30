# apigen — one API spec per product, made from its own code

`spec.mjs` writes `openapi.json` for a product backend from its own source: every Express
route (from Express's route table), the zod schema each route validates (body/query),
the fields a handler reads when nothing validates them, the route's guards and source
line. Nothing is written by hand, so the spec cannot fall behind the code; SDKs, CLI,
docs and Catent's tools are generated from it.

    cd <product>/backend
    node --import tsx ../../forjio-service-template/tools/apigen/spec.mjs --out openapi.json

The product loads with the network stopped (fetch and sockets throw). A copy of `src/` is
loaded in which each file also hands its top-level values to a registry, so every zod
schema and router is reachable as a real object; the copy is removed afterwards.
