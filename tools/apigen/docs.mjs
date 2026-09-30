// apigen docs — the API reference of a product, one page per area, from its openapi.json.
//
//   node <apigen>/docs.mjs --spec backend/openapi.json --out copy/docs/api/reference \
//        --nav frontend/src/lib/docs-reference.generated.ts --brand ripllo
//
// Every feature route gets its section: method + path, what it does (from the code's own
// comment), its path/query parameters and body fields (type, required, allowed values,
// default), and a request example. Sign-in, platform-admin, service plumbing and incoming
// webhooks are left to the hand-written guides. The pages are regenerated from the spec,
// so the reference cannot fall behind the code; `--check` exits 1 when they are stale.
import fs from 'node:fs';
import path from 'node:path';
import { isFeature } from './common.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? true]] : acc), []),
);
const spec = JSON.parse(fs.readFileSync(args.spec ?? 'backend/openapi.json', 'utf8'));
const OUT = args.out ?? 'copy/docs/api/reference';
const NAV = args.nav ?? null;
const BRAND = args.brand ?? spec.info?.title ?? 'product';
const CHECK = args.check === true || args.check === 'true';
const BASE = (args['base-url'] ?? `https://${BRAND}.forjio.com`).replace(/\/$/, '');
const AUTH = args['auth-header'] ?? 'Authorization: <your API key>';

const human = (s) => s.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
function typeOf(schema) {
  if (!schema || typeof schema !== 'object') return 'any';
  if (schema.enum) return schema.enum.map((v) => `\`${v}\``).join(' or ');
  if (schema.anyOf || schema.oneOf) return (schema.anyOf ?? schema.oneOf).map(typeOf).join(' or ');
  const t = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
  if (t === 'array') return `array of ${typeOf(schema.items)}`;
  if (schema.format) return `${t} (${schema.format})`;
  return t ?? (schema.properties ? 'object' : 'any');
}
function notes(schema, extra = []) {
  const out = [...extra];
  if (!schema) return out.join('; ');
  if (schema.description) out.push(schema.description);
  if (schema.default !== undefined) out.push(`default \`${JSON.stringify(schema.default)}\``);
  if (schema.minimum !== undefined && schema.exclusiveMinimum !== true) out.push(`min ${schema.minimum}`);
  if (schema.exclusiveMinimum !== undefined) out.push(schema.exclusiveMinimum === true ? `above ${schema.minimum}` : `above ${schema.exclusiveMinimum}`);
  if (schema.maximum !== undefined) out.push(`max ${schema.maximum}`);
  if (schema.minLength !== undefined) out.push(`min length ${schema.minLength}`);
  if (schema.maxLength !== undefined) out.push(`max length ${schema.maxLength}`);
  if (schema.nullable || (Array.isArray(schema.type) && schema.type.includes('null'))) out.push('may be null');
  return out.join('; ');
}
function example(schema, depth = 0) {
  if (!schema || depth > 3) return null;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== 'null') : schema.type;
  if (t === 'object' || schema.properties) {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      if ((schema.required ?? []).includes(k) || depth === 0) out[k] = example(v, depth + 1);
    }
    return out;
  }
  if (t === 'array') return [];
  if (t === 'integer' || t === 'number') {
    if (schema.exclusiveMinimum === true) return (schema.minimum ?? 0) + 1;
    if (typeof schema.exclusiveMinimum === 'number') return schema.exclusiveMinimum + 1;
    return schema.minimum ?? 1;
  }
  if (t === 'boolean') return false;
  if (t === 'string') return schema.format === 'date-time' ? '2026-01-01T00:00:00Z' : '…';
  return null;
}

const pages = new Map(); // tag -> [{method, path, op}]
for (const [p, item] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(item)) {
    if (!isFeature(method, p, op)) continue;
    const tag = (op.tags ?? ['root'])[0];
    if (!pages.has(tag)) pages.set(tag, []);
    pages.get(tag).push({ method, path: p, op });
  }
}

