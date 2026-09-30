// What counts as a product feature (the routes SDKs, CLI, docs and Catent cover):
// everything but sign-in, the platform operator's admin routes, plumbing between the
// services and the product's own BFF, and webhooks another system sends in.
const NOT_A_FEATURE = /\/(admin|admin-portal|auth|oauth|oidc|login|logout|signup|register|password|device|jwks|\.well-known|internal|catentio|huudis|img-proxy|proxy|hello|health|healthz|readyz|status|version|console|session)(\/|$)/;
const WEBHOOK_IN = /\/webhooks?(\/(?!endpoints)[^/]+)?$|\/webhook\//;

export function isFeature(method, path) {
  if (path.includes('*') || NOT_A_FEATURE.test(path)) return false;
  if (method.toLowerCase() === 'post' && WEBHOOK_IN.test(path)) return false;
  return true;
}
