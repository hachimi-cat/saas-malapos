// What counts as a product feature (the routes SDKs, CLI, docs and Catent cover):
// every route a customer or their program calls — not sign-in, the platform operator's
// admin routes, plumbing between the services and the product's own BFF, a CORS
// preflight, a scheduler's cron call, an email's unsubscribe page, or a webhook another
// system sends in.
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const NOT_A_FEATURE = /\/(admin|admin-portal|[a-z]+-admin|auth|[a-z]+-auth|oauth|oidc|login|logout|signup|register|password|device|jwks|\.well-known|internal|catentio|huudis|img-proxy|proxy|hello|health|healthz|readyz|console|session|cron|unsubscribe)(\/|$)/;
// A route under /webhooks that no sign-in guards is one another system calls in
// (plugipay, github, telegram, …). Managing your own webhook endpoints is a feature.
const WEBHOOK = /\/webhooks?(\/|$)/;
const SIGNED_IN = /auth|Auth|session|Session|guard|Guard|hmac|Hmac|apiKey|ApiKey|Workspace|jwt|Jwt/;
// Guards only the platform operator, a test harness or the product's own runner program
// pass: Huudis's /ops console, Ripllo's platform sweeps, Storlaunch's e2e helpers,
// Depllo's runner protocol.
const NOT_FOR_CUSTOMERS = /^(requireForjioOps|requirePlatformAdmin|requireE2EBypass|runnerAuth)$/;
// Under a sign-in prefix, but a customer feature: registering your own OIDC apps.
const FEATURE_ANYWAY = /\/oidc\/clients(\/|$)/;

export function isFeature(method, path, op = null) {
  if (!VERBS.has(String(method).toLowerCase())) return false;
  if (path.includes('*') || (NOT_A_FEATURE.test(path) && !FEATURE_ANYWAY.test(path))) return false;
  if ((op?.['x-forjio']?.guards ?? []).some((g) => NOT_FOR_CUSTOMERS.test(g))) return false;
  // a route the product itself marks internal (apigen.sh --internal: e.g. Pawpado's nginx
  // auth check and its stream page's diagnostics call)
  if (op?.['x-forjio']?.internal) return false;
  if (WEBHOOK.test(path)) {
    const guards = op?.['x-forjio']?.guards ?? null;
    if (guards === null) return !/^post$/i.test(method) || /\/webhooks?\/?(endpoints|subscriptions)?\/?$/.test(path);
    return guards.some((g) => SIGNED_IN.test(g));
  }
  return true;
}

// A route whose body is a multipart form (a file upload) rather than JSON: the form's
// schema, else null. Its fields are form fields; a file field (isFileField) carries bytes.
export function formBody(op) {
  const content = op?.requestBody?.content ?? {};
  if (content['application/json']) return null;
  const schema = content['multipart/form-data']?.schema;
  return schema && schema.properties ? schema : null;
}
export const isFileField = (schema) =>
  !!schema && (schema.type === 'string' || schema.type === undefined) && (schema.format === 'binary' || schema.contentMediaType !== undefined);

// The fields of a JSON body schema: { properties, required }, or null when the spec does not
// know them. An anyOf / oneOf body (one of several shapes) offers every variant's fields,
// each optional; an allOf body, all of its parts' fields.
export function bodyFields(schema) {
  if (!schema) return null;
  if (schema.properties) return { properties: schema.properties, required: schema.required ?? [] };
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    const properties = {};
    for (const v of variants.map(bodyFields).filter(Boolean)) {
      for (const [k, s] of Object.entries(v.properties)) {
        const prev = properties[k];
        if (prev?.enum && s.enum) properties[k] = { ...prev, enum: [...new Set([...prev.enum, ...s.enum])] };
        else if (!prev) properties[k] = s;
      }
    }
    return Object.keys(properties).length ? { properties, required: [] } : null;
  }
  if (schema.allOf) {
    const parts = schema.allOf.map(bodyFields).filter(Boolean);
    return parts.length ? { properties: Object.assign({}, ...parts.map((x) => x.properties)), required: parts.flatMap((x) => x.required) } : null;
  }
  return null;
}
