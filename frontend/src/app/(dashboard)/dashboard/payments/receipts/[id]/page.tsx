'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, Mail, Download, Printer, Loader2 } from 'lucide-react';
import { receiptsApi, Receipt } from '@/lib/payments-api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SOURCE_LABELS: Record<string, string> = {
  checkout_session: 'Checkout session',
  invoice: 'Invoice',
};

// malapos serves the payment binary/preview endpoints under
// /api/v1/payments/*; derive the origin from NEXT_PUBLIC_API_URL,
// stripping any trailing /api/v1, then re-append it once.
const API_BASE = (
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4191'
).replace(/\/api\/v1\/?$/, '') + '/api/v1';

export default function ReceiptDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [emailTo, setEmailTo] = React.useState('');
  const [emailing, setEmailing] = React.useState(false);
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    receiptsApi
      .get(id)
      .then((res) => setReceipt(res.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
    // Pull preview HTML via fetch so iframe can render via srcDoc and
    // dodge any global X-Frame-Options DENY.
    fetch(`${API_BASE}/payments/receipts/${id}/html`, { credentials: 'include' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`preview ${r.status}`))))
      .then(setPreviewHtml)
      .catch(() => {});
  }, [id]);

  async function authedFetch(pathRelative: string) {
    return fetch(`${API_BASE}${pathRelative}`, { credentials: 'include' });
  }

  async function downloadBinary(pathRelative: string, filename: string) {
    try {
      const res = await authedFetch(pathRelative);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  }

  async function openBinary(pathRelative: string) {
    try {
      const res = await authedFetch(pathRelative);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Open failed');
    }
  }

  async function sendEmail() {
    setError(null);
    setInfo(null);
    setEmailing(true);
    try {
      const res = await receiptsApi.email(id, emailTo.trim() || undefined);
      setInfo(`Receipt sent to ${res.data.to}`);
      setEmailTo('');
      const refreshed = await receiptsApi.get(id);
      setReceipt(refreshed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email failed');
    } finally {
      setEmailing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!receipt) {
    return <div className="p-8 text-sm text-red-400">{error ?? 'Not found'}</div>;
  }

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/payments/receipts" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Receipts
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="font-mono text-foreground">{receipt.number}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {receipt.currency === 'IDR' ? formatCurrency(receipt.amount) : `${receipt.currency} ${receipt.amount}`}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Badge className="rounded-full px-2 py-0.5 text-xs font-medium">Paid</Badge>
            <Badge variant="outline" className="rounded-full border-transparent bg-muted px-2 py-0.5 text-xs font-normal">
              {SOURCE_LABELS[receipt.sourceType] ?? receipt.sourceType}
            </Badge>
            {receipt.method && <span className="text-xs text-muted-foreground">· {receipt.method}</span>}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-400">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-border bg-green-500/10 px-3 py-2 text-xs font-mono text-green-400">
          {info}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Kv label="Receipt #" value={receipt.number ?? '—'} mono />
            <Kv label="Issued" value={receipt.issuedAt ? new Date(receipt.issuedAt).toLocaleString() : '—'} />
            <Kv label="Source" value={`${SOURCE_LABELS[receipt.sourceType] ?? receipt.sourceType} · ${receipt.sourceId}`} mono />
            {receipt.adapter && <Kv label="Adapter" value={receipt.adapter} mono />}
            {receipt.customerId && <Kv label="Customer" value={receipt.customerId} mono />}
            {receipt.emailedAt && <Kv label="Emailed" value={new Date(receipt.emailedAt).toLocaleString()} />}
            {receipt.emailedTo && <Kv label="Emailed to" value={receipt.emailedTo} mono />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share &amp; reprint</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => downloadBinary(`/payments/receipts/${id}/pdf`, `receipt-${receipt.number}.pdf`)}>
                <Download className="h-4 w-4" /> PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => openBinary(`/payments/receipts/${id}/html`)}>
                <ExternalLink className="h-4 w-4" /> View HTML
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={`https://plugipay.com/r/${receipt.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" /> Public link
                </a>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="border-dashed text-xs" onClick={() => downloadBinary(`/payments/receipts/${id}/escpos?width=58`, `receipt-${receipt.number}-58mm.bin`)}>
                <Printer className="h-3 w-3" /> ESC/POS 58mm
              </Button>
              <Button type="button" variant="outline" size="sm" className="border-dashed text-xs" onClick={() => downloadBinary(`/payments/receipts/${id}/escpos?width=80`, `receipt-${receipt.number}-80mm.bin`)}>
                <Printer className="h-3 w-3" /> ESC/POS 80mm
              </Button>
            </div>
            <div>
              <Label htmlFor="email-to" className="mb-1.5 block text-xs">Email receipt to</Label>
              <div className="flex gap-2">
                <Input
                  id="email-to"
                  type="email"
                  placeholder="customer@example.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
                <Button type="button" onClick={sendEmail} disabled={emailing}>
                  {emailing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Blank uses the receipt&apos;s customer email. A PDF is attached.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent>
        {previewHtml ? (
          <iframe
            srcDoc={previewHtml}
            className="h-[720px] w-full rounded border border-border bg-white"
            title="Receipt preview"
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading preview…
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={(mono ? 'font-mono text-xs ' : '') + 'break-all text-right text-foreground'}>{value}</span>
    </div>
  );
}
