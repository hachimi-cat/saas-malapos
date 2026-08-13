'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown } from 'lucide-react';
import { useCatentioStatus, type AssistantMode, type AssistantResource } from '@/hooks/use-catentio';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { BULK } from './capabilities';
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
 * `split` is the "New X covers single AND batch" contract (bang): on a
 * bulk-create-capable resource (BULK) the header's New X renders as a
 * split button — the main segment opens the create sheet exactly as
 * before, the attached chevron offers "New {noun}" and "Bulk new
 * {noun}s". Both land on the same create sheet (its Manual tab takes a
 * whole batch — "+ Add another", CSV paste); the menu is the affordance
 * that says the batch path exists. On a resource without BULK, `split`
 * is inert and the plain button renders. With the assistant off, the
 * fallback renders alone — the sheet (and with it the batch path) is a
 * sheet feature, per the agentic-only-entries-hide rule.
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
  /** Header "New X" on a BULK resource: render the split button. */
  split?: boolean;
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
  split,
}: AgenticEntryProps) {
  const { enabled } = useCatentioStatus();
  const [open, setOpen] = useState(false);

  if (!enabled) return <>{fallback}</>;

  const bulk = split && mode === 'create' ? BULK[resource] : undefined;

  return (
    <>
      {bulk ? (
        <div className="inline-flex">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(className, 'rounded-r-none')}
            title={title}
            disabled={disabled}
          >
            {children}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`More ways to add ${bulk.noun}s`}
                className={cn(
                  className,
                  'rounded-l-none border-l border-primary-foreground/30 px-2',
                )}
                disabled={disabled}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setOpen(true)}>
                New {bulk.noun}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpen(true)}>
                Bulk new {bulk.noun}s
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={className}
          title={title}
          disabled={disabled}
        >
          {children}
        </button>
      )}
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
