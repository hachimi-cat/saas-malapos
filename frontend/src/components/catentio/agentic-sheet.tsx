'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AgenticCrudSheet,
  type FieldRendererProps,
  type FieldRenderers,
} from '@forjio/agent-ui';
import { createPlanTransport } from '@/lib/agent-ui-adapters';
import { useModules } from '@/hooks/use-modules';
import { uploadWithPreview } from '@/lib/upload-with-preview';
import type { AssistantMode, AssistantResource } from '@/hooks/use-catentio';
import {
  BATCH_TARGETS_FIELD,
  batchDoingLine,
  batchTargetsInitial,
  buildBulkEditResource,
  buildBulkEditRows,
  buildBulkVerbResource,
  buildCrudResource,
} from './resources';
import { BULK, pluralNoun } from './capabilities';

/**
 * Malapos's flavour of the extracted catentio sheet (storlaunch's
 * agentic-sheet.tsx is the reference). Thin on purpose: descriptor +
 * transport wiring only — the sheet body, the agentic conversation and
 * the manual form all come from @forjio/agent-ui.
 *
 * Mount it only while open (`{open && <CatentioCrudSheet … open />}`)
 * so every open gets a fresh transport (fresh agent history) and a
 * fresh draft — the package keeps both for the life of the component.
 */

/** The 'date' kind renderer — purchase-order expiry dates and the like.
 *  Reuses the exact control the hand-built forms use
 *  (`<input type="date">`, yyyy-mm-dd), so a record created through the
 *  sheet carries the same shape as one typed by hand. A plan may propose
 *  a full ISO instant; trim it to the date part for the input's sake and
 *  let the resource's own coercion normalise on the way out. */
function DateField({ field, value, onChange }: FieldRendererProps) {
  const raw = typeof value === 'string' ? value : '';
  return (
    <input
      type="date"
      id={`crud-${field.name}`}
      value={raw.length > 10 ? raw.slice(0, 10) : raw}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
    />
  );
}

/** The 'static' kind — a read-only line whose value rides in on the
 *  mount's `initial` (today: the batch sheets' target list). It renders
 *  text and produces no input, so nothing the merchant does can change
 *  it and no apply reads it. */
function StaticField({ value }: FieldRendererProps) {
  return (
    <p className="text-sm text-muted-foreground">
      {typeof value === 'string' && value ? value : '—'}
    </p>
  );
}

const fieldRenderers: FieldRenderers = {
  date: { render: (props) => <DateField {...props} /> },
  static: { render: (props) => <StaticField {...props} /> },
};

/**
 * How an apply ENDED, which for a batch is not a yes/no question.
 *
 *  - 'applied' — everything the sheet was asked to do went through. The
 *    sheet has already closed itself; the page may clear its selection.
 *  - 'partial' — some records changed and some did not. The sheet is
 *    STILL OPEN over the failures with the error shown verbatim, so the
 *    merchant can read it and retry. The list behind it is stale and
 *    must be refetched, but the page must NOT close the sheet or drop
 *    the selection out from under it.
 *
 * The sheet reports the second case by calling `onApplied` with no
 * result (@forjio/agent-ui >= 0.21.0 — its `isPartialApply` branch);
 * a clean apply always hands over the merged field set, which is an
 * object, so the two can never be confused.
 */
export type ApplyOutcome = 'applied' | 'partial';

function outcomeOf(result: unknown): ApplyOutcome {
  return result === undefined ? 'partial' : 'applied';
}

export interface CatentioCrudSheetProps {
  resource: AssistantResource;
  mode: AssistantMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode: the target row's current values (including `id` — the
   *  apply PATCHes the record the USER picked, never one the plan
   *  names). */
  initial?: Record<string, unknown>;
  onApplied?: (outcome: ApplyOutcome) => void;
  /** Drop the Manual tab entirely — for a page that IS the form (see
   *  AskAssistantEntry). The package does not merely HIDE the pane: a
   *  hidden manual editor would still seed the shared draft from its
   *  defaultValues and still evaluate visibleWhen, so a form nobody can
   *  see could win an argument with the reviewed plan. */
  agentOnly?: boolean;
}

