'use client';

import * as React from 'react';
import { Download, FileText, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DEFAULT_SHIPMENT_LABEL_OPTIONS, shipmentLabelBlobUrl, type ShipmentLabelFile, type ShipmentLabelOptions, type ShipmentLabelSize } from '@/lib/shipment-label';

export interface ShipmentLabelTarget { id: string; waybillId: string | null; courierCode: string; courierServiceCode: string; }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; shipment: ShipmentLabelTarget | null; loadLabel: (shipmentId: string, options: ShipmentLabelOptions) => Promise<ShipmentLabelFile>; }
const formats: Array<{ value: ShipmentLabelSize; title: string; note: string }> = [
  { value: 'a4', title: 'A4', note: 'Standard office printer' },
  { value: 'thermal-80x100', title: 'Thermal 8 × 10 cm', note: 'Compact shipping label' },
  { value: 'thermal-100x150', title: 'Thermal 10 × 15 cm', note: 'Recommended · matches Biteship' },
];

export function ShipmentLabelDialog({ open, onOpenChange, shipment, loadLabel }: Props) {
  const [options, setOptions] = React.useState<ShipmentLabelOptions>(DEFAULT_SHIPMENT_LABEL_OPTIONS);
  const [preview, setPreview] = React.useState<{ url: string; file: ShipmentLabelFile } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const loaderRef = React.useRef(loadLabel);
  const optionKey = JSON.stringify(options);
  React.useEffect(() => { loaderRef.current = loadLabel; }, [loadLabel]);
  React.useEffect(() => { const saved = window.localStorage.getItem('forjio_shipment_label_size'); if (formats.some((format) => format.value === saved)) setOptions((current) => ({ ...current, size: saved as ShipmentLabelSize })); return () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }; }, []);
  React.useEffect(() => {
    if (!open || !shipment?.waybillId) return;
    let cancelled = false; setLoading(true); setError(null);
    void loaderRef.current(shipment.id, options).then((file) => { if (cancelled) return; const url = shipmentLabelBlobUrl(file); if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = url; setPreview({ url, file }); }).catch((cause: unknown) => { if (!cancelled) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Could not generate the shipping label'); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shipment?.id, shipment?.waybillId, optionKey]);
  function setSize(size: ShipmentLabelSize) { window.localStorage.setItem('forjio_shipment_label_size', size); setOptions((current) => ({ ...current, size })); }
  function setFlag(key: keyof Omit<ShipmentLabelOptions, 'size'>, checked: boolean) { setOptions((current) => ({ ...current, [key]: checked })); }
  function printLabel() { if (!preview) return; try { const frame = iframeRef.current?.contentWindow; if (!frame) throw new Error(); frame.focus(); frame.print(); } catch { if (!window.open(preview.url, '_blank', 'noopener,noreferrer')) toast.error('Your browser blocked the label tab. Allow pop-ups and try again.'); } }
  function downloadLabel() { if (!preview) return; const link = document.createElement('a'); link.href = preview.url; link.download = preview.file.fileName; document.body.appendChild(link); link.click(); link.remove(); }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(960px,calc(100vw-2rem))] max-w-none overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4"><DialogTitle>Print resi</DialogTitle><DialogDescription>{shipment?.waybillId ? `${shipment.courierCode.toUpperCase()} ${shipment.courierServiceCode.toUpperCase()} · AWB ${shipment.waybillId}` : 'Available after the courier is booked and an AWB is issued.'}</DialogDescription></DialogHeader>
        <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
          <div className="max-h-[64vh] space-y-5 overflow-y-auto border-b border-border p-5 md:border-b-0 md:border-r">
            <section><h3 className="text-sm font-semibold">Label size</h3><p className="mb-3 text-xs text-muted-foreground">Use the paper loaded in your printer.</p><div className="space-y-2">{formats.map((format) => <button key={format.value} type="button" onClick={() => setSize(format.value)} className={`w-full rounded-lg border p-3 text-left transition ${options.size === format.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted/50'}`}><span className="block text-sm font-medium">{format.title}</span><span className="block text-xs text-muted-foreground">{format.note}</span></button>)}</div></section>
            <section className="space-y-2 border-t border-border pt-4"><h3 className="text-sm font-semibold">Label details</h3><Toggle id="sender-phone" label="Sender phone" checked={options.showSenderPhone} onChange={(v) => setFlag('showSenderPhone', v)} /><Toggle id="recipient-phone" label="Recipient phone" checked={options.showRecipientPhone} onChange={(v) => setFlag('showRecipientPhone', v)} /><Toggle id="mask-recipient" label="Mask recipient name" checked={options.maskRecipientName} onChange={(v) => setFlag('maskRecipientName', v)} /><Toggle id="shipping-cost" label="Shipping cost" checked={options.showShippingCost} onChange={(v) => setFlag('showShippingCost', v)} /><Toggle id="insurance" label="Insurance" checked={options.showInsurance} onChange={(v) => setFlag('showInsurance', v)} /><Toggle id="items" label="Item list" checked={options.showItems} onChange={(v) => setFlag('showItems', v)} /><Toggle id="descriptions" label="Item descriptions" checked={options.showItemDescriptions} disabled={!options.showItems} onChange={(v) => setFlag('showItemDescriptions', v)} /><Toggle id="skus" label="Item SKU" checked={options.showItemSkus} disabled={!options.showItems} onChange={(v) => setFlag('showItemSkus', v)} /></section>
          </div>
          <div className="relative flex min-h-[420px] items-center justify-center bg-muted/50 p-5">{loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}{error ? <div className="max-w-sm rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">{error}</div> : preview ? <iframe ref={iframeRef} title="Shipping label preview" src={preview.url} className="h-[54vh] min-h-[390px] w-full rounded-md border border-border bg-white" /> : <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><FileText className="h-8 w-8" />Preparing label preview…</div>}</div>
        </div>
        <DialogFooter className="border-t border-border px-6 py-4"><Button type="button" variant="outline" onClick={downloadLabel} disabled={!preview || loading}><Download className="h-4 w-4" /> Download PDF</Button><Button type="button" onClick={printLabel} disabled={!preview || loading}><Printer className="h-4 w-4" /> Print label</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Toggle({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) { return <label htmlFor={id} className={`flex items-center gap-2 text-xs ${disabled ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}><Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} />{label}</label>; }
