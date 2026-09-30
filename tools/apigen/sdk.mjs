// apigen sdk — every feature route of a product as an SDK method, from its openapi.json.
//
//   node <apigen>/sdk.mjs --lang python --spec backend/openapi.json --out sdk/python/<pkg>/api_generated.py
//   node <apigen>/sdk.mjs --lang node   --spec backend/openapi.json --out sdk/node/src/api.generated.ts
//   node <apigen>/sdk.mjs --lang go --package <pkg> --spec backend/openapi.json --out sdk/go/api_generated.go
//
// Writes one file with a class `GeneratedApi` (python, node) / type `GeneratedAPI` (go):
// one method per route, named <area>_<action> (python) / <area><Action> (node) /
// <Area><Action> (go), taking the path parameters, then query / body fields. Every call
// goes through the SDK client's own `_apigen_request` / `apigenRequest` (a few hand-written
// lines per SDK: its sign-in and envelope), so the generated surface signs requests exactly
// like the rest of that SDK. `--check` exits 1 when the file is stale (a text comparison:
// no Go toolchain is needed, the go output is written gofmt-clean).
//
// A file upload (a multipart form body) takes its file fields as bytes / a Blob / a FormFile
// and its other fields as values, and goes through the client's form hook instead:
// `_apigen_request(..., form=, files=)` (python), `apigenRequest` with a FormData body
// (node), `apigenForm` (go). That code is only generated for a spec that has such a route,
// so every other product's output is unchanged.
import fs from 'node:fs';
import { isFeature, bodyFields, formBody, isFileField } from './common.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? true]] : acc), []),
);
const LANG = args.lang ?? 'python';
const spec = JSON.parse(fs.readFileSync(args.spec ?? 'backend/openapi.json', 'utf8'));
const OUT = args.out;
const CHECK = args.check === true || args.check === 'true';
const PREFIX = args.prefix ?? '/api/v1';
const BRAND = args.brand ?? spec.info?.title ?? 'product';

const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean);
const snake = (s) => words(s).join('_');
const camel = (s) => words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
const PY_RESERVED = new Set(['json_body', 'self', 'from', 'import', 'class', 'def', 'return', 'global', 'lambda', 'type', 'id', 'in', 'is', 'not', 'or', 'and', 'if', 'else', 'for', 'while', 'with', 'as', 'pass', 'raise', 'try', 'except', 'finally', 'yield', 'del', 'assert', 'async', 'await', 'none', 'true', 'false', 'list', 'dict', 'set', 'format', 'filter', 'input', 'object', 'range', 'print', 'hash', 'max', 'min', 'all', 'any']);
const pyName = (s) => { const n = snake(s) || 'value'; return PY_RESERVED.has(n) ? `${n}_` : /^\d/.test(n) ? `n_${n}` : n; };

function pyType(schema) {
  if (!schema) return 'Any';
  if (schema.enum) return 'str';
  const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== 'null') : schema.type;
  return { integer: 'int', number: 'float', boolean: 'bool', string: 'str', array: 'List[Any]', object: 'Dict[str, Any]' }[t] ?? 'Any';
}
function tsType(schema) {
  if (!schema) return 'unknown';
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== 'null') : schema.type;
  return { integer: 'number', number: 'number', boolean: 'boolean', string: 'string', array: 'unknown[]', object: 'Record<string, unknown>' }[t] ?? 'unknown';
}

// the same area/action names as the CLI (`api <area> <action>`)
const routes = [];
const names = new Map();
for (const [p, item] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(item)) {
    if (!isFeature(method, p, op)) continue;
    const segs = p.replace(PREFIX, '').split('/').filter(Boolean);
    const area = op.tags?.[0] ?? segs[0] ?? 'root';
    const rest = segs.slice(1).filter((s) => !s.startsWith('{'));
    const endsWithParam = (segs[segs.length - 1] ?? '').startsWith('{');
    const verb = { get: endsWithParam ? 'get' : 'list', post: 'create', patch: 'update', put: 'set', delete: 'delete' }[method];
    let action = rest.length ? rest.join(' ') : verb;
    const key = `${area}|${action}`;
    names.set(key, (names.get(key) ?? 0) + 1);
    const body = op.requestBody?.content?.['application/json']?.schema;
    routes.push({
      area, action, verb, method: method.toUpperCase(), path: p, summary: op.summary ?? '',
      pathParams: (op.parameters ?? []).filter((x) => x.in === 'path'),
      query: (op.parameters ?? []).filter((x) => x.in === 'query'),
      body: body ? bodyFields(body) ?? { properties: {}, required: [] } : null,
      bodySchema: body ?? null,
      bodyRequired: !!op.requestBody?.required,
      form: formBody(op),
    });
  }
}
for (const r of routes) if (names.get(`${r.area}|${r.action}`) > 1 && r.action !== r.verb && r.method !== 'GET') r.action = `${r.verb} ${r.action}`;
const taken = new Set();
for (const r of routes) {
  let n = `${r.area} ${r.action}`;
  let i = 2;
  while (taken.has(n)) n = `${r.area} ${r.action} ${i++}`;
  taken.add(n);
  r.fullName = n;
}
routes.sort((a, b) => a.fullName.localeCompare(b.fullName));
const HAS_FORM = routes.some((r) => r.form);

