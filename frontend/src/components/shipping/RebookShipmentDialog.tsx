'use client';

/**
 * RebookShipmentDialog — "reorder" a dead shipment.
 *
 * A cancelled or courier-rejected Biteship order can't be revived, so
 * rebooking means a NEW shipment built from the dead one's origin,
 * destination and item snapshots. The merchant keeps the same courier
 * or switches — switching is the point when the original one no-showed.
 *
 * The replacement lands as an unconfirmed draft: no charge, no driver,
 * until they click "Book courier". Fetching alternatives re-quotes live
 * rates against the same destination + parcel, so the price shown is
 * what will actually be debited on dispatch.
 */

import { useState } from 'react';
import { AlertCircle, Check, Loader2, RotateCcw, Truck } from 'lucide-react';
import {
  normalizeRates,
  shipmentsApi,
  shippingApi,
  type Rate,
  type Shipment,
} from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RebookShipmentDialogProps {
  shipment: Shipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the replacement once Fulkruma has booked the draft. */
  onRebooked: (replacement: Shipment) => void;
}

export function RebookShipmentDialog({
  shipment,
  open,
  onOpenChange,
  onRebooked,
}: RebookShipmentDialogProps) {
  const [rates, setRates] = useState<Rate[]>([]);
  const [selected, setSelected] = useState<Rate | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRates([]);
    setSelected(null);
    setError(null);
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function loadAlternatives() {
    if (!shipment) return;
    setError(null);
    setRatesLoading(true);
    try {
      // Re-quote against the SAME destination + parcel the dead shipment
      // carried, so a switched courier is priced for the real consignment
      // rather than a guess.
      const { data } = await shippingApi.rates({
        destination: shipment.destinationSnapshot,
        items: shipment.items,
      });
      const list = normalizeRates(data);
      setRates(list);
      if (list.length === 0) setError('No courier rates available for this destination right now.');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to fetch courier rates.');
    } finally {
      setRatesLoading(false);
    }
  }

  async function submit() {
    if (!shipment) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await shipmentsApi.rebook(
        shipment.id,
        selected
          ? {
              courierCode: selected.courierCode,
              courierServiceCode: selected.courierServiceCode,
              courierType: selected.courierType ?? selected.serviceType ?? undefined,
              price: selected.price,
            }
          : {},
      );
      // A draft that didn't stick at Biteship still persists locally —
      // say so rather than reporting a clean rebook.
      if (data.draftCreateError) {
        setError(`Replacement saved, but Biteship refused the booking: ${data.draftCreateError}`);
        setSubmitting(false);
        return;
      }
      reset();
      onRebooked(data);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to rebook shipment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!shipment) return null;

  const sameCourierLabel = `${shipment.courierCode.toUpperCase()} ${shipment.courierServiceCode}`;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rebook shipment</DialogTitle>
          <DialogDescription>
            Books a fresh courier for the same parcel and recipient. Nothing is
            charged until you hit <span className="font-medium">Book courier</span> on
            the new shipment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="font-medium">Replacing {shipment.id.slice(-8)}</div>
            <div className="mt-1 text-muted-foreground">
              {sameCourierLabel}
              {shipment.waybillId ? ` · AWB ${shipment.waybillId}` : ''}
              {shipment.cancelReason ? ` · ${shipment.cancelReason}` : ''}
            </div>
            {shipment.refundedAmount > 0 && (
              <div className="mt-1 text-emerald-500">
                {formatCurrency(shipment.refundedAmount)} shipping credit was refunded.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={cn(
                'flex w-full items-center justify-between rounded-md border p-3 text-left',
                selected === null ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                <span>
                  <span className="font-medium">Try {sameCourierLabel} again</span>
                  <span className="block text-xs text-muted-foreground">
                    Same courier, same service{shipment.price > 0 ? ` · ${formatCurrency(shipment.price)}` : ''}
                  </span>
                </span>
              </span>
              {selected === null && <Check className="h-4 w-4 text-primary" />}
            </button>

            {rates.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                disabled={ratesLoading}
                onClick={() => void loadAlternatives()}
              >
                {ratesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {ratesLoading ? 'Fetching rates…' : 'Pick a different courier'}
              </Button>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {rates.map((r, i) => {
                  const active = selected
                    && selected.courierCode === r.courierCode
                    && selected.courierServiceCode === r.courierServiceCode;
                  return (
                    <button
                      key={`${r.courierCode}-${r.courierServiceCode}-${i}`}
                      type="button"
                      onClick={() => setSelected(r)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border p-2.5 text-left',
                        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {(r.courierName ?? r.courierCode).toUpperCase()} · {r.serviceName ?? r.courierServiceCode}
                        </span>
                        {r.duration && <span className="block text-xs text-muted-foreground">{r.duration}</span>}
                      </span>
                      <span className="ml-3 shrink-0 text-sm font-medium">{formatCurrency(r.price)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Rebook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