const files = new Map();
const nav = [];
const index = [`---\ntitle: API reference\n---\n\n# API reference\n\nEvery ${human(BRAND)} feature, route by route, generated from the product's own code (the routes it serves and the inputs it checks). Each page lists an area's routes with their parameters and body fields.\n\n| Area | Routes |\n|---|---|`];
for (const [tag, ops] of [...pages.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  ops.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const slug = tag.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  // Heading ids come from the docs renderer: slugify(heading text), numbered from the
  // second use of the same slug on the page (h2 and h3 alike), so links use the same rule.
  const seen = new Map();
  const idFor = (text) => {
    const base = text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
  const sections = [];
  const rows = [];
  for (const o of ops) {
    const op = o.op;
    const heading = cell(op.summary || `${o.method.toUpperCase()} ${o.path}`);
    rows.push(`| \`${o.method.toUpperCase()}\` | \`${o.path}\` | [${heading}](#${idFor(heading)}) |`);
    sections.push('', `## ${heading}`, '', '```', `${o.method.toUpperCase()} ${o.path}`, '```');
    if (op.description && op.description !== op.summary) sections.push('', op.description.trim());
    const params = op.parameters ?? [];
    for (const where of ['path', 'query']) {
      const ps = params.filter((x) => x.in === where);
      if (!ps.length) continue;
      const h3 = where === 'path' ? 'Path parameters' : 'Query parameters';
      idFor(h3);
      sections.push('', `### ${h3}`, '', '| Name | Type | Required | Notes |', '|---|---|---|---|');
      for (const x of ps) sections.push(`| \`${x.name}\` | ${cell(typeOf(x.schema))} | ${x.required ? 'yes' : 'no'} | ${cell(notes(x.schema))} |`);
    }
    const body = op.requestBody?.content?.['application/json']?.schema;
    if (body && body.properties && Object.keys(body.properties).length) {
      const req = new Set(body.required ?? []);
      idFor('Body');
      sections.push('', '### Body', '', '| Field | Type | Required | Notes |', '|---|---|---|---|');
      for (const [k, v] of Object.entries(body.properties)) sections.push(`| \`${k}\` | ${cell(typeOf(v))} | ${req.has(k) ? 'yes' : 'no'} | ${cell(notes(v))} |`);
    }
    const ex = body && body.properties && Object.keys(body.properties).length ? example(body) : null;
    const url = `${BASE}${o.path.replace(/\{(\w+)\}/g, ':$1')}`;
    idFor('Example');
    sections.push('', '### Example', '', '```bash', `curl -X ${o.method.toUpperCase()} "${url}" \\`, `  -H "${AUTH}"` + (ex ? ' \\' : ''));
    if (ex) sections.push('  -H "Content-Type: application/json" \\', `  -d '${JSON.stringify(ex)}'`);
    sections.push('```');
  }
  const lines = [`---\ntitle: ${human(tag)} — reference\n---\n\n# ${human(tag)}\n\nGenerated from ${human(BRAND)}'s own code: every route in this area, what it takes and how to call it.\n\n| Method | Path | What it does |\n|---|---|---|`, ...rows, ...sections];
  files.set(path.join(OUT, `${slug}.md`), lines.join('\n') + '\n');
  nav.push({ slug: `api/reference/${slug}`, title: human(tag), group: 'API reference (every route)', href: `/docs/api/reference/${slug}` });
  index.push(`| [${human(tag)}](/docs/api/reference/${slug}) | ${ops.length} |`);
}
files.set(path.join(OUT, 'index.md'), index.join('\n') + '\n');
nav.unshift({ slug: 'api/reference', title: 'All routes', group: 'API reference (every route)', href: '/docs/api/reference' });
if (NAV) {
  files.set(
    NAV,
    `// Generated by apigen docs from backend/openapi.json — do not edit by hand.\nimport type { DocMeta } from './markdown';\n\nexport const REFERENCE_NAV: DocMeta[] = ${JSON.stringify(nav, null, 2)};\n`,
  );
}

let stale = 0;
for (const [f, text] of files) {
  const current = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (current === text) continue;
  stale++;
  if (!CHECK) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}
if (!CHECK && fs.existsSync(OUT)) {
  for (const f of fs.readdirSync(OUT)) if (!files.has(path.join(OUT, f))) fs.rmSync(path.join(OUT, f));
}
const routes = [...pages.values()].reduce((n, x) => n + x.length, 0);
console.log(`apigen docs: ${routes} routes on ${pages.size} pages${CHECK ? (stale ? ` — ${stale} file(s) stale` : ' — up to date') : ` → ${OUT}`}`);
process.exit(CHECK && stale ? 1 : 0);