function python() {
  const out = [
    `"""Every ${BRAND} feature route, one method each — generated by apigen from`,
    `backend/openapi.json. Do not edit by hand; regenerate after the API changes.`,
    '',
    'Reach them as ``client.api.<area>_<action>(...)``. Each call goes through the',
    "client's own ``_apigen_request`` (its sign-in and response envelope).",
    '"""',
    '',
    'from __future__ import annotations',
    '',
    'from typing import Any, Dict, List, Optional',
    '',
    '',
    'class GeneratedApi:',
    `    """All ${routes.length} feature routes of the ${BRAND} API."""`,
    '',
    '    def __init__(self, client: Any) -> None:',
    '        self._client = client',
    '',
    '    def _call(self, method: str, path: str, query: Dict[str, Any], body: Optional[Dict[str, Any]]) -> Any:',
    '        query = {k: v for k, v in query.items() if v is not None}',
    '        return self._client._apigen_request(method, path, query=query or None, body=body)',
  ];
  if (HAS_FORM) {
    out.push(
      '',
      '    # A file upload: the form fields and the files, sent by the client as multipart/form-data.',
      '    def _call_form(self, method: str, path: str, query: Dict[str, Any], form: Dict[str, Any], files: Dict[str, Any]) -> Any:',
      '        query = {k: v for k, v in query.items() if v is not None}',
      '        return self._client._apigen_request(method, path, query=query or None, form=form, files=files)',
    );
  }
  for (const r of routes) {
    const params = [];
    const doc = [`${r.summary || r.fullName} (${r.method} ${r.path}).`];
    for (const p of r.pathParams) params.push(`${pyName(p.name)}: str`);
    const kw = [];
    for (const q of r.query) kw.push({ name: q.name, py: pyName(q.name), type: pyType(q.schema), required: q.required, where: 'query' });
    if (r.body) {
      const req = new Set(r.body.required ?? []);
      for (const [name, s] of Object.entries(r.body.properties)) kw.push({ name, py: pyName(name), type: pyType(s), required: req.has(name), where: 'body', schema: s });
    }
    if (r.form) {
      const req = new Set(r.form.required ?? []);
      for (const [name, s] of Object.entries(r.form.properties)) {
        const file = isFileField(s);
        kw.push({ name, py: pyName(name), type: file ? 'Any' : pyType(s), required: req.has(name), where: file ? 'file' : 'form', schema: s });
      }
    }
    const sig = ['self', ...params];
    if (kw.length || r.body) sig.push('*');
    for (const k of kw) sig.push(k.required && (k.where === 'query' || k.where === 'file') ? `${k.py}: ${k.type}` : `${k.py}: Optional[${k.type}] = None`);
    if (r.body) sig.push('json_body: Optional[Dict[str, Any]] = None');
    if (kw.some((k) => k.where === 'body')) doc.push('', 'Body fields are keyword arguments; `json_body=` passes the whole body (fields override it).');
    if (r.form) doc.push('', 'Sent as multipart/form-data. A file is bytes, a binary file object, or a', '(filename, content[, content_type]) tuple; the other fields are keyword arguments.');
    for (const k of kw.filter((x) => (x.where === 'body' || x.where === 'form') && x.schema?.enum)) doc.push(`${k.py}: one of ${k.schema.enum.join(', ')}`);
    let path = r.path;
    for (const p of r.pathParams) path = path.replace(`{${p.name}}`, `{_q(${pyName(p.name)})}`);
    out.push('', `    def ${pyName(r.fullName)}(${sig.join(', ')}) -> Any:`, `        """${doc.join('\n        ').replace(/"""/g, "'''")}"""`);
    const q = r.query.map((x) => `"${x.name}": ${pyName(x.name)}`).join(', ');
    if (r.body) {
      out.push('        payload: Dict[str, Any] = dict(json_body or {})');
      for (const k of kw.filter((x) => x.where === 'body')) out.push(`        if ${k.py} is not None:`, `            payload["${k.name}"] = ${k.py}`);
      for (const k of kw.filter((x) => x.where === 'body' && x.required)) out.push(`        if "${k.name}" not in payload:`, `            raise ValueError("${pyName(r.fullName)} needs ${k.py}")`);
    }
    if (r.form) {
      // `_form` / `_files`: pyName never starts a name with "_", so no field can shadow them
      out.push('        _form: Dict[str, Any] = {}', '        _files: Dict[str, Any] = {}');
      for (const k of kw.filter((x) => x.where === 'form' || x.where === 'file')) {
        if (k.where === 'file' && k.required) out.push(`        _files["${k.name}"] = ${k.py}`);
        else out.push(`        if ${k.py} is not None:`, `            ${k.where === 'file' ? '_files' : '_form'}["${k.name}"] = ${k.py}`);
      }
      for (const k of kw.filter((x) => x.where === 'form' && x.required)) out.push(`        if "${k.name}" not in _form:`, `            raise ValueError("${pyName(r.fullName)} needs ${k.py}")`);
      out.push(`        return self._call_form("${r.method}", f"${path}", {${q}}, _form, _files)`);
      continue;
    }
    out.push(`        return self._call("${r.method}", f"${path}", {${q}}, ${r.body ? 'payload' : 'None'})`);
  }
  out.push('', '', 'def _q(value: Any) -> str:', '    from urllib.parse import quote', '', '    return quote(str(value), safe="")', '');
  return out.join('\n');
}

