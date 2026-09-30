// apigen spec — one OpenAPI document for a Forjio product, made from its own code.
//
// Run from the product's backend folder (its node_modules provide typescript + tsx):
//   node --import tsx <apigen>/spec.mjs [--out openapi.json] [--routes src/routes/index.ts] [--prefix /api/v1]
//
// How it knows every route and its inputs, without anyone writing them down:
//  1. TypeScript reads every source file: each `router.<verb>('/path', ...)` call, the
//     identifiers its middleware and handler use, the file's imports and top-level names.
//  2. A copy of src/ is loaded in which every file also hands its top-level values to a
//     registry, so each zod schema and router is reachable as a real object.
//  3. Express's own route table (walked from the routes entry) gives the full paths; each
//     route is matched to its source call through the router object it belongs to.
//  4. A schema used as `X.parse(req.body)` / `validate(X)` becomes the request body (query
//     for req.query), converted to JSON Schema by zod-to-json-schema.
// The network is stopped while the product loads: nothing is reached.

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CWD = process.cwd();
const requireHere = createRequire(path.join(HERE, 'package.json'));
const requireProduct = createRequire(path.join(CWD, 'package.json'));
const ts = requireProduct('typescript');
const { zodToJsonSchema } = requireHere('zod-to-json-schema');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const OUT = args.out ?? 'openapi.json';
const ROUTES = args.routes ?? 'src/routes/index.ts';
const PREFIX = args.prefix ?? '/api/v1';
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const SRC = path.join(CWD, 'src');
const COPY = path.join(CWD, '.apigen', 'src');

// ── stop the network before anything of the product loads ────────────────────────
globalThis.fetch = async () => { throw new Error('apigen: network stopped'); };
net.Socket.prototype.connect = function () { throw new Error('apigen: network stopped'); };
setTimeout(() => { console.error('apigen: timed out'); process.exit(3); }, 120000).unref?.();

// ── 1. read every source file ──────────────────────────────────────────────────────
function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['__tests__', 'node_modules', '__mocks__'].includes(entry.name)) out.push(...walkFiles(p));
    } else out.push(p);
  }
  return out;
}
const files = walkFiles(SRC).filter((f) => /\.(ts|mts|cts)$/.test(f) && !/\.(test|spec|d)\.ts$/.test(f));
const facts = new Map(); // rel -> { sf, names:Set, imports:Map(local -> {from, name}), calls:[] }

