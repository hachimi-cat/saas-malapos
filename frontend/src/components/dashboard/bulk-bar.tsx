'use client';

import { useState } from 'react';
import { Loader2, Pencil, Trash2, X } from 'lucide-react';
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
 * The bar that appears once rows are ticked: `N selected · Edit ·
 * Delete · clear`. One component so every list page gets the identical
 * affordance — which actions it offers is the page's call (a list whose
 * records have no delete route simply passes no `onDelete`).
 *
 * Delete confirms first and reports a partial run's error right here on
 * the bar: `deleteMany` throws `Deleted N of M. These did not: …` and
 * that sentence is the merchant's only way to learn which records the
 * server refused (sales history, active stock…). The page reloads its
 * rows either way, so the count on screen is honest.
 */
export function BulkBar({
  count,
  noun,
  onEdit,
  onDelete,
  onClear,
}: {
  count: number;
  /** Singular, merchant's word: 'product', 'supplier'. */
  noun: string;
  /** Opens the bulk-edit sheet. Omit when the resource has no edit. */
  onEdit?: () => void;
  /** Deletes the selection (deleteMany + reload). Omit when there is no
   *  delete route. Throwing shows the message on the bar. */
  onDelete?: () => Promise<void>;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;
  const plural = count === 1 ? noun : `${noun}s`;

  const runDelete = async () => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await onDelete?.();
      onClear();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-4 z-30 mt-3 flex justify-center">
      <div className="flex max-w-full flex-col gap-1 rounded-xl border border-border bg-card px-4 py-2 shadow-lg">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            {count} {plural} selected
          </span>
          {onEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                onEdit();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}{' '}
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              onClear();
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
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
      {confirming && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setConfirming(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {count} {plural}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. Records the server protects (sales
                history, active use) are skipped and named.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={runDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete {count}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
