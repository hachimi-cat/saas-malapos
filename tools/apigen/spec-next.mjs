// apigen spec-next — the API spec of a Next.js app's route handlers, from its own code.
//
//   cd frontend && node <apigen>/spec-next.mjs --out openapi.json [--app src/app] [--prefix /api/v1] [--brand x]
//
// Every app/**/route.ts under the API prefix: its exported GET/POST/PUT/PATCH/DELETE
// (declared, assigned, or `export { handler as GET }`), and of each:
// - what it does: the comment above it, or the comment in the file that names its verb and
//   route (`GET /api/v1/things — …`, `GET/POST /api/v1/things — …`);
// - its guards: the sign-in checks it calls (resolveAuth, requireWorkspaceCtx, readSession,
//   verifyWebhookSignature, …), and the same-file helpers that compare a request header with
//   a secret from the environment (a cron job's shared secret) — in the handler or in the
//   same-file helpers it hands off to;
// - its query: every name read from the URL's searchParams (however it is bound), typed by
//   what the code does with it (`Number(…) || 25` → number, default 25);
// - its body: the type the handler gives `await req.json()` (declared in the route file or
//   imported from another file of the app); for fields typed `unknown`, or a body with no type,
//   the fields the handler reads, typed by the checks it makes (typeof, Array.isArray,
//   String(…), Number(…), bounds) — and required when the handler turns the request away
//   without them.
// Static only: nothing of the app is run.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const CWD = process.cwd();
const ts = createRequire(path.join(CWD, 'package.json'))('typescript');
const K = ts.SyntaxKind;
const APP = path.join(CWD, args.app ?? 'src/app');
const PREFIX = args.prefix ?? '/api/v1';
// --internal <regex>: routes the product calls itself (a proxy's auth check, a diagnostics
// beacon) — kept in the spec, marked x-forjio.internal, left out of docs, CLI and SDKs.
const INTERNAL = args.internal ? new RegExp(args.internal) : null;
const OUT = args.out ?? 'openapi.json';
const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
// The sign-in checks a handler calls, by name.
const GUARD = /^(resolve\w*Auth|require(Auth|Session|Admin|User|Workspace)\w*|with\w*Auth\w*|getSession|getServerSession|readSession|readCurrentAccount|getAccountFromRequest|readBearerAccount|authenticate\w*|verify\w*(Signature|Webhook|Token|Hmac)\w*)$/;