function rel(f) { return path.relative(SRC, f).split(path.sep).join('/'); }
function resolveImport(fromRel, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.join(SRC, path.dirname(fromRel), spec).replace(/\.(js|mjs|cjs)$/, '');
  for (const cand of [base + '.ts', base + '.mts', path.join(base, 'index.ts'), base]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return rel(cand);
  }
  return null;
}
function leading(sf, node) {
  const text = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  return ranges
    .map((r) => text.slice(r.pos, r.end))
    .map((c) => c.replace(/^\/\*\*?|\*\/$/g, '').replace(/^\s*\*\s?/gm, '').replace(/^\s*\/\/\s?/gm, ''))
    .join('\n')
    .trim();
}
function stringValue(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

for (const file of files) {
  const r = rel(file);
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set();
  const imports = new Map();
  const calls = [];
  const functions = new Map(); // top-level function name -> node
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && !(ts.getCombinedModifierFlags(st) & ts.ModifierFlags.Ambient)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          names.add(d.name.text);
          if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) functions.set(d.name.text, d.initializer);
        }
      }
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name && st.body !== undefined) {
      names.add(st.name.text);
      if (ts.isFunctionDeclaration(st)) functions.set(st.name.text, st);
    } else if (ts.isImportDeclaration(st) && st.importClause && !st.importClause.isTypeOnly) {
      const from = resolveImport(r, st.moduleSpecifier.text);
      const clause = st.importClause;
      if (clause.name) imports.set(clause.name.text, { from, name: 'default', spec: st.moduleSpecifier.text });
      const nb = clause.namedBindings;
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          if (!el.isTypeOnly) imports.set(el.name.text, { from, name: (el.propertyName ?? el.name).text, spec: st.moduleSpecifier.text });
        }
      } else if (nb && ts.isNamespaceImport(nb)) imports.set(nb.name.text, { from, name: '*', spec: st.moduleSpecifier.text });
    } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
      // export default router  → nothing new to register
    }
  }
  // every <x>.<verb>('/path', ...) and <x>.route('/path').<verb>(...) call, anywhere in the file
  const visit = (node, fn) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const verb = node.expression.name.text;
      const target = node.expression.expression;
      if (VERBS.has(verb) || verb === 'all') {
        let routerVar = null;
        let routePath = stringValue(node.arguments[0]);
        let handlers = node.arguments.slice(1);
        if (ts.isIdentifier(target)) routerVar = target.text;
        else if (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === 'route') {
          if (ts.isIdentifier(target.expression.expression)) routerVar = target.expression.expression.text;
          routePath = stringValue(target.arguments[0]);
          handlers = node.arguments;
        }
        if (routerVar && routePath !== null) {
          let stmt = node;
          while (stmt.parent && !ts.isExpressionStatement(stmt) && !ts.isSourceFile(stmt.parent)) stmt = stmt.parent;
          calls.push({
            routerVar, verb, routePath, handlers,
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            doc: leading(sf, stmt),
            inFunction: fn,
          });
        }
      }
    }
    const nextFn = ts.isFunctionDeclaration(node) && node.name ? node.name.text : fn;
    ts.forEachChild(node, (child) => visit(child, nextFn));
  };
  visit(sf, null);
  facts.set(r, { sf, names, imports, calls, functions });
}

// ── 2. an instrumented copy: each file hands its top-level values to a registry ──────
fs.rmSync(path.join(CWD, '.apigen'), { recursive: true, force: true });
fs.mkdirSync(COPY, { recursive: true });
for (const file of walkFiles(SRC)) {
  const r = rel(file);
  const dest = path.join(COPY, r);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let text = fs.readFileSync(file, 'utf8');
  const f = facts.get(r);
  if (f && f.names.size) {
    const lines = [...f.names].map((n) => `try { __apigen_r[${JSON.stringify(r + '#' + n)}] = ${n}; } catch {}`);
    text += `\n;const __apigen_r = ((globalThis as any).__apigen ??= {});\n${lines.join('\n')}\n`;
  }
  fs.writeFileSync(dest, text);
}
// a tsconfig for the copy: the product's own, without path aliases (tsx would follow an
// alias to a .d.ts and load nothing)
const tsconfigPath = path.join(CWD, '.apigen', 'tsconfig.json');
fs.writeFileSync(tsconfigPath, JSON.stringify({ extends: path.join(CWD, 'tsconfig.json'), compilerOptions: { paths: {} } }));

// Express 5 (package "router") keeps no mount path on a layer: record it as it is mounted.
try {
  const RouterPkg = requireProduct(requireProduct.resolve('router', { paths: [path.dirname(requireProduct.resolve('express'))] }));
  const use = RouterPkg.prototype.use;
  RouterPkg.prototype.use = function (first, ...rest) {
    const before = this.stack.length;
    const result = use.call(this, first, ...rest);
    for (let i = before; i < this.stack.length; i++) this.stack[i].__mount = typeof first === 'string' ? first : '';
    return result;
  };
} catch { /* express 4 */ }

// ── 3. load the copy and walk Express's route table ───────────────────────────────────
const entry = path.join(COPY, path.relative('src', ROUTES));
const mod = await import(pathToFileURL(entry).href);
let root = mod.default;
if (typeof root === 'function' && !root.stack) root = await root({});
if (root && !root.stack && root.router) root = root.router;
const registry = globalThis.__apigen ?? {};
const whereIs = new Map(); // value -> "file#name"
for (const [key, value] of Object.entries(registry)) if (value && (typeof value === 'object' || typeof value === 'function') && !whereIs.has(value)) whereIs.set(value, key);
const entryRel = path.relative('src', ROUTES).split(path.sep).join('/');

