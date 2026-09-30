// apigen spec-next — the API spec of a Next.js app's route handlers, from its own code.
//
//   cd frontend && node <apigen>/spec-next.mjs --out ../openapi.json [--app src/app] [--prefix /api/v1]
//
// Every app/**/route.ts under the API prefix: its exported GET/POST/PUT/PATCH/DELETE, the
// comment above each, the body it reads (`await req.json() as T` / `const b: T = await
// req.json()` → the fields of interface/type T), the query names it reads
// (`searchParams.get('x')`), and the guards it calls (resolveAuth, requireWorkspaceCtx, …).
// Static only: nothing of the app is run.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const CWD = process.cwd();
const ts = createRequire(path.join(CWD, 'package.json'))('typescript');
const APP = path.join(CWD, args.app ?? 'src/app');
const PREFIX = args.prefix ?? '/api/v1';
const OUT = args.out ?? 'openapi.json';
const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const GUARDS = /\b(resolveAuth|resolveAdminAuth|requireWorkspaceCtx|requireAuth|requireSession|requireAdmin|getSession|readCurrentAccount)\b/g;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}
function routePath(file) {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  return '/' + rel.map((s) => (s.startsWith('[') ? `{${s.replace(/^\[+\.{0,3}|\]+$/g, '')}}` : s)).join('/');
}
function typeSchema(node, sf) {
  if (!node) return {};
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword: return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword: return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword: return { type: 'boolean' };
    default: break;
  }
  if (ts.isArrayTypeNode(node)) return { type: 'array', items: typeSchema(node.elementType, sf) };
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return { type: 'string', enum: [node.literal.text] };
  if (ts.isUnionTypeNode(node)) {
    const parts = node.types.filter((t) => t.kind !== ts.SyntaxKind.NullKeyword && t.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword));
    if (parts.length && parts.every((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))) return { type: 'string', enum: parts.map((t) => t.literal.text) };
    if (parts.length === 1) return typeSchema(parts[0], sf);
    return { anyOf: parts.map((t) => typeSchema(t, sf)) };
  }
  if (ts.isTypeLiteralNode(node)) return objectSchema(node.members, sf);
  return {};
}
function objectSchema(members, sf) {
  const properties = {};
  const required = [];
  for (const m of members) {
    if (!ts.isPropertySignature(m) || !m.name) continue;
    const name = m.name.getText(sf).replace(/^['"]|['"]$/g, '');
    properties[name] = typeSchema(m.type, sf);
    const doc = ts.getLeadingCommentRanges(sf.getFullText(), m.getFullStart())?.map((r) => sf.getFullText().slice(r.pos, r.end)).join(' ');
    if (doc) properties[name].description = doc.replace(/^\/\*\*?|\*\/$|^\s*\/\/\s?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!m.questionToken) required.push(name);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

// The type a handler gives the JSON it reads: `(await req.json()…) as T | null`,
// `const b: T = await req.json()`, or an inline `as { name?: string }`.
function bodyType(fn, sf, types) {
  let found = null;
  const readsJson = (n) => { let hit = false; const v = (x) => { if (hit) return; if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'json') hit = true; else ts.forEachChild(x, v); }; v(n); return hit; };
  const resolve = (node) => {
    if (!node) return null;
    if (ts.isUnionTypeNode(node)) {
      const parts = node.types.filter((t) => !(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword) && t.kind !== ts.SyntaxKind.NullKeyword && t.kind !== ts.SyntaxKind.UndefinedKeyword);
      return parts.length === 1 ? resolve(parts[0]) : null;
    }
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      if (node.typeName.text === 'Partial' && node.typeArguments?.length) {
        const inner = resolve(node.typeArguments[0]);
        return inner ? { ...inner, required: undefined } : null;
      }
      return types.get(node.typeName.text) ?? null;
    }
    if (ts.isTypeLiteralNode(node)) return objectSchema(node.members, sf);
    return null;
  };
  const visit = (n) => {
    if (found) return;
    if (ts.isAsExpression(n) && readsJson(n.expression)) found = resolve(n.type);
    else if (ts.isVariableDeclaration(n) && n.type && n.initializer && readsJson(n.initializer)) found = resolve(n.type);
    if (!found) ts.forEachChild(n, visit);
  };
  visit(fn);
  return found;
}

const paths = {};
let withBody = 0;
let takesBody = 0;
for (const file of walk(APP)) {
  const route = routePath(file);
  if (!route.startsWith(PREFIX)) continue;
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const types = new Map();
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st)) types.set(st.name.text, objectSchema(st.members, sf));
    if (ts.isTypeAliasDeclaration(st)) types.set(st.name.text, typeSchema(st.type, sf));
  }
  for (const st of sf.statements) {
    let name = null;
    let fn = null;
    if (ts.isFunctionDeclaration(st) && st.name && VERBS.includes(st.name.text) && ts.getCombinedModifierFlags(st) & ts.ModifierFlags.Export) { name = st.name.text; fn = st; }
    if (ts.isVariableStatement(st) && ts.getCombinedModifierFlags(st) & ts.ModifierFlags.Export) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && VERBS.includes(d.name.text)) { name = d.name.text; fn = d.initializer ?? d; }
    }
    if (!name) continue;
    const text = fn.getText(sf);
    const comment = (ts.getLeadingCommentRanges(sf.getFullText(), st.getFullStart()) ?? []).map((r) => sf.getFullText().slice(r.pos, r.end)).join('\n')
      .replace(/^\/\*\*?|\*\/$/gm, '').replace(/^\s*\*\s?|^\s*\/\/\s?/gm, '').trim();
    const summary = comment.split('\n')[0].replace(/^(GET|POST|PUT|PATCH|DELETE)\s+\S+\s*[—-]\s*/i, '').replace(/^./, (c) => c.toUpperCase()).slice(0, 200);
    const op = {
      operationId: name.toLowerCase() + route.replace(PREFIX, '').replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')),
      summary: summary || undefined,
      description: comment || undefined,
      tags: [route.replace(PREFIX, '').split('/').filter(Boolean)[0] ?? 'root'],
      parameters: [...route.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })),
      'x-forjio': { source: `${path.relative(CWD, file)}:${sf.getLineAndCharacterOfPosition(st.getStart()).line + 1}`, guards: [...new Set([...text.matchAll(GUARDS)].map((m) => m[1]))] },
    };
    for (const m of new Set([...text.matchAll(/searchParams\.get\(\s*['"]([^'"]+)['"]\s*\)/g)].map((x) => x[1]))) {
      op.parameters.push({ name: m, in: 'query', required: false, schema: {} });
    }
    if (['POST', 'PUT', 'PATCH'].includes(name) && /\.json\(\)/.test(text)) {
      takesBody++;
      const schema = bodyType(fn, sf, types);
      op.requestBody = { required: false, content: { 'application/json': { schema: schema ?? { type: 'object' } } } };
      if (schema) withBody++;
    }
    paths[route] ??= {};
    paths[route][name.toLowerCase()] = op;
  }
}
fs.writeFileSync(OUT, JSON.stringify({ openapi: '3.1.0', info: { title: args.brand ?? 'product', version: '0' }, paths: Object.fromEntries(Object.entries(paths).sort()) }, null, 1) + '\n');
const count = Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0);
console.log(`apigen spec-next: ${count} handlers; of ${takesBody} that read a body: ${withBody} with its fields → ${OUT}`);