function node() {
  const out = [
    `// Every ${BRAND} feature route, one method each — generated by apigen from`,
    '// backend/openapi.json. Do not edit by hand; regenerate after the API changes.',
    "// Reach them as `client.api.<area><Action>(...)`; each call goes through the client's",
    '// own `apigenRequest` (its sign-in and response envelope).',
    '',
    'export interface ApigenTransport {',
    '  apigenRequest(method: string, path: string, query: Record<string, unknown> | undefined, body: unknown): Promise<unknown>;',
    '}',
    '',
    `/** All ${routes.length} feature routes of the ${BRAND} API. */`,
    'export class GeneratedApi {',
    '  constructor(private readonly client: ApigenTransport) {}',
    '',
    '  private call(method: string, path: string, query: Record<string, unknown>, body: unknown): Promise<unknown> {',
    '    const q = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null));',
    '    return this.client.apigenRequest(method, path, Object.keys(q).length ? q : undefined, body);',
    '  }',
  ];
  if (HAS_FORM) {
    out.push(
      '',
      "  /** A file upload's body: a FormData with each file (a Blob; a File keeps its name) and",
      "   *  the other fields as text. The client's apigenRequest sends a FormData as it is. */",
      '  private form(fields: Record<string, unknown>): FormData {',
      '    const form = new FormData();',
      '    for (const [k, v] of Object.entries(fields)) {',
      '      if (v === undefined || v === null) continue;',
      "      form.append(k, v instanceof Blob ? v : typeof v === 'string' ? v : JSON.stringify(v));",
      '    }',
      '    return form;',
      '  }',
    );
  }
  for (const r of routes) {
    const params = r.pathParams.map((p) => `${camel(p.name) || 'id'}: string`);
    const fields = [];
    for (const q of r.query) fields.push(`${JSON.stringify(q.name)}${q.required ? '' : '?'}: ${tsType(q.schema)}`);
    const req = new Set(r.body?.required ?? []);
    for (const [name, s] of Object.entries(r.body?.properties ?? {})) fields.push(`${JSON.stringify(name)}${req.has(name) ? '' : '?'}: ${tsType(s)}`);
    // a body route takes any other field too, sent in the body (as python's json_body)
    if (r.body) fields.push('[field: string]: unknown');
    for (const name of r.form?.required ?? []) req.add(name);
    for (const [name, s] of Object.entries(r.form?.properties ?? {})) fields.push(`${JSON.stringify(name)}${req.has(name) ? '' : '?'}: ${isFileField(s) ? 'Blob' : tsType(s)}`);
    const hasInput = fields.length > 0;
    const allOptional = !r.query.some((q) => q.required) && ![...req].length;
    if (hasInput) params.push(`input${allOptional ? '?' : ''}: { ${fields.join('; ')} }`);
    let path = r.path;
    for (const p of r.pathParams) path = path.replace(`{${p.name}}`, `\${encodeURIComponent(${camel(p.name) || 'id'})}`);
    const qNames = r.query.map((q) => q.name);
    out.push('', `  /** ${(r.summary || r.fullName).replace(/\*\//g, '* /')} (${r.method} ${r.path}) */`, `  ${camel(r.fullName)}(${params.join(', ')}): Promise<unknown> {`);
    if (hasInput) {
      out.push('    const all: Record<string, unknown> = { ...(input ?? {}) };');
      out.push(`    const query: Record<string, unknown> = {};`);
      for (const n of qNames) out.push(`    query[${JSON.stringify(n)}] = all[${JSON.stringify(n)}]; delete all[${JSON.stringify(n)}];`);
      out.push(`    return this.call(${JSON.stringify(r.method)}, \`${path}\`, query, ${r.body ? 'all' : r.form ? 'this.form(all)' : 'undefined'});`);
    } else out.push(`    return this.call(${JSON.stringify(r.method)}, \`${path}\`, {}, undefined);`);
    out.push('  }');
  }
  out.push('}', '');
  return out.join('\n');
}