export function CatentioCrudSheet({
  resource,
  mode,
  open,
  onOpenChange,
  initial,
  onApplied,
  agentOnly,
}: CatentioCrudSheetProps) {
  // Module state gates whole panels the draft knows nothing about
  // (payments/fulfillment/marketing blocks follow the partner modules),
  // so it is read here and threaded into the descriptor rather than
  // guessed at field level.
  const { modules } = useModules();
  const descriptor = useMemo(
    () => buildCrudResource(resource, mode, { modules }),
    [resource, mode, modules],
  );
  // The transport closes over the edit target via a ref so the plan
  // request always carries the CURRENT record as `initial` without the
  // transport (and its turn history) being rebuilt per render.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const transport = useMemo(
    () => createPlanTransport(resource, mode, () => initialRef.current),
    [resource, mode],
  );
  return (
    <AgenticCrudSheet
      resource={descriptor}
      mode={mode}
      open={open}
      onOpenChange={onOpenChange}
      transport={transport}
      agentOnly={agentOnly}
      initial={initial}
      onApplied={(result) => onApplied?.(outcomeOf(result))}
      fieldRenderers={fieldRenderers}
      // The SAME uploader the hand-built product form calls — the
      // presign endpoint and the error envelope stay in one place, so an
      // image attached through the sheet is byte-for-byte one attached
      // through the product form.
      imageUploader={(file, cb) => uploadWithPreview(file, cb)}
      descriptions={{
        agentic:
          'Tell the assistant what you want — it will ask for anything missing, then propose the exact fields for review.',
        manual: 'Edit fields directly.',
      }}
    />
  );
}

/** What to call one selected row in the bulk-edit header. Rows carry
 *  whatever the list carried; try the fields a merchant would recognise
 *  before falling back to the id. */
const DISPLAY_KEYS = [
  'name',
  'title',
  'label',
  'code',
  'email',
  'url',
  'id',
] as const;

function displayName(row: Record<string, unknown>): string {
  for (const key of DISPLAY_KEYS) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) {
      return v.length > 40 ? `${v.slice(0, 37)}…` : v;
    }
    if (typeof v === 'number') return String(v);
  }
  return 'record';
}

/**
 * The rows a batch sheet runs on, pinned at the moment it opened —
 * "the rows you ticked; this runs on these and nothing else".
 *
 * A page derives its targets from the CURRENT list
 * (`rows.filter((r) => selected.has(r.id))`), so a refetch behind an
 * open sheet rewrites them. That refetch is now the normal path: a
 * partial run tells the page to reload, and the records that DID go
 * through vanish from the list. Left live, the open sheet would silently
 * re-title itself mid-flight ("Delete 3 categories" → "1 category"), and
 * — worse — rebuild its descriptor, throwing away the closure that
 * remembers who already succeeded, so the retry would fire at deleted
 * records all over again.
 */
function useFrozenTargets(
  targets: Record<string, unknown>[],
): Record<string, unknown>[] {
  const [frozen] = useState(targets);
  return frozen;
}

/** WHO is about to be touched — the legibility header both batch
 *  sheets open on (bang's original complaint: a form over an invisible
 *  selection). First three by name, the rest counted. */
function targetList(targets: Record<string, unknown>[]): string {
  const names = targets.slice(0, 3).map(displayName).join(', ');
  return targets.length > 3 ? `${names} +${targets.length - 3} more` : names;
}

/**
 * The "Edit N selected" sheet. Same body as the single-record sheet —
 * agentic tab, manual form, renderers, uploader — but the descriptor is
 * `buildBulkEditResource`: ONE FORM PER SELECTED RECORD, each seeded
 * from that record and applied back to it through the resource's own
 * edit apply.
 *
 * It used to open BLANK over the selection, on a shared patch where a
 * blank field meant "leave this one alone" — which made the commonest
 * case (fix a typo on three of the ten) impossible to see, and needed a
 * sentence of explanation before the form made sense at all. Both tabs
 * still open on the legibility header naming WHO is being edited
 * ("Editing 4 products: a, b, c +1 more"); the form itself is now
 * self-evident.
 */
