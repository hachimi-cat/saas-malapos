import type { CrudResource, CrudSchemaField } from '@forjio/agent-ui';
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

/**
 * `CrudResource` widened twice, the storlaunch shape:
 *
 *  - `TAction = AssistantMode` — descriptors are built per action name
 *    ('create', 'edit', 'delete', 'publish', 'mark-paid', …), not just
 *    the classic pair;
 *  - `apply` returns the WRITTEN RECORD (not void) so the docked
 *    chat's `$n` cross-refs can read the created id back. The sheet
 *    has no use for the result — `buildCrudResource` swallows it.
 */
export type ResourceWithResult = Omit<CrudResource<Fields, AssistantMode>, 'apply'> & {
  apply(args: {
    mode: AssistantMode;
    fields: Fields;
    initial?: Partial<Fields>;
  }): Promise<unknown>;
};

export type ResourceBuilder = (
  mode: AssistantMode,
  ctx?: ResourceContext,
) => ResourceWithResult | null;

// The transport (lib/agent-ui-adapters.ts) parses this envelope back
// into the structured {prompt, draft, history} pieces the BFF wants —
// the BFF writes the actual agent prompt server-side, so no prose or
// schema text belongs here.
export const buildAgentPrompt: CrudResource<Fields, AssistantMode>['buildAgentPrompt'] = ({
  draft,
  userPrompt,
  history,
}) => JSON.stringify({ prompt: userPrompt, draft, history });

// ── verb descriptors (0.20 knobs) ───────────────────────────────────

/**
 * A descriptor for a verb that targets ONE record — delete, publish,
 * unpublish, mark-paid. Unlike a create/edit form it usually carries no
 * fields (the id IS the payload, arriving via `initial`: the row the
 * user opened, or the id the agent looked up and the BFF validated),
 * so the 0.20 sheet knobs are set for a verb: an honest `title` +
 * `confirmLabel` instead of the New/Edit inference, no default
 * seeding, no templates strip, and `destructive` routes the sheet's
 * Apply through the alert-dialog confirm.
 */
export function verbDescriptor(opts: {
  slug: string;
  /** The noun, e.g. 'blog post' — used in titles and errors. */
  label: string;
  /** Sheet title, e.g. 'Publish blog post'. */
  title: string;
  /** Submit/confirm button verb, e.g. 'Publish'. */
  confirmLabel: string;
  destructive?: boolean;
  /** The verb's own fields, if any (mark-paid's optional reference). */
  fields?: CrudSchemaField[];
  examplePrompts: string[];
  apply: (args: { fields: Fields; initial?: Partial<Fields> }) => Promise<unknown>;
}): ResourceWithResult {
  return {
    slug: opts.slug,
    label: opts.label,
    title: opts.title,
    confirmLabel: opts.confirmLabel,
    destructive: opts.destructive ?? false,
    seedDefaults: false,
    showTemplates: false,
    fields: opts.fields ?? [],
    examplePrompts: opts.examplePrompts,
    buildAgentPrompt,
    apply: ({ fields, initial }) => opts.apply({ fields, initial }),
  };
}

/** The record a verb targets — `initial.id` is the ONLY id ever acted
 *  on (the row the user opened / the id the BFF validated), never one
 *  a plan or draft names. */
export function verbTargetId(initial: Partial<Fields> | undefined, what: string): string {
  const id = str(initial?.id);
  if (!id) throw new Error(`Missing ${what} id`);
  return id;
}

/** The delete verb, shared by every wave-1 resource that declares it:
 *  destructive chrome + confirm, no fields, `del` is the same api call
 *  the list page's own AlertDialog flow makes. */
export function deleteDescriptor(opts: {
  slug: string;
  label: string;
  del: (id: string) => Promise<unknown>;
}): ResourceWithResult {
  return verbDescriptor({
    slug: opts.slug,
    label: opts.label,
    title: `Delete ${opts.label}`,
    confirmLabel: 'Delete',
    destructive: true,
    examplePrompts: [`Delete this ${opts.label}`],
    apply: ({ initial }) => opts.del(verbTargetId(initial, opts.label)),
  });
}

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
