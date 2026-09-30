// What counts as a product feature (the routes SDKs, CLI, docs and Catent cover):
// every route a customer or their program calls — not sign-in, the platform operator's
// admin routes, plumbing between the services and the product's own BFF, a CORS
// preflight, or a webhook another system sends in.
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const NOT_A_FEATURE = /\/(admin|admin-portal|auth|[a-z]+-auth|oauth|oidc|login|logout|signup|register|password|device|jwks|\.well-known|internal|catentio|huudis|img-proxy|proxy|hello|health|healthz|readyz|console|session)(\/|$)/;
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
  if (WEBHOOK.test(path)) {
    const guards = op?.['x-forjio']?.guards ?? null;
    if (guards === null) return !/^post$/i.test(method) || /\/webhooks?\/?(endpoints|subscriptions)?\/?$/.test(path);
    return guards.some((g) => SIGNED_IN.test(g));
  }
  return true;
}
