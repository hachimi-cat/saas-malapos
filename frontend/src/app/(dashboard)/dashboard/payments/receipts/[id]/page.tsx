'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, Mail, Download, Printer, Loader2 } from 'lucide-react';
import { receiptsApi, Receipt } from '@/lib/payments-api';
import { formatCurrency } from '@/lib/utils';

const SOURCE_LABELS: Record<string, string> = {
  checkout_session: 'Checkout session',
  invoice: 'Invoice',
};

const btnSecondary =
  'inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50';
const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';
const labelCls = 'mb-1.5 block text-xs font-medium text-foreground';

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
      .then((res) => {
        const body = res.data as unknown as { data?: Receipt } | Receipt;
        setReceipt(((body as { data?: Receipt }).data ?? body) as Receipt);
      })
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
      const body = res.data as unknown as { data?: { sent: boolean; to: string } } | { to: string };
      const result = ((body as { data?: { to: string } }).data ?? body) as { to: string };
      setInfo(`Receipt sent to ${result.to}`);
      setEmailTo('');
      const refreshed = await receiptsApi.get(id);
      const rb = refreshed.data as unknown as { data?: Receipt } | Receipt;
      setReceipt(((rb as { data?: Receipt }).data ?? rb) as Receipt);
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
    <div className="mx-auto max-w-5xl space-y-6">
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
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Paid</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {SOURCE_LABELS[receipt.sourceType] ?? receipt.sourceType}
            </span>
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
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Details</h2>
          <div className="space-y-2 text-sm">
            <Kv label="Receipt #" value={receipt.number ?? '—'} mono />
            <Kv label="Issued" value={receipt.issuedAt ? new Date(receipt.issuedAt).toLocaleString() : '—'} />
            <Kv label="Source" value={`${SOURCE_LABELS[receipt.sourceType] ?? receipt.sourceType} · ${receipt.sourceId}`} mono />
            {receipt.adapter && <Kv label="Adapter" value={receipt.adapter} mono />}
            {receipt.customerId && <Kv label="Customer" value={receipt.customerId} mono />}
            {receipt.emailedAt && <Kv label="Emailed" value={new Date(receipt.emailedAt).toLocaleString()} />}
            {receipt.emailedTo && <Kv label="Emailed to" value={receipt.emailedTo} mono />}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Share & reprint</h2>
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadBinary(`/payments/receipts/${id}/pdf`, `receipt-${receipt.number}.pdf`)} className={btnSecondary}>
                <Download className="h-4 w-4" /> PDF
              </button>
              <button type="button" onClick={() => openBinary(`/payments/receipts/${id}/html`)} className={btnSecondary}>
                <ExternalLink className="h-4 w-4" /> View HTML
              </button>
              <a
                href={`https://plugipay.com/r/${receipt.id}`}
                target="_blank"
                rel="noreferrer"
                className={btnSecondary}
              >
                <ExternalLink className="h-4 w-4" /> Public link
              </a>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadBinary(`/payments/receipts/${id}/escpos?width=58`, `receipt-${receipt.number}-58mm.bin`)} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1 text-xs hover:bg-accent">
                <Printer className="h-3 w-3" /> ESC/POS 58mm
              </button>
              <button type="button" onClick={() => downloadBinary(`/payments/receipts/${id}/escpos?width=80`, `receipt-${receipt.number}-80mm.bin`)} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1 text-xs hover:bg-accent">
                <Printer className="h-3 w-3" /> ESC/POS 80mm
              </button>
            </div>
            <div>
              <label htmlFor="email-to" className={labelCls}>Email receipt to</label>
              <div className="flex gap-2">
                <input
                  id="email-to"
                  type="email"
                  placeholder="customer@example.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className={inputCls}
                />
                <button type="button" onClick={sendEmail} disabled={emailing} className={btnPrimary}>
                  {emailing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Blank uses the receipt&apos;s customer email. A PDF is attached.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">Preview</h2>
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
      </div>
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