// ─── go ────────────────────────────────────────────────────────────────────────────────
// Go-cased names (golint initialisms), a per-route `<Method>Args` struct (query fields
// tagged `query:"…"`, body fields `json:"…"`; required fields plain values, optional ones
// pointers or nil-able slices/maps), and `Body map[string]any` for the whole JSON body where
// python has `json_body`. Written gofmt-clean by construction: every struct field stands in
// its own comment-led paragraph, so nothing needs column alignment.
const GO_INITIALISMS = new Set(['acl', 'api', 'ascii', 'cpu', 'css', 'dns', 'eof', 'guid', 'html', 'http', 'https', 'id', 'ip', 'json', 'lhs', 'qps', 'ram', 'rhs', 'rpc', 'sla', 'smtp', 'sql', 'ssh', 'tcp', 'tls', 'ttl', 'udp', 'ui', 'uid', 'uuid', 'uri', 'url', 'utf8', 'vm', 'xml', 'xmpp', 'xsrf', 'xss']);
const GO_KEYWORDS = new Set(['break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var']);
// names a method body uses (receiver, locals, packages) or predeclared identifiers
const GO_TAKEN = new Set([...GO_KEYWORDS, 'a', 'p', 'q', 'ctx', 'path', 'payload', 'form', 'files', 'ok', 'context', 'json', 'fmt', 'url', 'strconv', 'nil', 'true', 'false', 'iota', 'string', 'int', 'bool', 'any', 'error', 'byte', 'rune', 'float64', 'len', 'cap', 'new', 'make', 'append', 'copy', 'delete', 'panic', 'print', 'println', 'recover', 'close', 'min', 'max', 'clear']);
const goWord = (w) =>
  GO_INITIALISMS.has(w) ? w.toUpperCase()
    : w.endsWith('s') && GO_INITIALISMS.has(w.slice(0, -1)) ? `${w.slice(0, -1).toUpperCase()}s` // IDs, URLs
      : w[0].toUpperCase() + w.slice(1);
