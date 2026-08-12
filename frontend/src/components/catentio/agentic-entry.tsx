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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BULK, BULK_EDIT_RESOURCES } from './capabilities';

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
  /** This resource's checked table rows, when its table is on the page. */
  selection?: readonly Record<string, unknown>[];
  /** This resource's bulk-delete executor (the same function the bulk
   *  bar's confirm calls). The picker owns its own confirm dialog. */
  onDeleteSelected?: () => Promise<void> | void;
  /** The merchant's word for one record, lowercase ("product"). Falls
   *  back to the BULK noun, then the lowercased label. */
  noun?: string;
}

type PageAction = 'create' | 'bulk-create' | 'edit' | 'bulk-edit' | 'delete';

/**
 * The PAGE-level assistant entry — the sparkle button that lives in the
 * page header (next to the page's own `+ New`, via PageHeader's
 * `action` slot). It takes no `initial` and no caller-computed `mode`:
 * the header button covers the WHOLE page. Per-record entries still
 * exist — they belong next to the record, as `+ New` and a row pencil.
 *
 * It opens an ACTION picker, never the create form directly (bang,
 * 2026-08-11: a sparkle that lands on the same manual form as the
 * page's own `+ New` is just a second New button). New / Bulk new are
 * always offered; Edit / Bulk edit / Delete read the table's checkbox
 * selection when the page passes it — tick rows first, then pick the
 * action. Edit-shaped actions are offered ONLY for resources in
 * BULK_EDIT_RESOURCES: on any other resource the builder ignores
 * `mode` and its apply CREATES, which would mint records instead of
 * changing them.
 */
export function PageAssistant({
  resource,
  options,
  onApplied,
  label = 'Ask assistant',
  selection,
  onDeleteSelected,
  noun,
}: {
  /** Single-resource page — the common case. */
  resource?: AssistantResource;
  /** Multi-resource page. ONE sparkle covers all of them, so the
   *  merchant picks what they meant after clicking rather than choosing
   *  between two identical buttons in the header. */
  options?: readonly AssistantOption[];
  onApplied?: () => void;
  label?: string;
  /** Single-resource pages: the table's checked rows (each with `id`
   *  plus whatever parent ids the resource's edit apply reads). */
  selection?: readonly Record<string, unknown>[];
  /** Single-resource pages: the bulk-delete executor. */
  onDeleteSelected?: () => Promise<void> | void;
  /** Single-resource pages: the merchant's word for one record. */
  noun?: string;
}) {
  const { enabled } = useCatentioStatus();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<AssistantResource | null>(null);
  const [action, setAction] = useState<PageAction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const list: readonly AssistantOption[] =
    options ?? (resource ? [{ resource, label: '', selection, onDeleteSelected, noun }] : []);

  if (!enabled || list.length === 0) return null;

  // One resource -> straight to the action picker; several -> the
  // resource picker first, then actions for the picked one.
  const activeOption =
    list.length === 1 ? list[0]! : (list.find((o) => o.resource === picked) ?? null);

  const close = () => {
    setOpen(false);
    setPicked(null);
    setAction(null);
    setDeleteError(null);
  };

  const actionsFor = (o: AssistantOption) => {
    const word = o.noun ?? BULK[o.resource]?.noun ?? (o.label ? o.label.toLowerCase() : 'record');
    const picked = o.selection ?? [];
    const n = picked.length;
    const editable = BULK_EDIT_RESOURCES.includes(o.resource);
    const tickFirst = 'Tick rows in the table first, then come back.';
    const items: {
      action: PageAction;
      label: string;
      hint: string;
      disabled?: boolean;
    }[] = [
      {
        action: 'create',
        label: `New ${word}`,
        hint: `Describe it, or fill the form — same as the page's + New.`,
      },
    ];
    if (BULK[o.resource]) {
      items.push({
        action: 'bulk-create',
        label: `Bulk new ${word}s`,
        hint: 'Several at once — repeat the form or paste CSV rows.',
      });
    }
    if (editable && o.selection) {
      items.push({
        action: 'edit',
        label: n === 1 ? `Edit the selected ${word}` : `Edit a ${word}`,
        hint: n === 1 ? 'Change the row you ticked.' : `Tick exactly one row in the table first.`,
        disabled: n !== 1,
      });
      items.push({
        action: 'bulk-edit',
        label: n > 1 ? `Bulk edit ${n} selected` : `Bulk edit ${word}s`,
        hint:
          n > 0
            ? 'One change, applied to every ticked row.'
            : tickFirst,
        disabled: n === 0,
      });
    }
    if (o.onDeleteSelected && o.selection) {
      items.push({
        action: 'delete',
        label: n > 0 ? `Delete ${n} selected` : `Delete ${word}s`,
        hint: n > 0 ? 'Asks to confirm first.' : tickFirst,
        disabled: n === 0,
      });
    }
    return items;
  };

  // An executor may RETHROW its partial-failure message (deleteMany
  // names the rows that 409'd) — catch it and keep the dialog open with
  // the message, or the rejection is unhandled and the names are lost.
  const runDelete = async (o: AssistantOption) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await o.onDeleteSelected?.();
      onApplied?.();
      close();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Some rows could not be deleted');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setPicked(null);
          setAction(null);
          setOpen(true);
        }}
      >
        <Sparkles />
        {label}
      </Button>
      {open && !activeOption && (
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
      {open && activeOption && !action && (
        <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">What would you like to do?</DialogTitle>
              <DialogDescription>
                The assistant covers every action here — pick one.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {actionsFor(activeOption).map((a) => (
                <button
                  key={a.action}
                  type="button"
                  disabled={a.disabled}
                  onClick={() => setAction(a.action)}
                  className="rounded-lg border border-border bg-card px-4 py-3 text-left text-sm transition enabled:hover:border-primary/50 enabled:hover:bg-secondary disabled:opacity-50"
                >
                  <span className="font-medium">{a.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{a.hint}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {open && activeOption && (action === 'create' || action === 'bulk-create') && (
        <CatentioCrudSheet
          resource={activeOption.resource}
          mode="create"
          open
          onOpenChange={(o) => {
            if (!o) close();
          }}
          onApplied={() => onApplied?.()}
        />
      )}
      {open && activeOption && action === 'edit' && activeOption.selection?.length === 1 && (
        <CatentioCrudSheet
          resource={activeOption.resource}
          mode="edit"
          open
          onOpenChange={(o) => {
            if (!o) close();
          }}
          initial={activeOption.selection[0] as Record<string, unknown>}
          onApplied={() => onApplied?.()}
        />
      )}
      {open && activeOption && action === 'bulk-edit' && (activeOption.selection?.length ?? 0) > 0 && (
        <CatentioBulkEditSheet
          resource={activeOption.resource}
          targets={[...(activeOption.selection ?? [])] as Record<string, unknown>[]}
          open
          onOpenChange={(o: boolean) => {
            if (!o) close();
          }}
          onApplied={() => onApplied?.()}
        />
      )}
      {open && activeOption && action === 'delete' && (
        <AlertDialog open onOpenChange={(o) => { if (!o && !deleting) close(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {activeOption.selection?.length ?? 0} selected?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the rows you ticked in the table. It can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Keep them</AlertDialogCancel>
              <AlertDialogAction disabled={deleting} onClick={() => void runDelete(activeOption)}>
                {deleting ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
