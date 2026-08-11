import type { CrudResource } from '@forjio/agent-ui';
import type { ModulesState } from '@/hooks/use-modules';
import type { AssistantMode } from '@/hooks/use-catentio';

/**
 * Shared pieces for the per-group descriptor modules under ./resources/.
 * They live here (not in resources.ts) so a group module and the
 * registry never import each other — resources.ts imports the groups,
 * the groups import only this file.
 */

export type Fields = Record<string, unknown>;

/**
 * State the form needs that is NOT in the draft. A panel can be gated on
 * something the merchant's workspace is rather than something the record
 * says — e.g. a marketing block that follows the Ripllo module — and
 * `visibleWhen` only ever sees the draft. The mount reads the module
 * flags (`useModules`) and passes them down; a descriptor closes over
 * them. Undefined modules mean "not loaded yet", and a gated panel stays
 * hidden until proven on, matching `modules.marketing === true` on the
 * pages.
 */
export interface ResourceContext {
  modules?: ModulesState;
}

export type ResourceBuilder = (
  mode: AssistantMode,
  ctx?: ResourceContext,
) => CrudResource<Fields> | null;

// The transport (lib/agent-ui-adapters.ts) parses this envelope back
// into the structured {prompt, draft, history} pieces the BFF wants —
// the BFF writes the actual agent prompt server-side, so no prose or
// schema text belongs here.
export const buildAgentPrompt: CrudResource<Fields>['buildAgentPrompt'] = ({
  draft,
  userPrompt,
  history,
}) => JSON.stringify({ prompt: userPrompt, draft, history });

// ── shared coercion helpers (chat-actions.ts semantics) ─────────────

/** Build a payload of only the fields the caller actually set —
 *  omitted keys stay untouched on PATCH. */
export function defined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/** Nullable pass-through: null clears, string sets, absent stays. */
export function strOrNull(v: unknown): string | null | undefined {
  return v === null ? null : typeof v === 'string' ? v : undefined;
}

/** Non-empty trimmed string, else undefined ("leave it alone"). */
export function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

/** Finite number, else undefined — blank repeater cells ('') stay
 *  omitted rather than becoming 0 or null. */
export function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Checkbox values arrive as the STRINGS 'true'/'false' from agent-ui
 *  controls; a real boolean passes through. Anything else is undefined. */
export function bool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/** Number-or-null: '' and null clear (for absent-clears edit forms),
 *  a finite number sets, undefined stays. */
export function numOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