const goPascal = (s) => { const n = words(s).map(goWord).join('') || 'Value'; return /^\d/.test(n) ? `N${n}` : n; };
function goArg(s) {
  const w = words(s);
  let n = w.length ? [w[0], ...w.slice(1).map(goWord)].join('') : 'value';
  if (/^\d/.test(n)) n = `n${n}`;
  return GO_TAKEN.has(n) ? `${n}Arg` : n;
}
const goStr = (s) => JSON.stringify(s); // a JSON string is a valid Go string literal for these names
const goLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// a Go type for a schema, and whether it is a scalar (optional → pointer)
function goType(schema) {
  if (!schema) return { t: 'any', scalar: false };
  if (schema.enum) return schema.enum.every((v) => typeof v === 'string') ? { t: 'string', scalar: true } : { t: 'any', scalar: false };
  let t = Array.isArray(schema.type) ? schema.type.find((x) => x !== 'null') : schema.type;
  if (!t && (schema.anyOf || schema.oneOf)) {
    const ts = [...new Set((schema.anyOf ?? schema.oneOf).map((v) => goType(v).t).filter((x) => x !== 'nil'))];
    if (ts.length === 1 && ['string', 'int', 'float64', 'bool'].includes(ts[0])) return { t: ts[0], scalar: true };
    return { t: 'any', scalar: false };
  }
  if (t === 'null') return { t: 'nil', scalar: false };
  const scalar = { string: 'string', integer: 'int', number: 'float64', boolean: 'bool' }[t];
  if (scalar) return { t: scalar, scalar: true };
  if (t === 'array') {
    const it = goType(schema.items);
    return { t: `[]${it.scalar ? it.t : 'any'}`, scalar: false };
  }
  if (t === 'object' || schema.properties) return { t: 'map[string]any', scalar: false };
  return { t: 'any', scalar: false };
}
const zeroTest = { string: '!= ""', int: '!= 0', float64: '!= 0', bool: '' };

