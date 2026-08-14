'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';
import { useCatentioStatus, type AssistantMode, type AssistantResource } from '@/hooks/use-catentio';
// Type-only, so @forjio/agent-ui stays out of THIS module's runtime
// graph — see the dynamic imports below for why that matters.
import type { ApplyOutcome } from './agentic-sheet';

export type { ApplyOutcome };

/**
 * Loaded on demand, for two reasons.
 *
 * The sheet pulls in the whole of @forjio/agent-ui, which no merchant
 * needs until they actually open one — and this component sits on most
 * dashboard pages, so a static import would put that bundle on all of
 * them.
 *
 * It also keeps the package out of the import graph of anything that
 * merely RENDERS a page: `dist/index.js` does `from "./bff-adapters"`
 * with no file extension, which a bundler resolves and plain Node ESM
 * does not, so a static import breaks any vitest suite that mounts a
 * page carrying an entry point. Deferring the import sidesteps it and
 * is the better shape here anyway.
 */
const CatentioCrudSheet = dynamic(
  () => import('./agentic-sheet').then((m) => m.CatentioCrudSheet),
  { ssr: false },
);

const CatentioBulkEditSheet = dynamic(
  () => import('./agentic-sheet').then((m) => m.CatentioBulkEditSheet),
  { ssr: false },
);

const CatentioBulkVerbSheet = dynamic(
  () => import('./agentic-sheet').then((m) => m.CatentioBulkVerbSheet),
  { ssr: false },
);

/**
 * One create/edit entry point, assistant-aware (storlaunch's
 * agentic-entry.tsx is the reference).
 *
 * A page says what the surface IS, and this owns the rest:
 *
 *   <AgenticEntry
 *     resource="products"
 *     mode="create"
 *     onApplied={load}
 *     fallback={<Button onClick={openModal}>New product</Button>}
 *   >
 *     New product
 *   </AgenticEntry>
 *
 * `fallback` is what renders when the assistant is off for this account
 * — always the page's existing hand-built control, never nothing. The
 * flag decides which trigger the merchant sees; the backend re-checks on
 * every call regardless, so this is presentation only.
 *
 * The sheet is mounted only while open so each open gets a fresh
 * transport (fresh agent history) and a fresh draft — the package keeps
 * both for the life of the component.
 *
 * ONE button, never a split. "New X covers single AND batch" (bang)
 * was briefly read as a chevron offering "New {noun}" / "Bulk new
 * {noun}s" — but both items opened the same sheet onto the same form,
 * because the create sheet's Manual tab has always taken a whole batch
 * ("+ Add another", CSV paste). A menu whose two entries do the
 * identical thing is not an affordance, it is a question the merchant
 * has to answer twice (bang, 2026-08-14: *"just lose the dropdown and
 * separate bulk button if the form is exactly the same"*). With the
 * assistant off the fallback renders alone — the sheet, and with it the
 * batch path, is a sheet feature per the agentic-only-entries-hide rule.
 */
export interface AgenticEntryProps {
  resource: AssistantResource;
  mode: AssistantMode;
  /** Edit mode: the row's current values, including `id`. The apply
   *  PATCHes the record the USER opened, never one a plan names. */
  initial?: Record<string, unknown>;
  onApplied?: (outcome: ApplyOutcome) => void;
  /** Rendered when the assistant is off — the page's own control. */
  fallback: ReactNode;
  /** Trigger content when the assistant is on. */
  children: ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
}

export function AgenticEntry({
  resource,
  mode,
  initial,
  onApplied,
  fallback,
  children,
  className,
  title,
  disabled,
}: AgenticEntryProps) {
  const { enabled } = useCatentioStatus();
  const [open, setOpen] = useState(false);

  if (!enabled) return <>{fallback}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        title={title}
        disabled={disabled}
      >
        {children}
      </button>
      {open && (
        <CatentioCrudSheet
          resource={resource}
          mode={mode}
          open
          onOpenChange={(o) => {
            if (!o) setOpen(false);
          }}
          initial={initial}
          onApplied={(outcome) => onApplied?.(outcome)}
        />
      )}
    </>
  );
}