// ─── files, imports, types ────────────────────────────────────────────────────────────
const tsconfig = (() => {
  const file = path.join(CWD, 'tsconfig.json');
  if (!fs.existsSync(file)) return { base: CWD, paths: {} };
  const o = ts.readConfigFile(file, ts.sys.readFile).config?.compilerOptions ?? {};
  return { base: path.resolve(CWD, o.baseUrl ?? '.'), paths: o.paths ?? {} };
})();
const sources = new Map();
function source(file) {
  if (!sources.has(file)) sources.set(file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true));
  return sources.get(file);
}
function resolveModule(from, spec) {
  const bases = spec.startsWith('.') ? [path.resolve(path.dirname(from), spec)] : [];
  for (const [pat, targets] of Object.entries(tsconfig.paths)) {
    const [pre, post = ''] = pat.split('*');
    const hit = pat.includes('*') ? spec.startsWith(pre) && spec.endsWith(post) : spec === pat;
    if (!hit) continue;
    const mid = pat.includes('*') ? spec.slice(pre.length, spec.length - post.length) : '';
    for (const t of targets) bases.push(path.resolve(tsconfig.base, t.replace('*', mid)));
  }
  for (const b of bases) {
    for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
      const f = b + ext;
      if (/\.tsx?$/.test(f) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
  }
  return null;
}
const declared = new Map();
function decls(file) {
  if (declared.has(file)) return declared.get(file);
  const sf = source(file);
  const types = new Map();
  const imports = new Map();
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) types.set(st.name.text, st);
    const from = (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
    if (!from) continue;
    const named = ts.isImportDeclaration(st) ? st.importClause?.namedBindings : st.exportClause;
    if (named && (ts.isNamedImports(named) || ts.isNamedExports(named))) {
      for (const el of named.elements) imports.set(el.name.text, { from, name: (el.propertyName ?? el.name).text });
    }
  }
  const d = { sf, types, imports };
  declared.set(file, d);
  return d;
}
function findType(file, name, hops = 0) {
  if (hops > 5) return null;
  const d = decls(file);
  if (d.types.has(name)) return { file, node: d.types.get(name) };
  const imp = d.imports.get(name);
  const target = imp ? resolveModule(file, imp.from) : null;
  return target ? findType(target, imp.name, hops + 1) : null;
}
function cleanComment(raw) {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l
    .replace(/^\s*\/\*+\s?/, '')
    .replace(/\s*\*+\/\s*$/, '')
    .replace(/^\s*\*(?!\/)\s?/, '')
    .replace(/^\s*\/\/+\s?/, ''));
  // a divider line ("─── Section ───", "-----") says nothing
  return lines.filter((l) => !(/^[\s─—\-=*#/|]*$/.test(l) && /[─—=*#|-]/.test(l)) && !/──/.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// The comment blocks right above a node (split where a blank line parts them).
function leadingBlocks(node) {
  const text = node.getSourceFile().getFullText();
  return groupBlocks(text, ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []);
}
function groupBlocks(text, ranges) {
  const blocks = [];
  for (const r of ranges) {
    const last = blocks[blocks.length - 1];
    if (last && !/\n[ \t]*\n/.test(text.slice(last.end, r.pos))) { last.end = r.end; last.raw += '\n' + text.slice(r.pos, r.end); }
    else blocks.push({ pos: r.pos, end: r.end, raw: text.slice(r.pos, r.end) });
  }
  return blocks.map((b) => cleanComment(b.raw)).filter(Boolean);
}
const commentOf = (node) => leadingBlocks(node).join('\n\n');
function typeSchema(node, file, depth = 0) {
  if (!node || depth > 6) return {};
  switch (node.kind) {
    case K.StringKeyword: return { type: 'string' };
    case K.NumberKeyword: return { type: 'number' };
    case K.BooleanKeyword: return { type: 'boolean' };
    case K.ObjectKeyword: return { type: 'object' };
    default: break;
  }
  if (ts.isParenthesizedTypeNode(node)) return typeSchema(node.type, file, depth);
  if (ts.isArrayTypeNode(node)) return { type: 'array', items: typeSchema(node.elementType, file, depth + 1) };
  if (ts.isLiteralTypeNode(node)) {
    if (ts.isStringLiteral(node.literal)) return { type: 'string', enum: [node.literal.text] };
    if (ts.isNumericLiteral(node.literal)) return { type: 'number', enum: [Number(node.literal.text)] };
    if (node.literal.kind === K.TrueKeyword || node.literal.kind === K.FalseKeyword) return { type: 'boolean' };
    return {};
  }
  if (ts.isUnionTypeNode(node)) {
    const isNull = (t) => t.kind === K.NullKeyword || (ts.isLiteralTypeNode(t) && t.literal.kind === K.NullKeyword);
    const nullable = node.types.some(isNull);
    const parts = node.types.filter((t) => !isNull(t) && t.kind !== K.UndefinedKeyword).map((t) => typeSchema(t, file, depth + 1));
    let s = {};
    if (parts.length && parts.every((p) => p.enum && p.type === parts[0].type)) s = { type: parts[0].type, enum: parts.flatMap((p) => p.enum) };
    else if (parts.length && parts.every((p) => p.type === 'boolean')) s = { type: 'boolean' };
    else if (parts.length === 1) s = parts[0];
    else if (parts.length) s = { anyOf: parts };
    return nullable ? { ...s, nullable: true } : s;
  }
  if (ts.isIntersectionTypeNode(node)) {
    const out = { type: 'object', properties: {} };
    for (const t of node.types) mergeObject(out, typeSchema(t, file, depth + 1));
    return out;
  }
  if (ts.isTypeLiteralNode(node)) return objectSchema(node.members, file, depth);
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText();
    const targs = node.typeArguments ?? [];
    if (name === 'Array' || name === 'ReadonlyArray') return { type: 'array', items: typeSchema(targs[0], file, depth + 1) };
    if (name === 'Record') return { type: 'object' };
    if (name === 'Date') return { type: 'string', format: 'date-time' };
    if (name === 'Partial' && targs[0]) {
      const { required, ...rest } = typeSchema(targs[0], file, depth + 1);
      void required;
      return rest;
    }
    const found = ts.isIdentifier(node.typeName) ? findType(file, name) : null;
    return found ? declSchema(found.node, found.file, depth + 1) : {};
  }
  return {};
}
function declSchema(node, file, depth) {
  if (ts.isInterfaceDeclaration(node)) {
    const own = objectSchema(node.members, file, depth);
    for (const h of node.heritageClauses ?? []) {
      for (const t of h.types) {
        const base = ts.isIdentifier(t.expression) ? findType(file, t.expression.text) : null;
        if (base) mergeObject(own, declSchema(base.node, base.file, depth + 1));
      }
    }
    return own;
  }
  if (ts.isTypeAliasDeclaration(node)) return typeSchema(node.type, file, depth);
  if (ts.isEnumDeclaration(node)) {
    const values = node.members.map((m) => (m.initializer && ts.isStringLiteral(m.initializer) ? m.initializer.text : null));
    return values.every((v) => v !== null) ? { type: 'string', enum: values } : {};
  }
  return {};
}
function mergeObject(into, from) {
  if (!from?.properties) return;
  Object.assign(into.properties, from.properties);
  if (from.required?.length) into.required = [...new Set([...(into.required ?? []), ...from.required])];
}
function objectSchema(members, file, depth) {
  const properties = {};
  const required = [];
  for (const m of members) {
    if (!ts.isPropertySignature(m) || !m.name) continue;
    const name = m.name.getText().replace(/^['"]|['"]$/g, '');
    const s = { ...typeSchema(m.type, file, depth + 1) };
    const doc = commentOf(m).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (doc) s.description = doc;
    properties[name] = s;
    if (!m.questionToken) required.push(name);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

// ─── what a handler does with its inputs ──────────────────────────────────────────────
const isFn = (n) => n && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n));
const unwrap = (e) => {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)
    || ts.isTypeAssertionExpression(e) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) e = e.expression;
  return e;
};
function walk(node, fn) {
  const visit = (n) => { fn(n); ts.forEachChild(n, visit); };
  visit(node);
}
function localFunctions(sf) {
  const fns = new Map();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body) fns.set(st.name.text, st);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && isFn(unwrap(d.initializer))) fns.set(d.name.text, unwrap(d.initializer));
    }
  }
  return fns;
}
// The handler, and every same-file function it hands off to (and they to theirs).
function reach(fn, fns) {
  const out = [fn];
  const seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    walk(out[i], (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const f = fns.get(n.expression.text);
        if (f && !seen.has(f)) { seen.add(f); out.push(f); }
      }
    });
  }
  return out;
}
function checksSecret(fn) {
  let env = false;
  let header = false;
  walk(fn, (n) => {
    if (ts.isPropertyAccessExpression(n) && n.expression.getText() === 'process.env' && /SECRET|TOKEN|KEY|PASSWORD/i.test(n.name.text)) env = true;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'get' && /headers$/i.test(n.expression.expression.getText())) header = true;
  });
  return env && header;
}
function guardsOf(nodes, fns) {
  const names = [];
  for (const node of nodes) {
    walk(node, (n) => {
      if (!ts.isCallExpression(n)) return;
      const callee = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null;
      if (!callee) return;
      if (GUARD.test(callee)) names.push(callee);
      else if (ts.isIdentifier(n.expression) && fns.has(callee) && checksSecret(fns.get(callee))) names.push(callee);
    });
  }
  return [...new Set(names)];
}
function numberOf(node, fileConsts) {
  const e = unwrap(node);
  if (!e) return null;
  if (ts.isNumericLiteral(e)) return Number(e.text.replace(/_/g, ''));
  if (ts.isPrefixUnaryExpression(e) && e.operator === K.MinusToken) { const v = numberOf(e.operand, fileConsts); return v === null ? null : -v; }
  if (ts.isIdentifier(e) && fileConsts.has(e.text)) return numberOf(fileConsts.get(e.text), fileConsts);
  return null;
}
function literalOf(node) {
  const e = unwrap(node);
  if (!e) return undefined;
  if (ts.isStringLiteralLike(e)) return e.text;
  if (ts.isNumericLiteral(e)) return Number(e.text.replace(/_/g, ''));
  if (e.kind === K.TrueKeyword) return true;
  if (e.kind === K.FalseKeyword) return false;
  return undefined;
}
const isNullish = (node) => { const e = unwrap(node); return e && (e.kind === K.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')); };
const ofFn = (node) => { let n = node.parent; while (n && !isFn(n)) n = n.parent; return n; };
// An `if` straight in a function's body (or its top-level try) that returns: the request is
// turned away when its condition holds.
const returnsThen = (ifs) => {
  const s = ifs.thenStatement;
  return ts.isReturnStatement(s) || ts.isThrowStatement(s) || (ts.isBlock(s) && s.statements.some((x) => ts.isReturnStatement(x) || ts.isThrowStatement(x)));
};
function isGate(ifs) {
  if (!ts.isIfStatement(ifs) || !returnsThen(ifs)) return false;
  let block = ifs.parent;
  if (block && ts.isBlock(block) && block.parent && ts.isTryStatement(block.parent) && block.parent.tryBlock === block) block = block.parent.parent;
  return !!block && ts.isBlock(block) && isFn(block.parent);
}
// What the code does with one input (a body field or a query value): its type, default,
// bounds, and whether a request without it is turned away. `refs` are the expressions that
// read it; each is followed into the variable it is stored in and into same-file helpers.
function infer(refs, ctx) {
  const info = { types: [], items: null, integer: false, min: undefined, max: undefined, default: undefined, defaulted: false, required: false };
  const hint = (t) => { if (t && !info.types.includes(t)) info.types.push(t); };
  const seenAlias = new Set();
  const disjunct = (e) => {
    // the part of an `if (a || b || …)` condition that holds e, if the condition is one
    let d = e;
    for (let p = d.parent; p; d = p, p = p.parent) {
      if (ts.isParenthesizedExpression(p) || ts.isPrefixUnaryExpression(p) || ts.isTypeOfExpression(p) || ts.isCallExpression(p) || ts.isPropertyAccessExpression(p) || ts.isNonNullExpression(p) || ts.isAsExpression(p)) continue;
      if (ts.isBinaryExpression(p) && p.operatorToken.kind === K.BarBarToken) {
        let top = p;
        while (top.parent && (ts.isParenthesizedExpression(top.parent) || (ts.isBinaryExpression(top.parent) && top.parent.operatorToken.kind === K.BarBarToken))) top = top.parent;
        return top.parent && ts.isIfStatement(top.parent) && top.parent.expression === top ? { d, ifs: top.parent } : null;
      }
      if (ts.isBinaryExpression(p) && [K.EqualsEqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.EqualsEqualsToken, K.ExclamationEqualsToken, K.LessThanToken, K.GreaterThanToken, K.LessThanEqualsToken, K.GreaterThanEqualsToken].includes(p.operatorToken.kind)) continue;
      return ts.isIfStatement(p) && p.expression === d ? { d, ifs: p } : null;
    }
    return null;
  };
  // Does this part of the condition hold when the input is missing or not what it must be?
  // `!x`, `!isValid(x)`, `typeof x !== 'string'`, `x !== 'DELETE'`, `x === undefined`, `x == null`.
  const refuses = (d) => {
    const x = unwrap(d);
    if (ts.isPrefixUnaryExpression(x) && x.operator === K.ExclamationToken) return true;
    if (!ts.isBinaryExpression(x)) return false;
    const op = x.operatorToken.kind;
    const other = [x.left, x.right].find((s) => literalOf(s) !== undefined || isNullish(s));
    if (!other) return false;
    if (op === K.ExclamationEqualsEqualsToken || op === K.ExclamationEqualsToken) return typeof literalOf(other) === 'string';
    if (op === K.EqualsEqualsToken) return isNullish(other);
    if (op === K.EqualsEqualsEqualsToken) return ts.isIdentifier(unwrap(other)) && unwrap(other).text === 'undefined';
    return false;
  };
  const visit = (ref, depth, viaParam = false) => {
    if (depth > 3) return;
    let e = ref;
    // follow the value up through what only converts or defaults it
    for (;;) {
      const p = e.parent;
      if (!p) break;
      if (ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isAsExpression(p) || ts.isAwaitExpression(p)) { e = p; continue; }
      if (ts.isBinaryExpression(p) && p.left === e && (p.operatorToken.kind === K.QuestionQuestionToken || p.operatorToken.kind === K.BarBarToken)) {
        const v = literalOf(p.right);
        if (v !== undefined && v !== '' && v !== 0 && v !== false) { info.default ??= v; info.defaulted = true; }
        else if (v === undefined && !isNullish(p.right)) info.defaulted = true;
        e = p;
        continue;
      }
      if (ts.isCallExpression(p) && p.arguments.includes(e)) {
        const c = p.expression.getText();
        if (c === 'String') { hint('string'); e = p; continue; }
        if (c === 'Number' || c === 'parseFloat' || c === 'Number.parseFloat') { hint('number'); e = p; continue; }
        if (c === 'parseInt' || c === 'Number.parseInt' || c === 'Math.floor' || c === 'Math.trunc') { hint('number'); info.integer = true; e = p; continue; }
        if (c === 'Boolean') { hint('boolean'); e = p; continue; }
        break;
      }
      if (ts.isPropertyAccessExpression(p) && p.expression === e && ts.isCallExpression(p.parent) && p.parent.expression === p
        && ['trim', 'toLowerCase', 'toUpperCase', 'normalize'].includes(p.name.text)) { hint('string'); e = p.parent; continue; }
      if (ts.isConditionalExpression(p) && (p.whenTrue === e || p.whenFalse === e)) {
        const cond = unwrap(p.condition);
        if (ts.isBinaryExpression(cond) && [cond.left, cond.right].some(isNullish)) info.defaulted = true;
        const other = p.whenTrue === e ? p.whenFalse : p.whenTrue;
        const v = literalOf(other);
        if (!isNullish(other) && (v === undefined || (v !== '' && v !== 0))) info.defaulted = true;
        e = p;
        continue;
      }
      break;
    }
    // what is checked of it where it is read
    for (const at of new Set([ref, e])) {
      let x = at;
      while (x.parent && (ts.isParenthesizedExpression(x.parent) || ts.isNonNullExpression(x.parent))) x = x.parent;
      const p = x.parent;
      if (!p) continue;
      if (ts.isTypeOfExpression(p) && ts.isBinaryExpression(p.parent)) {
        const t = literalOf(p.parent.left === p ? p.parent.right : p.parent.left);
        if (['string', 'number', 'boolean', 'object'].includes(t)) hint(t);
      }
      if (ts.isCallExpression(p) && p.arguments.includes(x)) {
        const c = p.expression.getText();
        const gate = disjunct(p);
        // `if (… || Array.isArray(x)) return` says it must NOT be an array
        if (c === 'Array.isArray' && !(gate && gate.d === p && returnsThen(gate.ifs))) hint('array');
        if (c === 'Number.isInteger') { hint('number'); info.integer = true; }
        if (c === 'Number.isFinite') hint('number');
        const f = ts.isIdentifier(p.expression) ? ctx.fns.get(c) : null;
        const param = f?.parameters?.[p.arguments.indexOf(x)]?.name;
        if (param && ts.isIdentifier(param)) {
          const refsIn = [];
          walk(f.body ?? f, (n) => { if (ts.isIdentifier(n) && n.text === param.text && n !== param) refsIn.push(n); });
          for (const r of refsIn) visit(r, depth + 1, true);
        }
      }
      if (ts.isPropertyAccessExpression(p) && p.expression === x) {
        const m = p.name.text;
        if (['trim', 'toLowerCase', 'toUpperCase', 'startsWith', 'endsWith', 'padStart', 'normalize'].includes(m)) hint('string');
        if (['every', 'some', 'map', 'filter', 'forEach', 'flatMap', 'reduce'].includes(m)) {
          hint('array');
          const cb = ts.isCallExpression(p.parent) ? unwrap(p.parent.arguments[0]) : null;
          const it = cb && isFn(cb) && cb.parameters[0] && ts.isIdentifier(cb.parameters[0].name) ? cb.parameters[0].name.text : null;
          if (it) {
            walk(cb.body, (n) => {
              if (ts.isTypeOfExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === it && ts.isBinaryExpression(n.parent)) {
                const t = literalOf(n.parent.left === n ? n.parent.right : n.parent.left);
                if (['string', 'number', 'boolean', 'object'].includes(t)) info.items ??= { type: t };
              }
            });
          }
        }
      }
      if (ts.isBinaryExpression(p)) {
        const other = p.left === x ? p.right : p.left;
        const op = p.operatorToken.kind;
        const lit = literalOf(other);
        if (typeof lit === 'boolean') hint('boolean');
        const n = numberOf(other, ctx.consts);
        const g = disjunct(p);
        if (n !== null && p.left === x && g && returnsThen(g.ifs)) {
          if (op === K.LessThanToken) info.min = info.min === undefined ? n : Math.max(info.min, n);
          if (op === K.GreaterThanToken) info.max = info.max === undefined ? n : Math.min(info.max, n);
        }
      }
    }
    // required: the handler itself turns the request away when this is missing or wrong
    // (a check inside a helper it is handed to may only run when the input is there)
    for (const at of new Set([ref, e])) {
      const g = viaParam ? null : disjunct(at);
      if (g && isGate(g.ifs) && refuses(g.d)) info.gated = true;
    }
    // stored in a variable: follow every read of it
    const decl = e.parent;
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer === e && ts.isIdentifier(decl.name) && !seenAlias.has(decl)) {
      seenAlias.add(decl);
      const scope = ofFn(decl) ?? decl.getSourceFile();
      walk(scope, (n) => {
        if (!ts.isIdentifier(n) || n.text !== decl.name.text || n === decl.name) return;
        if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return;
        visit(n, depth + 1, viaParam);
      });
    }
  };
  for (const r of refs) visit(r, 0);
  info.required = !!info.gated && !info.defaulted;
  return info;
}
function applyInfo(schema, info) {
  const s = { ...schema };
  if (!s.type && !s.anyOf && info.types.length) s.type = info.types[0];
  if (s.type === 'number' && info.integer) s.type = 'integer';
  if (s.type === 'array' && info.items && (!s.items || !Object.keys(s.items).length)) s.items = info.items;
  if (info.min !== undefined && (s.type === 'number' || s.type === 'integer') && s.minimum === undefined) s.minimum = info.min;
  if (info.max !== undefined && (s.type === 'number' || s.type === 'integer') && s.maximum === undefined) s.maximum = info.max;
  if (info.default !== undefined && s.default === undefined && (!s.type || typeof info.default === (s.type === 'integer' ? 'number' : s.type))) s.default = info.default;
  return s;
}

// The query names a handler reads from the URL, however searchParams is bound.
function queryOf(nodes, ctx) {
  const bound = new Set();
  for (const node of nodes) {
    walk(node, (n) => {
      if (!ts.isVariableDeclaration(n) || !n.initializer) return;
      const init = unwrap(n.initializer);
      if (ts.isIdentifier(n.name) && ts.isPropertyAccessExpression(init) && init.name.text === 'searchParams') bound.add(n.name.text);
      if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) if ((el.propertyName ?? el.name).getText() === 'searchParams' && ts.isIdentifier(el.name)) bound.add(el.name.text);
      }
    });
  }
  const reads = new Map();
  for (const node of nodes) {
    walk(node, (n) => {
      if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression) || !['get', 'getAll', 'has'].includes(n.expression.name.text)) return;
      const arg = n.arguments[0];
      if (!arg || !ts.isStringLiteralLike(arg)) return;
      const obj = unwrap(n.expression.expression);
      if (!((ts.isPropertyAccessExpression(obj) && obj.name.text === 'searchParams') || (ts.isIdentifier(obj) && bound.has(obj.text)))) return;
      if (!reads.has(arg.text)) reads.set(arg.text, { refs: [], kind: n.expression.name.text });
      reads.get(arg.text).refs.push(n);
    });
  }
  return [...reads.entries()].map(([name, r]) => {
    const info = infer(r.refs, ctx);
    let schema = r.kind === 'getAll' ? { type: 'array', items: { type: 'string' } } : r.kind === 'has' ? { type: 'boolean' } : applyInfo({}, info);
    if (!schema.type) schema = { ...schema, type: 'string' };
    return { name, in: 'query', required: r.kind === 'get' && info.required, schema };
  });
}