export function CatentioBulkEditSheet({
  resource,
  targets,
  open,
  onOpenChange,
  onApplied,
}: {
  resource: AssistantResource;
  /** The selected rows, each with `id` (and whatever parent ids the
   *  resource's edit apply reads — a variant's productId travels here). */
  targets: Record<string, unknown>[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: (outcome: ApplyOutcome) => void;
}) {
  const { modules } = useModules();
  const rows = useFrozenTargets(targets);
  const descriptor = useMemo(
    () => buildBulkEditResource(resource, rows, { modules }),
    [resource, rows, modules],
  );
  const transport = useMemo(
    () => createPlanTransport(resource, 'edit'),
    [resource],
  );
  // One form per selected record, each seeded with that record's own
  // current values (bang, 2026-08-14). Derived from the descriptor, so
  // the seeded keys are exactly the fields it renders.
  const initial = useMemo(() => buildBulkEditRows(descriptor, rows), [descriptor, rows]);
  const n = rows.length;
  const noun = BULK[resource]?.noun ?? 'record';
  const editing = `Editing ${n} ${pluralNoun(resource, n)}: ${targetList(rows)}. Each one is filled in with its current values — change what you want; saving writes each record back.`;
  return (
    <AgenticCrudSheet
      resource={descriptor}
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      transport={transport}
      initial={initial}
      onApplied={(result) => onApplied?.(outcomeOf(result))}
      fieldRenderers={fieldRenderers}
      imageUploader={(file, cb) => uploadWithPreview(file, cb)}
      descriptions={{
        agentic: `${editing} Describe the change — it will be proposed once and filled into all ${n} below.`,
        manual: editing,
      }}
    />
  );
}

/**
 * The "{Verb} N selected" sheet — bulk edit's shape, for every OTHER
 * declared verb (delete, publish, unpublish, approve, void,
 * set-category). Same body as the single-record sheet; the descriptor
 * is `buildBulkVerbResource`, so one plan turn produces the verb's
 * fields once (or none at all) and the apply fans them over the
 * selection through the resource's own single-record apply — or, where
 * the backend has a real ids[] route, hands the whole selection over in
 * one request.
 *
 * `initial` seeds ONE key and one only: the read-only target line
 * (`batchTargetsInitial`). No record's values are seeded — there is no
 * single current record, and each target's own row is passed at apply
 * time so parent-id reads (a commission's programId) keep working. The
 * line is what the sheet is about (WHO the verb runs on) and it is also
 * load-bearing: the package disables Apply while the draft has no keys,
 * and a fieldless verb — delete, publish, unpublish, approve, void, so
 * ten of the eleven wired here — has nothing else to put one there.
 * Without it the sheet opens correctly and can never be applied.
 *
 * The verb's declared chrome travels with the descriptor — a
 * destructive verb keeps the sheet's alert-dialog confirm.
 */
export function CatentioBulkVerbSheet({
  resource,
  verb,
  targets,
  open,
  onOpenChange,
  onApplied,
}: {
  resource: AssistantResource;
  /** A verb from `BULK_VERBS[resource]` — never 'create'/'edit'. */
  verb: AssistantMode;
  /** The selected rows, each with `id` plus whatever the verb's apply
   *  reads off the row (an affiliate row's `programId`). */
  targets: Record<string, unknown>[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: (outcome: ApplyOutcome) => void;
}) {
  const { modules } = useModules();
  const rows = useFrozenTargets(targets);
  const descriptor = useMemo(
    () => buildBulkVerbResource(resource, verb, rows, { modules }),
    [resource, verb, rows, modules],
  );
  const transport = useMemo(
    () => createPlanTransport(resource, verb),
    [resource, verb],
  );
  const n = rows.length;
  const names = targetList(rows);
  const doing = batchDoingLine(descriptor, names, verb);
  // The target line is always there now, so "nothing to fill in" means
  // nothing BESIDES it — set-category is the only verb that asks.
  const asks = descriptor.fields.some((f) => f.name !== BATCH_TARGETS_FIELD);
  return (
    <AgenticCrudSheet
      resource={descriptor}
      mode={verb}
      open={open}
      onOpenChange={onOpenChange}
      transport={transport}
      initial={batchTargetsInitial(names)}
      onApplied={(result) => onApplied?.(outcomeOf(result))}
      fieldRenderers={fieldRenderers}
      imageUploader={(file, cb) => uploadWithPreview(file, cb)}
      descriptions={{
        agentic: asks
          ? `${doing} Say what you want and it will be proposed once, then applied to all ${n}.`
          : `${doing} Nothing to fill in — review the list and apply.`,
        manual: doing,
      }}
    />
  );
}