/**
 * "Ask assistant" — the entry for a page that IS the form.
 *
 * The rest of the portal follows bang's 2026-08-12 entry-point rule:
 * *"there is no ask assistant label button anymore, should be action
 * button"*. A list page has real verbs (New X, Edit, Delete), so a
 * button labelled after the MECHANISM rather than the action was noise.
 *
 * A singleton settings screen is the exception bang carved out on
 * 2026-08-14: *"for page that directly rendered form like ... payment
 * providers, payment method, payment template ..., for the action item,
 * instead of using action keyword like edit, you can use ask assistant
 * with sparkle icon. this is only for page with open form"*.
 *
 * The reasoning holds: on those pages "Edit" is a lie. The form is
 * already open, every field is already on screen, and the page has its
 * own Save — there is nothing for an Edit button to reveal. What the
 * button actually offers is the assistant, so that is what it says.
 *
 * ONE component rather than an `agentOnly` prop on AgenticEntry,
 * because the three parts only make sense together: the sparkle, the
 * label, and a sheet with no Manual tab (the manual path is the page
 * itself). Split across props, a page could grow a sparkle that still
 * opens a duplicate form, or an agent-only sheet still labelled Edit.
 *
 * No `fallback`: with the assistant off the page's own form is already
 * the whole manual experience, so the right thing to render is nothing.
 *
 * malapos had NO agentic entry on these three pages at all, so this
 * arrived with the capability rather than as a relabel of one (bang,
 * 2026-08-14: *"add them"*).
 */
export function AskAssistantEntry({
  resource,
  mode = 'edit',
  initial,
  targets,
  onApplied,
  className,
  label = 'Ask assistant',
  disabled,
}: {
  resource: AssistantResource;
  /** Defaults to `edit` — these pages all edit one standing record. */
  mode?: AssistantMode;
  /** The record as it stands, so the agent reads the current values. */
  initial?: Record<string, unknown>;
  /**
   * ALL the records this page's form covers, when it covers more than
   * one. Present -> the sheet is the batch-EDIT descriptor over every
   * one of them, so a single instruction reaches the lot: *"please make
   * my checkout, invoice and receipt template the same theme"* (bang,
   * 2026-08-14). The agent plans against the resource's own declared
   * edit fields, knowing nothing about rows; `mergePlan` fans that one
   * proposal across every record, and Apply PATCHes only the ones it
   * actually changed.
   *
   * This is NOT a selection surface — there are no tick boxes and
   * nothing to choose. The page IS the form, and the form covers these
   * records.
   */
  targets?: Record<string, unknown>[];
  /** Apply writes straight through; the page refetches here (bang chose
   *  save-straight-through over filling the page's form). */
  onApplied?: () => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}) {
  const { enabled } = useCatentioStatus();
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  const batch = targets !== undefined;
  // A batch entry over an empty set would open a sheet naming nothing
  // and applying to nothing. Disable the trigger instead, so the page's
  // shape does not flicker while the list loads.
  const empty = batch && targets.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        disabled={disabled || empty}
      >
        <Sparkles className="h-4 w-4" /> {label}
      </button>
      {open && !empty && (
        batch ? (
          <CatentioBulkEditSheet
            resource={resource}
            targets={targets}
            open
            agentOnly
            onOpenChange={(o) => {
              if (!o) setOpen(false);
            }}
            onApplied={() => onApplied?.()}
          />
        ) : (
          <CatentioCrudSheet
            resource={resource}
            mode={mode}
            open
            agentOnly
            onOpenChange={(o) => {
              if (!o) setOpen(false);
            }}
            initial={initial}
            onApplied={() => onApplied?.()}
          />
        )
      )}
    </>
  );
}

/**
 * Whether this slot opened over a real selection — decided ONCE, at
 * mount. A partial run makes the page refetch behind the open sheet,
 * which can empty the page's derived targets (the records that DID go
 * through are gone from the list); re-reading them here would tear the
 * sheet down mid-error, taking the message and the retry with it. The
 * sheet pins the rows it acts on for the same reason.
 */