// The body a handler reads: `await req.json()` (or JSON.parse of `await req.text()`), the
// type it gives it, and the fields it reads.
function bodyOf(nodes, reqNames, ctx) {
  const textVars = new Set();
  for (const node of nodes) {
    walk(node, (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const init = unwrap(n.initializer);
        if (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) && init.expression.name.text === 'text' && reqNames.has(unwrap(init.expression.expression).getText())) textVars.add(n.name.text);
      }
    });
  }
  const reads = [];
  for (const node of nodes) {
    walk(node, (n) => {
      if (!ts.isCallExpression(n)) return;
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'json' && reqNames.has(unwrap(n.expression.expression).getText())) reads.push(n);
      if (n.expression.getText() === 'JSON.parse' && n.arguments[0] && ts.isIdentifier(n.arguments[0]) && textVars.has(n.arguments[0].text)) reads.push(n);
    });
  }
  if (!reads.length) return null;
  const vars = new Set();
  const fields = new Map(); // name -> refs
  const addField = (name, ref) => { if (!fields.has(name)) fields.set(name, []); if (ref) fields.get(name).push(ref); };
  let typeNode = null;
  let typeFile = null;
  for (const read of reads) {
    let e = read;
    for (;;) {
      const p = e.parent;
      if (!p) break;
      if (ts.isAsExpression(p)) { typeNode ??= p.type; e = p; continue; }
      if (ts.isParenthesizedExpression(p) || ts.isAwaitExpression(p) || ts.isNonNullExpression(p)) { e = p; continue; }
      if (ts.isPropertyAccessExpression(p) && p.expression === e && ['catch', 'then'].includes(p.name.text) && ts.isCallExpression(p.parent)) { e = p.parent; continue; }
      if (ts.isBinaryExpression(p) && p.left === e && [K.QuestionQuestionToken, K.BarBarToken].includes(p.operatorToken.kind)) { e = p; continue; }
      break;
    }
    const p = e.parent;
    let name = null;
    if (p && ts.isVariableDeclaration(p) && p.initializer === e) {
      typeNode ??= p.type ?? null;
      if (ts.isIdentifier(p.name)) name = p.name.text;
      else if (ts.isObjectBindingPattern(p.name)) for (const el of p.name.elements) addField((el.propertyName ?? el.name).getText(), ts.isIdentifier(el.name) ? el.name : null);
    } else if (p && ts.isBinaryExpression(p) && p.right === e && p.operatorToken.kind === K.EqualsToken && ts.isIdentifier(p.left)) {
      name = p.left.text;
    }
    if (name) vars.add(name);
    typeFile = read.getSourceFile().fileName;
  }
  // `const b = body as Record<string, unknown>` — the same body under another name
  for (let grew = true; grew;) {
    grew = false;
    for (const node of nodes) {
      walk(node, (n) => {
        if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(unwrap(n.initializer)) && vars.has(unwrap(n.initializer).text)) {
          if (ts.isIdentifier(n.name) && !vars.has(n.name.text)) { vars.add(n.name.text); grew = true; }
        }
        // `let body: T; body = await req.json()` — the declared type
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && vars.has(n.name.text) && n.type && !typeNode && n.type.kind !== K.UnknownKeyword && n.type.kind !== K.AnyKeyword) typeNode = n.type;
      });
    }
  }
  for (const node of nodes) {
    walk(node, (n) => {
      if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && ts.isIdentifier(unwrap(n.expression)) && vars.has(unwrap(n.expression).text)) {
        const key = ts.isPropertyAccessExpression(n) ? n.name.text : ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : null;
        if (key) addField(key, n);
      }
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === K.InKeyword && ts.isStringLiteralLike(n.left) && ts.isIdentifier(unwrap(n.right)) && vars.has(unwrap(n.right).text)) addField(n.left.text, null);
      if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer && ts.isIdentifier(unwrap(n.initializer)) && vars.has(unwrap(n.initializer).text)) {
        for (const el of n.name.elements) addField((el.propertyName ?? el.name).getText(), ts.isIdentifier(el.name) ? el.name : null);
      }
    });
  }
  let schema = typeNode ? typeSchema(typeNode, typeFile) : {};
  if (schema.nullable) { const { nullable, ...rest } = schema; void nullable; schema = rest; }
  const declaredFields = !!(schema.properties && Object.keys(schema.properties).length);
  if (!declaredFields && !fields.size) return { schema: null };
  const properties = {};
  const required = new Set(schema.required ?? []);
  const names = declaredFields ? Object.keys(schema.properties) : [...fields.keys()];
  for (const name of names) {
    const refs = (fields.get(name) ?? []).filter(Boolean);
    const info = infer(refs, ctx);
    properties[name] = applyInfo(declaredFields ? schema.properties[name] : {}, info);
    if (info.required) required.add(name);
  }
  return { schema: { type: 'object', properties, ...(required.size ? { required: [...required].filter((n) => n in properties) } : {}) } };
}

