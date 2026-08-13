'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
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

/**
 * The bar that appears once rows are ticked: `N selected · Clear` — and
 * nothing else (bang's entry-point contract; storlaunch's bulk-bar.tsx
 * is the reference). The VERBS live in the page header's Actions
 * dropdown; the bar is the selection readout and the batch-result
 * feedback surface.
 *
 * A batch delete's partial run reports its error right here on the bar:
 * `deleteMany` throws `Deleted N of M. These did not: …` and that
 * sentence is the merchant's only way to learn which records the server
 * refused (sales history, active stock…). The selection persists on
 * partial failure so the failed rest can be retried; the page reloads
 * its rows either way, so the count on screen is honest.
 */
export function BulkBar({
  count,
  noun,
  plural: pluralWord,
  onClear,
  error,
}: {
  count: number;
  /** Singular, merchant's word: 'product', 'supplier'. */
  noun: string;
  /** Irregular plural ('categories'); defaults to `${noun}s`. */
  plural?: string;
  onClear: () => void;
  /** The last batch run's partial-failure sentence, page-owned now that
   *  the verbs run from the Actions dropdown. */
  error?: string | null;
}) {
  if (count === 0) return null;
  const plural = count === 1 ? noun : pluralWord ?? `${noun}s`;

  return (
    <div className="sticky bottom-4 z-30 mt-3 flex justify-center">
      <div className="flex max-w-full flex-col gap-1 rounded-xl border border-border bg-card px-4 py-2 shadow-lg">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            {count} {plural} selected
          </span>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
        {error && (
          <p className="max-w-md text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The batch-delete confirm, verbatim from the old bar's Delete button —
 * now opened by the Actions dropdown's "Delete N selected" item, which
 * is why the open state lives with the page. Same executor contract:
 * `onDelete` is deleteMany + reload, and a THROW is the partial-failure
 * sentence — it lands in `onError`, whose value the page renders on the
 * BulkBar. Selection is cleared only after a fully clean run.
 */
export function BulkDeleteDialog({
  count,
  noun,
  open,
  onOpenChange,
  onDelete,
  onError,
  onDone,
  description,
  plural: pluralWord,
}: {
  count: number;
  /** Singular, merchant's word — same as the bar's. */
  noun: string;
  /** Irregular plural ('categories'); defaults to `${noun}s`. */
  plural?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Page-specific consequence line, verbatim from the old confirm
   *  (e.g. "Products in a deleted category become uncategorized.").
   *  Defaults to the generic protected-records sentence. */
  description?: string;
  /** Deletes the selection (deleteMany + reload). Throwing reports the
   *  message on the bar via `onError`. */
  onDelete: () => Promise<void>;
  /** Receives the partial-failure sentence, or null when a run starts
   *  clean — render the value on the BulkBar's `error`. */
  onError: (message: string | null) => void;
  /** A fully clean run — clear the selection. */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const plural = count === 1 ? noun : pluralWord ?? `${noun}s`;

  const runDelete = async () => {
    setBusy(true);
    onError(null);
    try {
      await onDelete();
      onDone();
      onOpenChange(false);
    } catch (e) {
      onError((e as Error).message);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o && !busy) onOpenChange(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} {plural}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              'This cannot be undone. Records the server protects (sales history, active use) are skipped and named.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void runDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? 'Deleting…' : `Delete ${count}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One pending batch verb's confirm — `BulkDeleteDialog` generalized to
 * every other verb (approve, void, publish, unpublish), and the
 * ASSISTANT-OFF fallback for a page whose Actions dropdown otherwise
 * opens the agentic verb sheet.
 *
 * The page hands over the whole pending action (its words and its
 * executor) instead of a pile of props, because the dropdown builds
 * these per item and only ever has one open at a time.
 *
 * `run` is the `actMany` executor; a THROW is the partial-failure
 * sentence and lands on the bar via `onError`. `onDone` (clear the
 * selection) fires only after a clean run, so a partial run leaves the
 * selection for a retry.
 */
export type PendingBatchAction = {
  title: string;
  body: string;
  /** The confirm button's own words, e.g. "Approve 4". */
  cta: string;
  destructive?: boolean;
  run: () => Promise<void>;
  onError: (message: string | null) => void;
  onDone: () => void;
};

export function BulkActionDialog({
  action,
  onClose,
}: {
  action: PendingBatchAction | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!action) return null;

  const run = async () => {
    setBusy(true);
    action.onError(null);
    try {
      await action.run();
      action.onDone();
      onClose();
    } catch (e) {
      action.onError((e as Error).message);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action.title}</AlertDialogTitle>
          <AlertDialogDescription>{action.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
            className={
              action.destructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : undefined
            }
          >
            {busy ? 'Working…' : action.cta}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