function mountPath(layer) {
  if (typeof layer.__mount === 'string') return layer.__mount === '/' ? '' : layer.__mount;
  const src = layer.regexp && layer.regexp.source;
  if (!src || layer.regexp.fast_slash) return '';
  let m = src.replace('\\/?(?=\\/|$)', '').replace(/^\^/, '').replace(/\$$/, '');
  const keys = (layer.keys || []).map((k) => k.name);
  let i = 0;
  // a parameter in the mount path: `(?:([^\/]+?))`, or `(?:\/([^/]+?))` (path-to-regexp 0.1.12+)
  m = m.replace(/\(\?:(\\\/)?\(\[\^\\?\/]\+\?\)\)/g, (_, slash) => `${slash ? '/' : ''}:${keys[i++] ?? 'param'}`);
  return m.replace(/\\\//g, '/').replace(/\\\./g, '.').replace(/\\-/g, '-');
}
function layerName(layer) {
  const key = whereIs.get(layer.handle);
  return key ? key.split('#')[1] : (layer.name && layer.name !== '<anonymous>' ? layer.name : null);
}
const found = [];
function walk(router, base, guards, routerKey) {
  // guards: [{ name, prefix }] — a middleware mounted at a path guards only the routes under it
  let local = [...guards];
  const guarding = (full) => local.filter((g) => full === g.prefix || full.startsWith(g.prefix.replace(/\/$/, '') + '/') || g.prefix === base || g.prefix === '').map((g) => g.name);
  for (const layer of router.stack || []) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m] && m !== '_all');
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) for (const method of methods) {
        const full = (base + String(p)).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
        found.push({ method, local: String(p), full, routerKey, guards: guarding(full) });
      }
    } else if (layer.handle && layer.handle.stack) {
      const key = whereIs.get(layer.handle) ?? routerKey;
      const prefix = (base + mountPath(layer)).replace(/\/+/g, '/');
      walk(layer.handle, base + mountPath(layer), local.filter((g) => prefix.startsWith(g.prefix.replace(/\/$/, '')) || g.prefix === base), key);
    } else {
      const n = layerName(layer);
      if (n && !['query', 'expressInit', 'jsonParser', 'urlencodedParser', 'rawParser', 'textParser'].includes(n)) {
        local = [...local, { name: n, prefix: (base + mountPath(layer)).replace(/\/+/g, '/') }];
      }
    }
  }
}
walk(root, PREFIX, [], `${entryRel}#default`);
for (const r of found) if (r.guards.some((g) => typeof g !== 'string')) r.guards = r.guards.map((g) => g.name ?? g);

