'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';
import { useCatentioStatus, type AssistantMode, type AssistantResource } from '@/hooks/use-catentio';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Loaded on demand, for two reasons.
 *
 * The sheet pulls in the whole of @forjio/agent-ui, which no merchant
 * needs until they actually open one — and this component will sit on
 * most dashboard pages, so a static import would put that bundle on all
 * of them.
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
 */
export interface AgenticEntryProps {
  resource: AssistantResource;
  mode: AssistantMode;
  /** Edit mode: the row's current values, including `id`. The apply
   *  PATCHes the record the USER opened, never one a plan names. */
  initial?: Record<string, unknown>;
  onApplied?: () => void;
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
          onApplied={() => onApplied?.()}
        />
      )}
    </>
  );
}

/** One entry on a multi-resource page. `label` is the merchant's word
 *  for the thing, singular — "Purchase order", "Refund". The picker
 *  builds the sentence around it. */
export interface AssistantOption {
  resource: AssistantResource;
  label: string;
  /** One line on what this covers, when the label alone is ambiguous. */
  hint?: string;
}

/**
 * The PAGE-level assistant entry — the sparkle button that lives in the
 * page header (next to the page's own `+ New`, via PageHeader's
 * `action` slot). It takes no `initial` and no caller-computed `mode`:
 * the header button covers the WHOLE page, without needing a tab or
 * card selection first. Per-record entries still exist — they belong
 * next to the record, as `+ New` and a row pencil.
 */
export function PageAssistant({
  resource,
  options,
  onApplied,
  label = 'Ask assistant',
}: {
  /** Single-resource page — the common case. */
  resource?: AssistantResource;
  /** Multi-resource page. ONE sparkle covers all of them, so the
   *  merchant picks what they meant after clicking rather than choosing
   *  between two identical buttons in the header. */
  options?: readonly AssistantOption[];
  onApplied?: () => void;
  label?: string;
}) {
  const { enabled } = useCatentioStatus();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<AssistantResource | null>(null);

  const list: readonly AssistantOption[] =
    options ?? (resource ? [{ resource, label: '' }] : []);

  if (!enabled || list.length === 0) return null;

  // One resource -> no picker at all, so every existing call site keeps
  // exactly the behaviour it had.
  const active = list.length === 1 ? list[0]!.resource : picked;

  const close = () => {
    setOpen(false);
    setPicked(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setPicked(null);
          setOpen(true);
        }}
      >
        <Sparkles />
        {label}
      </Button>
      {open && !active && (
        <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">What would you like to work on?</DialogTitle>
              <DialogDescription>
                This page has more than one kind of record.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {list.map((o) => (
                <button
                  key={o.resource}
                  type="button"
                  onClick={() => setPicked(o.resource)}
                  className="rounded-lg border border-border bg-card px-4 py-3 text-left text-sm transition hover:border-primary/50 hover:bg-secondary"
                >
                  <span className="font-medium">{o.label}</span>
                  {o.hint && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {open && active && (
        <CatentioCrudSheet
          resource={active}
          mode="create"
          open
          onOpenChange={(o) => {
            if (!o) close();
          }}
          onApplied={() => onApplied?.()}
        />
      )}
    </>
  );
}

/**
 * The "Edit N selected" sheet, mounted by a list page while its bulk
 * bar's Edit is open. Same dynamic-import and assistant-gating rules as
 * everything above; the caller keeps the open state (the selected rows
 * ARE the state). Pages show the Edit button itself only when
 * `useCatentioStatus().enabled` — bulk edit is a sheet feature, so with
 * the assistant off the bar offers Delete alone.
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
  onApplied?: () => void;
}) {
  const { enabled } = useCatentioStatus();
  if (!enabled || targets.length === 0) return null;
  return (
    <CatentioBulkEditSheet
      resource={resource}
      targets={targets}
      open
      onOpenChange={(o: boolean) => {
        if (!o) onClose();
      }}
      onApplied={() => onApplied?.()}
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
  onApplied?: () => void;
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
      onApplied={() => onApplied?.()}
    />
  );
}