function go() {
  const pkg = args.package && args.package !== true ? args.package : words(BRAND).join('') || 'sdk';
  const taken = new Set();
  const out = [
    `// Code generated by apigen from backend/openapi.json. DO NOT EDIT.`,
    '',
    `package ${pkg}`,
    '',
    'import (',
    '\t"context"',
    '\t"encoding/json"',
    '\t"fmt"',
    ...(HAS_FORM ? ['\t"io"'] : []),
    '\t"net/url"',
    '\t"strconv"',
    ')',
    '',
    '// apigenTransport is the call behind every GeneratedAPI method: the SDK client sends it',
    '// with its own sign-in and unwraps its own response envelope (a few hand-written lines',
    '// in the client, apigenRequest). query is nil or the query string; body is nil (no body)',
    '// or the JSON body. It returns the envelope\'s data, as JSON.',
    'type apigenTransport interface {',
    '\tapigenRequest(ctx context.Context, method, path string, query url.Values, body map[string]any) (json.RawMessage, error)',
    ...(HAS_FORM
      ? [
        '\t// apigenForm sends a file upload: the form fields and the files as multipart/form-data.',
        '\tapigenForm(ctx context.Context, method, path string, query url.Values, form map[string]string, files map[string]FormFile) (json.RawMessage, error)',
      ]
      : []),
    '}',
    '',
    `// GeneratedAPI has all ${routes.length} feature routes of the ${BRAND} API, one method each`,
    '// (generated from the API spec). A method takes the path parameters, then an *<Method>Args',
    '// with the query fields (tagged query) and the JSON body fields (tagged json): required',
    '// fields are plain values, optional ones pointers, slices or maps that nil leaves out,',
    '// and Body passes the whole body. Each returns the response\'s data as JSON.',
    'type GeneratedAPI struct{ c apigenTransport }',
    '',
    '// Ptr returns a pointer to v, for the optional fields of the *Args structs.',
    'func Ptr[T any](v T) *T { return &v }',
  ];
  if (HAS_FORM) {
    out.push(
      '',
      '// FormFile is a file for an upload: the file name it is sent under, and its content.',
      'type FormFile struct {',
      '\tName    string',
      '\tContent io.Reader',
      '}',
    );
  }
  for (const r of routes) {
    let name = goPascal(r.fullName);
    for (let i = 2; taken.has(name); i++) name = `${goPascal(r.fullName)}${i}`;
    taken.add(name);
    const summary = goLine(r.summary).replace(/\.$/, '');
    const argNames = new Set();
    const pathArgs = r.pathParams.map((p) => {
      let a = goArg(p.name);
      for (let i = 2; argNames.has(a); i++) a = `${goArg(p.name)}${i}`;
      argNames.add(a);
      return { name: p.name, arg: a };
    });
    const body = bodyFields(r.bodySchema);
    const hasBody = !!r.bodySchema;
    const fieldNames = new Set(hasBody ? ['Body'] : []);
    const field = (wire, where) => {
      let f = goPascal(wire);
      if (fieldNames.has(f)) f = `${f}${where === 'query' ? 'Query' : 'Field'}`;
      for (let i = 2; fieldNames.has(f); i++) f = `${goPascal(wire)}${i}`;
      fieldNames.add(f);
      return f;
    };
    const fields = [];
    for (const q of r.query) fields.push({ wire: q.name, where: 'query', required: !!q.required, schema: q.schema, ...goType(q.schema), go: field(q.name, 'query') });
    if (body) {
      const req = new Set(body.required);
      for (const [n, s] of Object.entries(body.properties)) fields.push({ wire: n, where: 'body', required: req.has(n), schema: s, ...goType(s), go: field(n, 'body') });
    }
    if (r.form) {
      const req = new Set(r.form.required ?? []);
      for (const [n, s] of Object.entries(r.form.properties)) {
        const file = isFileField(s);
        fields.push({ wire: n, where: file ? 'file' : 'form', required: req.has(n), schema: s, ...(file ? { t: 'FormFile', scalar: true } : goType(s)), go: field(n, 'body') });
      }
    }
    const hasArgs = fields.length > 0 || hasBody;
    const argsType = `${name}Args`;

    // the path, as a Go expression
    const parts = [];
    let rest = r.path;
    for (const p of pathArgs) {
      const i = rest.indexOf(`{${p.name}}`);
      if (i < 0) continue;
      if (i > 0) parts.push(goStr(rest.slice(0, i)));
      parts.push(`url.PathEscape(${p.arg})`);
      rest = rest.slice(i + p.name.length + 2);
    }
    if (rest || !parts.length) parts.push(goStr(rest));

    if (hasArgs) {
      out.push('', `// ${argsType} are the inputs of GeneratedAPI.${name}.`);
      out.push(`type ${argsType} struct {`);
      fields.forEach((f, i) => {
        const optional = !f.required;
        const t = optional && f.scalar ? `*${f.t}` : f.t;
        const notes = [`${goStr(f.wire)} in the ${f.where === 'query' ? 'query' : f.where === 'body' ? 'body' : 'form'}${f.required ? ', required' : ''}.`];
        if (f.where === 'file') notes.push('The file to upload.');
        if (f.schema?.enum) notes.push(`One of: ${f.schema.enum.map((v) => goLine(v)).join(', ')}.`);
        const desc = goLine(f.schema?.description);
        if (desc) notes.push(desc);
        const tag = f.where === 'query' ? `query:${goStr(f.wire)}`
          : f.where === 'form' || f.where === 'file' ? `form:${goStr(f.wire)}`
            : `json:${goStr(f.required ? f.wire : `${f.wire},omitempty`)}`;
        if (i) out.push('');
        out.push(`\t// ${f.go} is ${notes.join(' ')}`, `\t${f.go} ${t} \`${tag}\``);
      });
      if (hasBody) {
        if (fields.length) out.push('');
        out.push('\t// Body is the whole JSON body, for what the fields above do not cover; the fields', '\t// that are set replace its keys.', '\tBody map[string]any `json:"-"`');
      }
      out.push('}');
    }

    const sig = ['ctx context.Context', ...pathArgs.map((p) => `${p.arg} string`)];
    if (hasArgs) sig.push(`p *${argsType}`);
    out.push('', `// ${name} calls ${r.method} ${r.path}${summary ? `: ${summary}` : ''}.`);
    out.push(`func (a *GeneratedAPI) ${name}(${sig.join(', ')}) (json.RawMessage, error) {`);
    if (hasArgs) out.push('\tif p == nil {', `\t\tp = &${argsType}{}`, '\t}');
    const qf = fields.filter((f) => f.where === 'query');
    const bf = fields.filter((f) => f.where === 'body');
    if (qf.length) {
      out.push('\tq := url.Values{}');
      for (const f of qf) {
        if (f.required && f.scalar) out.push(`\tq.Set(${goStr(f.wire)}, ${f.t === 'string' ? `p.${f.go}` : `apigenQueryValue(p.${f.go})`})`);
        else out.push(`\tif p.${f.go} != nil {`, `\t\tq.Set(${goStr(f.wire)}, apigenQueryValue(${f.scalar ? '*' : ''}p.${f.go}))`, '\t}');
      }
    }
    if (hasBody) {
      out.push('\tpayload := apigenBody(p.Body)');
      for (const f of bf) {
        const key = goStr(f.wire);
        if (!f.required) {
          out.push(`\tif p.${f.go} != nil {`, `\t\tpayload[${key}] = ${f.scalar ? '*' : ''}p.${f.go}`, '\t}');
        } else if (f.t === 'string' || !f.scalar) {
          out.push(`\tif p.${f.go} ${f.scalar ? '!= ""' : '!= nil'} {`, `\t\tpayload[${key}] = p.${f.go}`, '\t}');
        } else {
          // a number or boolean that is required is sent as given (zero included), unless
          // Body carries it and the field was left at zero
          out.push(`\tif _, ok := payload[${key}]; !ok || p.${f.go}${zeroTest[f.t] ? ` ${zeroTest[f.t]}` : ''} {`, `\t\tpayload[${key}] = p.${f.go}`, '\t}');
        }
      }
      for (const f of bf.filter((x) => x.required && (x.t === 'string' || !x.scalar))) {
        out.push(`\tif _, ok := payload[${goStr(f.wire)}]; !ok {`, `\t\treturn nil, apigenMissing(${goStr(name)}, ${goStr(f.go)})`, '\t}');
      }
    }
    if (r.form) {
      out.push('\tform := map[string]string{}', '\tfiles := map[string]FormFile{}');
      for (const f of fields.filter((x) => x.where === 'form' || x.where === 'file')) {
        const key = goStr(f.wire);
        const into = f.where === 'file' ? 'files' : 'form';
        const val = (v) => (f.where === 'file' || f.t === 'string' ? v : `apigenQueryValue(${v})`);
        if (!f.required) out.push(`\tif p.${f.go} != nil {`, `\t\t${into}[${key}] = ${val(`${f.scalar ? '*' : ''}p.${f.go}`)}`, '\t}');
        else {
          const unset = f.where === 'file' ? `p.${f.go}.Content == nil` : f.t === 'string' ? `p.${f.go} == ""` : !f.scalar ? `p.${f.go} == nil` : null;
          if (unset) out.push(`\tif ${unset} {`, `\t\treturn nil, apigenMissing(${goStr(name)}, ${goStr(f.go)})`, '\t}');
          out.push(`\t${into}[${key}] = ${val(`p.${f.go}`)}`);
        }
      }
    }
    // a path with parameters is built first: gofmt would pack the `+` inside the call
    if (parts.length > 1) out.push(`\tpath := ${parts.join(' + ')}`);
    if (r.form) out.push(`\treturn a.c.apigenForm(ctx, ${goStr(r.method)}, ${parts.length > 1 ? 'path' : parts[0]}, ${qf.length ? 'q' : 'nil'}, form, files)`, '}');
    else out.push(`\treturn a.c.apigenRequest(ctx, ${goStr(r.method)}, ${parts.length > 1 ? 'path' : parts[0]}, ${qf.length ? 'q' : 'nil'}, ${hasBody ? 'payload' : 'nil'})`, '}');
  }
  out.push(
    '',
    '// apigenBody copies Body, so the fields set over it never change the caller\'s map.',
    'func apigenBody(body map[string]any) map[string]any {',
    '\tout := make(map[string]any, len(body))',
    '\tfor k, v := range body {',
    '\t\tout[k] = v',
    '\t}',
    '\treturn out',
    '}',
    '',
    '// apigenQueryValue writes a query value the way the server reads it: strings as they are,',
    '// numbers and booleans as JSON writes them, anything else as JSON.',
    'func apigenQueryValue(v any) string {',
    '\tswitch x := v.(type) {',
    '\tcase string:',
    '\t\treturn x',
    '\tcase bool:',
    '\t\treturn strconv.FormatBool(x)',
    '\tcase int:',
    '\t\treturn strconv.Itoa(x)',
    '\tcase float64:',
    "\t\treturn strconv.FormatFloat(x, 'f', -1, 64)",
    '\t}',
    '\tb, err := json.Marshal(v)',
    '\tif err != nil {',
    '\t\treturn fmt.Sprint(v)',
    '\t}',
    '\treturn string(b)',
    '}',
    '',
    '// apigenMissing is the error for a required body field that was neither set nor in Body.',
    'func apigenMissing(method, field string) error {',
    '\treturn fmt.Errorf("%s needs %s (or its key in Body)", method, field)',
    '}',
    '',
  );
  return out.join('\n');
}

const text = LANG === 'python' ? python() : LANG === 'go' ? go() : node();
const current = OUT && fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
if (CHECK) {
  console.log(`apigen sdk ${LANG}: ${routes.length} methods — ${current === text ? 'up to date' : 'stale'}`);
  process.exit(current === text ? 0 : 1);
}
fs.writeFileSync(OUT, text);
console.log(`apigen sdk ${LANG}: ${routes.length} methods → ${OUT}`);