// ── 4. each route's source call, and the schemas it validates ─────────────────────────
function isZod(v) { return v && typeof v === 'object' && v._def && typeof v.safeParse === 'function'; }
function lookup(fileRel, name) {
  const f = facts.get(fileRel);
  if (!f) return undefined;
  if (f.names.has(name)) return registry[`${fileRel}#${name}`];
  const imp = f.imports.get(name);
  if (imp && imp.from) {
    if (imp.name === 'default') {
      const target = facts.get(imp.from);
      // default export of a module: the router or value it exports under some name
      return undefined;
    }
    return lookup(imp.from, imp.name);
  }
  return undefined;
}
function fnNode(fileRel, name, depth = 0) {
  const f = facts.get(fileRel);
  if (!f || depth > 3) return null;
  if (f.functions.has(name)) return { fileRel, node: f.functions.get(name) };
  const imp = f.imports.get(name);
  if (imp && imp.from && imp.name !== '*' && imp.name !== 'default') return fnNode(imp.from, imp.name, depth + 1);
  return null;
}
const PARSE = /\b([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*\((?:[^()]|\([^()]*\))*\))*)\.(?:safeParse|parse|parseAsync|safeParseAsync)\(\s*(?:req|request)\.(body|query|params)\b/g;
const CHAIN = /\.([A-Za-z_$][\w$]*)\(((?:[^()]|\([^()]*\))*)\)/g;
// `schema.partial().safeParse(req.body)`: apply the chain to the real schema. Calls with
// no argument, or `{ a: true, b: true }` (pick/omit), are applied; anything else stops.
function applyChain(schema, chain) {
  let current = schema;
  for (const m of (chain || '').matchAll(CHAIN)) {
    const [, method, argText] = m;
    if (typeof current[method] !== 'function') break;
    const text = argText.trim();
    try {
      if (!text) current = current[method]();
      else if (/^\{(\s*[A-Za-z_$][\w$]*\s*:\s*true\s*,?)+\s*\}$/.test(text)) {
        current = current[method](Object.fromEntries([...text.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((k) => [k[1], true])));
      } else break;
    } catch { break; }
  }
  return current;
}
const VALIDATE = /\b(validate\w*|zValidator|withBody|withQuery|parseBody|parseQuery|bodySchema|querySchema)\(\s*(?:['"](\w+)['"]\s*,\s*)?([A-Za-z_$][\w$]*)/g;

function schemasIn(fileRel, node, sink, depth = 0) {
  const text = node.getText();
  for (const m of text.matchAll(PARSE)) {
    const v = lookup(fileRel, m[1]);
    if (isZod(v)) sink[m[3]] ??= { schema: applyChain(v, m[2]), name: m[1] + (m[2] || '') };
  }
  // what the handler reads from the query when nothing validates it
  for (const m of text.matchAll(/\breq\.query\??\.([A-Za-z_$][\w$]*)|\breq\.query\??\[\s*['"]([^'"]+)['"]\s*\]/g)) {
    (sink.queryFields ??= new Set()).add(m[1] ?? m[2]);
  }
  for (const alias of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(?\s*)?req\.query\b/g)) {
    const re = new RegExp(`\\b${alias[1]}\\??\\.([A-Za-z_$][\\w$]*)|\\b${alias[1]}\\[\\s*['"]([^'"]+)['"]\\s*\\]`, 'g');
    for (const m of text.matchAll(re)) (sink.queryFields ??= new Set()).add(m[1] ?? m[2]);
  }
  for (const m of text.matchAll(/\{([^{}=]*)\}\s*=\s*(?:req\.query|\(req\.query)/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':')[0].split('=')[0].replace('...', '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) (sink.queryFields ??= new Set()).add(name);
    }
  }
  // what the handler reads from the body when nothing validates it
  if (/\breq\.body\b/.test(text)) {
    sink.readsBody = true;
    const fields = (sink.bodyFields ??= new Set());
    for (const m of text.matchAll(/\breq\.body\??\.([A-Za-z_$][\w$]*)/g)) fields.add(m[1]);
    for (const m of text.matchAll(/\{([^{}=]*)\}\s*=\s*(?:req\.body|\(req\.body)/g)) {
      for (const part of m[1].split(',')) {
        const name = part.split(':')[0].split('=')[0].replace('...', '').trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) fields.add(name);
      }
    }
    for (const m of text.matchAll(/req\.body\s+as\s+\{([^{}]*)\}/g)) {
      for (const part of m[1].split(/[;,\n]/)) {
        const f = part.match(/^\s*([A-Za-z_$][\w$]*)\??\s*:/);
        if (f) fields.add(f[1]);
      }
    }
  }
  for (const m of text.matchAll(VALIDATE)) {
    const v = lookup(fileRel, m[3]);
    if (!isZod(v)) continue;
    const hint = `${m[1]} ${m[2] ?? ''}`.toLowerCase();
    const role = hint.includes('query') ? 'query' : hint.includes('param') ? 'params' : 'body';
    sink[role] ??= { schema: v, name: m[3] };
  }
  // handlers written elsewhere: follow a named function one or two files deep
  if (depth < 2) {
    const ids = new Set();
    const collect = (n) => { if (ts.isIdentifier(n)) ids.add(n.text); ts.forEachChild(n, collect); };
    collect(node);
    for (const id of ids) {
      const target = fnNode(fileRel, id);
      if (target && target.node !== node) schemasIn(target.fileRel, target.node, sink, depth + 1);
    }
  }
}

// A plain title for a route whose code carries no comment: "Create a discount code".
const IRREGULAR = { people: 'person', addresses: 'address', statuses: 'status', analyses: 'analysis', indices: 'index', aliases: 'alias', media: 'media', series: 'series', news: 'news' };
function singular(word) {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(ss|x|z|ch|sh)es$/.test(word)) return word.replace(/es$/, '');
  return word.replace(/s$/, '');
}
const words = (seg) => seg.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
function title(method, full) {
  const parts = full.replace(PREFIX, '').split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const isParam = (x) => x.startsWith(':');
  const nouns = parts.filter((x) => !isParam(x));
  const noun = nouns[nouns.length - 1] ?? 'item';
  const parent = nouns.length > 1 ? nouns[nouns.length - 2] : null;
  const a = (w) => (/^[aeiou]/.test(w) ? 'an' : 'a');
  if (isParam(last)) {
    const one = words(singular(noun));
    return { get: `Get ${a(one)} ${one}`, patch: `Update ${a(one)} ${one}`, put: `Replace ${a(one)} ${one}`, delete: `Delete ${a(one)} ${one}`, post: `Act on ${a(one)} ${one}` }[method];
  }
  // /things/:id/archive — an action on one thing
  if (parts.length >= 3 && isParam(parts[parts.length - 2]) && method !== 'get') {
    const one = words(singular(parent ?? noun));
    return `${words(noun).replace(/^./, (c) => c.toUpperCase())} ${a(one)} ${one}`;
  }
  const many = words(noun);
  return { get: `List ${many}`, post: `Create ${a(words(singular(noun)))} ${words(singular(noun))}`, patch: `Update ${many}`, put: `Set ${many}`, delete: `Delete ${many}` }[method];
}
// A comment above a route that is only a section divider ("─── Merchant CRUD ───") says
// nothing about the route.
function usefulDoc(doc) {
  const kept = doc.split('\n').filter((line) => !/^[\s─—\-=*#/|]*$/.test(line) && !/^\s*(─|—|-{2,}|={2,})/.test(line) && !/──/.test(line));
  return kept.join('\n').trim();
}

const pathItems = {};
let matched = 0;
let withBody = 0;
let needsBody = 0;
let withFields = 0;
for (const route of found) {
  let [fileRel, varName] = route.routerKey.split('#');
  let f = facts.get(fileRel);
  let call = f?.calls.find((c) => c.verb === route.method && c.routePath === route.local && (c.routerVar === varName || varName === 'default'))
    ?? f?.calls.find((c) => c.verb === route.method && c.routePath === route.local);
  if (!call) {
    // Routers made inside a function (`const r = Router()` in secretsRouter()) are no
    // top-level value: find the call in any file, and when several files register the
    // same local path, prefer the one whose name matches the mount (/secrets → secrets.ts).
    const hits = [];
    for (const [r, facts2] of facts) for (const c of facts2.calls) if (c.verb === route.method && c.routePath === route.local) hits.push([r, c]);
    const segments = route.full.replace(PREFIX, '').split('/').filter((x) => x && !x.startsWith(':'));
    const score = ([r]) => segments.reduce((n, seg) => n + (r.toLowerCase().includes(seg.toLowerCase().replace(/s$/, '')) ? 1 : 0), 0);
    hits.sort((a, b) => score(b) - score(a));
    if (hits.length === 1 || (hits.length > 1 && score(hits[0]) > score(hits[1]))) {
      [fileRel, call] = hits[0];
      f = facts.get(fileRel);
    }
  }
  const sink = {};
  const guards = [...route.guards];
  let doc = '';
  let source = null;
  if (call) {
    matched++;
    for (const h of call.handlers) schemasIn(fileRel, h, sink);
    for (const h of call.handlers.slice(0, -1)) {
      const t = h.getText();
      const n = t.match(/^[A-Za-z_$][\w$.]*/);
      if (n) guards.push(n[0]);
    }
    doc = usefulDoc(call.doc);
    source = `src/${fileRel}:${call.line}`;
  }
  const oaPath = route.full.replace(/:([A-Za-z_][A-Za-z0-9_]*)\??/g, '{$1}');
  const params = [...route.full.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
  const op = {
    operationId: `${route.method}${oaPath.replace(PREFIX, '').replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))}`,
    summary: (doc.split(/\n\s*\n|(?<!\b(?:e\.g|i\.e|etc|vs|approx))(?<=\.)\s+(?=[A-Z])/)[0] || '').replace(/^(GET|POST|PUT|PATCH|DELETE)\s+\S+\s*[—-]\s*/i, '').replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()).slice(0, 200) || title(route.method, route.full),
    description: doc ? doc.slice(0, 2000) : undefined,
    tags: [oaPath.replace(PREFIX, '').split('/').filter(Boolean)[0] ?? 'root'],
    parameters: params,
    'x-forjio': { source, guards: [...new Set(guards)] },
  };
  const takesBody = ['post', 'put', 'patch', 'delete'].includes(route.method);
  const bodySchema = takesBody && sink.body ? zodToJsonSchema(sink.body.schema, { target: 'openApi3', $refStrategy: 'none' }) : null;
  // A field read from the query or else the body (`req.query.x ?? req.body.x`) is given
  // once: in the body, when the route takes one.
  const bodyNames = new Set(bodySchema ? Object.keys(bodySchema.properties ?? {}) : takesBody && sink.readsBody ? [...(sink.bodyFields ?? [])] : []);
  if (sink.query) {
    const q = zodToJsonSchema(sink.query.schema, { target: 'openApi3', $refStrategy: 'none' });
    for (const [name, schema] of Object.entries(q.properties ?? {})) {
      op.parameters.push({ name, in: 'query', required: (q.required ?? []).includes(name), schema });
    }
  }
  if (!sink.query && sink.queryFields) {
    for (const name of [...sink.queryFields].sort()) {
      if (!op.parameters.some((x) => x.name === name) && !bodyNames.has(name)) op.parameters.push({ name, in: 'query', required: false, schema: {} });
    }
  }
  if (takesBody) {
    if (sink.body) {
      needsBody++;
      withBody++;
      op.requestBody = { required: true, content: { 'application/json': { schema: bodySchema } } };
      op['x-forjio'].body = 'validated';
      op['x-forjio'].bodySchema = sink.body.name;
    } else if (sink.readsBody) {
      needsBody++;
      const fields = [...(sink.bodyFields ?? [])].sort();
      op.requestBody = { required: false, content: { 'application/json': { schema: { type: 'object', properties: Object.fromEntries(fields.map((f) => [f, {}])) } } } };
      op['x-forjio'].body = fields.length ? 'read-unvalidated' : 'read-unknown';
      if (fields.length) withFields++;
    } else if (route.method !== 'delete') {
      op['x-forjio'].body = call ? 'none' : 'unknown';
    }
  }
  pathItems[oaPath] ??= {};
  pathItems[oaPath][route.method] = op;
}

const pkg = JSON.parse(fs.readFileSync(path.join(CWD, 'package.json'), 'utf8'));
const doc = {
  openapi: '3.1.0',
  info: { title: (pkg.name || 'product').replace(/-backend$/, ''), version: pkg.version || '0.0.0' },
  paths: Object.fromEntries(Object.entries(pathItems).sort(([a], [b]) => a.localeCompare(b))),
  'x-apigen': { routes: found.length, matched, bodies: { validated: withBody, fieldsOnly: withFields, takesBody: needsBody } },
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
fs.rmSync(path.join(CWD, '.apigen'), { recursive: true, force: true });
console.log(`apigen: ${found.length} routes, ${matched} matched to source; of ${needsBody} that take a body: ${withBody} validated, ${withFields} with field names only, ${needsBody - withBody - withFields} unknown → ${OUT}`);
process.exit(0);