// ─── naming ───────────────────────────────────────────────────────────────────────────
const VERB_RE = '(?:GET|POST|PUT|PATCH|DELETE)';
const ROUTE_REF = new RegExp(`^\\s*(${VERB_RE}(?:\\s*[/|,&]\\s*${VERB_RE})*\\s+)?(\\/[^\\s?]+)(\\?\\S*)?`);
const LEAD = new RegExp(`^\\s*(${VERB_RE}(?:\\s*[/|,&]\\s*${VERB_RE})*\\s+)?\\/\\S*\\s*[—–-]+\\s*`);
const normalize = (p) => p.replace(/\[+\.{0,3}([^\]]+?)\]+/g, '{$1}').replace(/:(\w+)/g, '{$1}').replace(/\/$/, '');
// Does this comment name the route (and this verb, when it names verbs)? null: it names none.
function names(doc, route, verb) {
  const m = doc.match(ROUTE_REF);
  if (!m || normalize(m[2]) !== route) return null;
  return !m[1] ? 'route' : new RegExp(`\\b${verb}\\b`).test(m[1]) ? 'verb' : null;
}
const IRREGULAR = { people: 'person', addresses: 'address', statuses: 'status', analyses: 'analysis', indices: 'index', aliases: 'alias', media: 'media', series: 'series', news: 'news' };
function singular(word) {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(ss|x|z|ch|sh)es$/.test(word)) return word.replace(/es$/, '');
  return word.replace(/s$/, '');
}
const words = (seg) => seg.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
// A plain title for a route whose code carries no comment: "List api keys".
function title(method, route) {
  const parts = route.replace(PREFIX, '').split('/').filter(Boolean);
  const isParam = (x) => x.startsWith('{');
  const last = parts[parts.length - 1] ?? '';
  const nouns = parts.filter((x) => !isParam(x));
  const noun = nouns[nouns.length - 1] ?? 'item';
  const parent = nouns.length > 1 ? nouns[nouns.length - 2] : null;
  const a = (w) => (/^[aeiou]/.test(w) ? 'an' : 'a');
  if (isParam(last)) {
    const one = words(singular(noun));
    return { get: `Get ${a(one)} ${one}`, patch: `Update ${a(one)} ${one}`, put: `Replace ${a(one)} ${one}`, delete: `Delete ${a(one)} ${one}`, post: `Act on ${a(one)} ${one}` }[method];
  }
  if (parts.length >= 3 && isParam(parts[parts.length - 2]) && method !== 'get') {
    const one = words(singular(parent ?? noun));
    return `${words(noun).replace(/^./, (c) => c.toUpperCase())} ${a(one)} ${one}`;
  }
  // /things/start, /things/me — an action on things, or one part of them
  if (nouns.length >= 2) {
    const cap = (w) => w.replace(/^./, (c) => c.toUpperCase());
    return { get: `Get ${words(parent)} ${words(noun)}`, post: `${cap(words(noun))} ${words(singular(parent))}`, patch: `Update ${words(parent)} ${words(noun)}`, put: `Set ${words(parent)} ${words(noun)}`, delete: `Delete ${words(parent)} ${words(noun)}` }[method];
  }
  const many = words(noun);
  return { get: `List ${many}`, post: `Create ${a(words(singular(noun)))} ${words(singular(noun))}`, patch: `Update ${many}`, put: `Set ${many}`, delete: `Delete ${many}` }[method];
}
function summaryOf(doc) {
  const first = doc.replace(LEAD, '').split(/\n\s*\n|(?<!\b(?:e\.g|i\.e|etc|vs|approx))(?<=[.?!])\s+(?=[A-Z`"'(])/)[0] ?? '';
  return first.replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 200);
}

// ─── the routes ───────────────────────────────────────────────────────────────────────
function walkFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p));
    else if (/^route\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out.sort();
}
function routePath(file) {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).filter((s) => s && !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@'));
  return '/' + rel.map((s) => (s.startsWith('[') ? `{${s.replace(/^\[+\.{0,3}|\]+$/g, '')}}` : s)).join('/');
}
// Every comment block in a file (a run of comment lines with no blank line between them).
function commentBlocks(sf) {
  const text = sf.getFullText();
  const seen = new Set();
  const ranges = [];
  const collect = (n) => {
    for (const r of ts.getLeadingCommentRanges(text, n.getFullStart()) ?? []) if (!seen.has(r.pos)) { seen.add(r.pos); ranges.push(r); }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  for (const r of ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()) ?? []) if (!seen.has(r.pos)) { seen.add(r.pos); ranges.push(r); }
  ranges.sort((a, b) => a.pos - b.pos);
  return groupBlocks(text, ranges);
}

const paths = {};
let takesBody = 0;
let withFields = 0;
for (const file of walkFiles(APP)) {
  const route = routePath(file);
  if (route !== PREFIX && !route.startsWith(PREFIX + '/')) continue;
  const sf = source(file);
  const fns = localFunctions(sf);
  const consts = new Map();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
  }
  const ctx = { fns, consts };
  const blocks = commentBlocks(sf);
  const handlers = [];
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === K.ExportKeyword);
    if (ts.isFunctionDeclaration(st) && st.name && VERBS.includes(st.name.text) && exported) handlers.push({ name: st.name.text, st, fn: st });
    if (ts.isVariableStatement(st) && exported) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !VERBS.includes(d.name.text) || !d.initializer) continue;
        const init = unwrap(d.initializer);
        handlers.push({ name: d.name.text, st, fn: ts.isIdentifier(init) ? (fns.get(init.text) ?? init) : init });
      }
    }
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        const local = fns.get((el.propertyName ?? el.name).text);
        if (VERBS.includes(el.name.text) && local) handlers.push({ name: el.name.text, st: ts.isFunctionDeclaration(local) ? local : local.parent?.parent?.parent ?? st, fn: local });
      }
    }
  }
  for (const { name, st, fn } of handlers) {
    const verb = name.toLowerCase();
    // the function that takes the request (a wrapped handler: the function it wraps)
    let target = fn;
    if (!isFn(target)) walk(fn, (n) => { if (!isFn(target) && isFn(n)) target = n; });
    const nodes = reach(fn, fns);
    const reqNames = new Set();
    const p0 = isFn(target) ? target.parameters[0]?.name : null;
    if (p0 && ts.isIdentifier(p0)) reqNames.add(p0.text);
    for (const node of nodes) {
      walk(node, (n) => {
        if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || !fns.has(n.expression.text)) return;
        n.arguments.forEach((a, i) => {
          const pn = fns.get(n.expression.text).parameters?.[i]?.name;
          if (ts.isIdentifier(a) && reqNames.has(a.text) && pn && ts.isIdentifier(pn)) reqNames.add(pn.text);
        });
      });
    }
    // what it does: its own comment when that names this route (or names no route), else
    // the comment in the file that names this verb and route, else one naming the route
    const own = leadingBlocks(st);
    const ownHit = own.findIndex((b) => names(b, route, name));
    const plain = own.filter((b) => !ROUTE_REF.test(b));
    const pick = ownHit >= 0
      ? own.slice(ownHit).join('\n\n')
      : blocks.find((b) => names(b, route, name) === 'verb') ?? (plain.join('\n\n') || blocks.find((b) => names(b, route, name) === 'route') || '');
    const doc = pick.replace(LEAD, '').trim().replace(/^./, (c) => c.toUpperCase());
    const query = queryOf(nodes, ctx);
    const op = {
      operationId: verb + route.replace(PREFIX, '').replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')),
      // a comment that opens with code (`resolveAuth`, not …) is about the code, not the route
      summary: (pick && !/^[`'"]/.test(summaryOf(pick)) && summaryOf(pick)) || title(verb, route),
      description: doc ? doc.slice(0, 2000) : undefined,
      tags: [route.replace(PREFIX, '').split('/').filter(Boolean)[0] ?? 'root'],
      parameters: [...[...route.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })), ...query],
      'x-forjio': { source: `${path.relative(CWD, file)}:${sf.getLineAndCharacterOfPosition(st.getStart()).line + 1}`, guards: guardsOf(nodes, fns), ...(INTERNAL?.test(route) ? { internal: true } : {}) },
    };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(name)) {
      const body = bodyOf(nodes, reqNames, ctx);
      if (body) {
        takesBody++;
        if (body.schema) withFields++;
        op.requestBody = { required: false, content: { 'application/json': { schema: body.schema ?? { type: 'object' } } } };
      }
    }
    paths[route] ??= {};
    paths[route][verb] = op;
  }
}
fs.writeFileSync(OUT, JSON.stringify({ openapi: '3.1.0', info: { title: args.brand ?? 'product', version: '0' }, paths: Object.fromEntries(Object.entries(paths).sort()) }, null, 1) + '\n');
const count = Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0);
console.log(`apigen spec-next: ${count} handlers; of ${takesBody} that read a body: ${withFields} with its fields → ${OUT}`);
