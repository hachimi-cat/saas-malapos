'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah, parseRupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Close-shift dialog — count the drawer, see expected-vs-counted live,
 * confirm. Shared by the shifts list (current-shift card) and the shift
 * detail page. POST /shifts/:id/close is the money move, so the dialog
 * IS the explicit confirm: it names the shift's expected cash and shows
 * the over/short before the merchant commits.
 */
export function CloseShiftDialog({
  shiftId,
  expectedCash,
  onClose,
  onClosed,
}: {
  shiftId: string;
  /** Live expected drawer cash (openingFloat + cash sales − cash refunds). */
  expectedCash: number;
  onClose: () => void;
  onClosed: () => Promise<void> | void;
}) {
  const [counted, setCounted] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const difference = counted === null ? null : counted - expectedCash;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (counted === null || counted < 0) {
      setError('Count the cash in the drawer first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/shifts/${shiftId}/close`, {
        countedCash: counted,
        notes: notes.trim() || undefined,
      });
      await onClosed();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to close shift');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close shift</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Count the physical cash in the drawer. Expected:{' '}
            <span className="font-semibold text-foreground">{rupiah(expectedCash)}</span>
          </p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cs-counted">Counted cash</Label>
            <Input
              id="cs-counted"
              inputMode="numeric"
              autoFocus
              value={counted === null ? '' : rupiah(counted)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, '');
                setCounted(raw === '' ? null : parseRupiah(raw));
              }}
              placeholder="Rp 0"
            />
          </div>
          {difference !== null && (
            <p className="text-sm">
              {difference === 0 ? (
                <span className="text-primary">Drawer balances exactly.</span>
              ) : (
                <span className={difference > 0 ? 'text-amber-600' : 'text-destructive'}>
                  {difference > 0 ? 'Over' : 'Short'} by {rupiah(Math.abs(difference))}
                </span>
              )}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cs-notes">Notes (optional)</Label>
            <Textarea
              id="cs-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rp 20.000 short — till opened for change twice"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || counted === null} className="flex-1">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? 'Closing…' : 'Close shift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