function useOpenedWithTargets(targets: Record<string, unknown>[]): boolean {
  const [opened] = useState(() => targets.length > 0);
  return opened;
}

/**
 * The "Edit N selected" sheet, mounted by a list page while the Actions
 * dropdown's Bulk edit is open. Same dynamic-import and assistant-gating
 * rules as everything above; the caller keeps the open state (the
 * selected rows ARE the state). Pages offer Bulk edit only when
 * `useCatentioStatus().enabled` — bulk edit is a sheet feature, so with
 * the assistant off the Actions dropdown offers Delete alone.
 *
 * `onApplied` reports HOW the apply ended (see `ApplyOutcome`): on
 * 'partial' the sheet is still open over the records that did not go
 * through, so the page must refetch and leave both the sheet and the
 * selection alone.
 */
export function BulkEditSlot({
  resource,
  targets,
  onClose,
  onApplied,
}: {
  resource: AssistantResource;
  /** The selected rows, each with `id` plus whatever parent ids the
   *  resource's edit apply reads. */
  targets: Record<string, unknown>[];
  onClose: () => void;
  onApplied?: (outcome: ApplyOutcome) => void;
}) {
  const { enabled } = useCatentioStatus();
  const anyTargets = useOpenedWithTargets(targets);
  if (!enabled || !anyTargets) return null;
  return (
    <CatentioBulkEditSheet
      resource={resource}
      targets={targets}
      open
      onOpenChange={(o: boolean) => {
        if (!o) onClose();
      }}
      onApplied={(outcome) => onApplied?.(outcome)}
    />
  );
}

/**
 * The "{Verb} N selected" sheet — BulkEditSlot's twin for every other
 * declared verb (delete, publish, unpublish, approve, void,
 * set-category). Same rules: dynamic import, assistant-gated, caller
 * keeps the open state because the selected rows ARE the state.
 *
 * A page offers the agentic verb only while the assistant is on; with
 * it off the dropdown item runs the page's own manual batch flow (the
 * delete confirm, the category dialog) instead. That is the
 * agentic-only-entries-hide rule — the fallback is always the
 * hand-built control, never nothing.
 *
 * `onApplied` reports HOW the apply ended (see `ApplyOutcome`): on
 * 'partial' the sheet is still open over the records that did not go
 * through, so the page must refetch and leave both the sheet and the
 * selection alone.
 */
export function BulkVerbSlot({
  resource,
  verb,
  targets,
  onClose,
  onApplied,
}: {
  resource: AssistantResource;
  /** A verb from `BULK_VERBS[resource]` (capabilities.ts). */
  verb: AssistantMode;
  /** The selected rows, each with `id` plus whatever the verb's apply
   *  reads off the row (an affiliate row's `programId`). */
  targets: Record<string, unknown>[];
  onClose: () => void;
  onApplied?: (outcome: ApplyOutcome) => void;
}) {
  const { enabled } = useCatentioStatus();
  const anyTargets = useOpenedWithTargets(targets);
  if (!enabled || !anyTargets) return null;
  return (
    <CatentioBulkVerbSheet
      resource={resource}
      verb={verb}
      targets={targets}
      open
      onOpenChange={(o: boolean) => {
        if (!o) onClose();
      }}
      onApplied={(outcome) => onApplied?.(outcome)}
    />
  );
}

/**
 * The same thing for a surface that has no trigger of its own — a
 * settings page whose "form" IS the page. The caller keeps the open
 * state (usually a toolbar button it already had) and this just mounts
 * the sheet when the assistant is on.
 */
export function AgenticSheetSlot({
  resource,
  mode,
  open,
  onClose,
  initial,
  onApplied,
}: {
  resource: AssistantResource;
  mode: AssistantMode;
  open: boolean;
  onClose: () => void;
  initial?: Record<string, unknown>;
  onApplied?: (outcome: ApplyOutcome) => void;
}) {
  const { enabled } = useCatentioStatus();
  if (!enabled || !open) return null;
  return (
    <CatentioCrudSheet
      resource={resource}
      mode={mode}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      initial={initial}
      onApplied={(outcome) => onApplied?.(outcome)}
    />
  );
}
