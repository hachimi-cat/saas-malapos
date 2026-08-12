'use client';

import { useMemo, useRef } from 'react';
import {
  AgenticCrudSheet,
  type FieldRendererProps,
  type FieldRenderers,
} from '@forjio/agent-ui';
import { createPlanTransport } from '@/lib/agent-ui-adapters';
import { useModules } from '@/hooks/use-modules';
import { uploadWithPreview } from '@/lib/upload-with-preview';
import type { AssistantMode, AssistantResource } from '@/hooks/use-catentio';
import { buildBulkEditResource, buildCrudResource } from './resources';
import { BULK } from './capabilities';

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

const fieldRenderers: FieldRenderers = {
  date: { render: (props) => <DateField {...props} /> },
};

export interface CatentioCrudSheetProps {
  resource: AssistantResource;
  mode: AssistantMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode: the target row's current values (including `id` — the
   *  apply PATCHes the record the USER picked, never one the plan
   *  names). */
  initial?: Record<string, unknown>;
  onApplied?: () => void;
}

export function CatentioCrudSheet({
  resource,
  mode,
  open,
  onOpenChange,
  initial,
  onApplied,
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
      initial={initial}
      onApplied={() => onApplied?.()}
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
 * The "Edit N selected" sheet. Same body as the single-record sheet —
 * agentic tab, manual form, renderers, uploader — but the descriptor is
 * `buildBulkEditResource`: one PATCH body, blank-means-keep, applied to
 * every selected row through the resource's own edit apply. `initial`
 * is deliberately absent — the form starts blank because a blank field
 * is the instruction to leave that field alone.
 *
 * Both tabs open on the legibility header (bang's original complaint —
 * a blank form over an invisible selection): WHO is being edited
 * ("Editing 4 products: a, b, c +1 more") and what blank means, so the
 * empty manual form is self-explanatory.
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
  onApplied?: () => void;
}) {
  const { modules } = useModules();
  const descriptor = useMemo(
    () => buildBulkEditResource(resource, targets, { modules }),
    [resource, targets, modules],
  );
  const transport = useMemo(
    () => createPlanTransport(resource, 'edit'),
    [resource],
  );
  const n = targets.length;
  const noun = BULK[resource]?.noun ?? 'record';
  const names = targets.slice(0, 3).map(displayName).join(', ');
  const more = n > 3 ? ` +${n - 3} more` : '';
  const editing = `Editing ${n} ${n === 1 ? noun : `${noun}s`}: ${names}${more}. Fields left blank keep each item's current value.`;
  return (
    <AgenticCrudSheet
      resource={descriptor}
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      transport={transport}
      onApplied={() => onApplied?.()}
      fieldRenderers={fieldRenderers}
      imageUploader={(file, cb) => uploadWithPreview(file, cb)}
      descriptions={{
        agentic: `${editing} Describe the change — it will be proposed once and applied to all ${n}.`,
        manual: editing,
      }}
    />
  );
}
