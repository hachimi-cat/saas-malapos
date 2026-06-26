'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Copy, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import { invoicesApi, Invoice } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_COLOR: Record<string, string> = {
  paid: 'bg-green-500/10 text-green-400',
  open: 'bg-yellow-500/10 text-yellow-400',
  draft: 'bg-muted text-muted-foreground',
  void: 'bg-muted text-muted-foreground',
  uncollectible: 'bg-red-500/10 text-red-400',
};

type InvoiceDetail = Invoice & {
  number?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  amountPaid?: number;
  amountDue?: number;
  dueAt?: string | null;
  issuedAt?: string | null;
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [inv, setInv] = React.useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  function authedFetch(pathRelative: string) {
    const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/api\/v1\/?$/, '');
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('malapos_account_id') : null;
    return fetch(`${base}${pathRelative}`, {
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(accountId ? { 'X-Account-Id': accountId } : {}),
      },
    });
  }

  async function downloadPdf() {
    if (!inv) return;
    const res = await authedFetch(`/api/v1/payments/invoices/${inv.id}/pdf`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${inv.number ?? inv.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function shareLink() {
    if (!inv) return;
    const url = `https://plugipay.com/i/${inv.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  React.useEffect(() => {
    invoicesApi
      .get(id)
      .then((res) => {
        const body = res.data as unknown as { data?: InvoiceDetail } | InvoiceDetail;
        setInv(((body as { data?: InvoiceDetail }).data ?? body) as InvoiceDetail);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
    // HTML preview via the payments passthrough. Same-origin response, so
    // iframe srcDoc works without X-Frame-Options blocking.
    authedFetch(`/api/v1/payments/invoices/${id}/html`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`preview ${r.status}`))))
      .then(setPreviewHtml)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!inv) return <div className="p-8 text-sm text-red-400">{error ?? 'Not found'}</div>;

  const total = inv.total ?? inv.amount;
  const subtotal = inv.subtotal ?? inv.amount;
  const fmt = (n: number) =>
    inv.currency === 'IDR' ? formatCurrency(n) : `${inv.currency} ${n.toFixed(2)}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/payments/invoices" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Invoices
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="font-mono text-foreground">{inv.id}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              Invoice <span className="align-middle font-mono text-xl">{inv.number || inv.id}</span>
            </h1>
            <Badge
              variant="outline"
              className={cn(
                'rounded-full border-transparent px-2 py-0.5 text-xs font-medium capitalize',
                STATUS_COLOR[inv.status] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {inv.status}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-[13px] text-muted-foreground">
            {inv.paidAt
              ? `Paid ${formatDate(inv.paidAt)}`
              : `Issued ${formatDate(inv.issuedAt ?? inv.createdAt)}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-extrabold tabular-nums tracking-tight">{fmt(total)}</div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{inv.currency}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent>
          {inv.lineItems && inv.lineItems.length > 0 && (
            <div className="mb-4 space-y-2">
              {inv.lineItems.map((li, i) => (
                <div key={i} className="flex items-center justify-between border-b border-dashed border-border py-2 text-sm">
                  <span>
                    {li.description}
                    {li.quantity > 1 && <span className="ml-1 text-muted-foreground">× {li.quantity}</span>}
                  </span>
                  <span className="font-mono tabular-nums">{fmt(li.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <Row label="Subtotal" amount={fmt(subtotal)} />
          {inv.discount !== undefined && inv.discount > 0 && (
            <Row label="Discount" amount={`-${fmt(inv.discount)}`} />
          )}
          {inv.tax !== undefined && inv.tax > 0 && <Row label="Tax" amount={fmt(inv.tax)} />}
          <div className="mt-1 flex items-center justify-between border-t-2 border-foreground pt-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-mono text-sm font-semibold tabular-nums">{fmt(total)}</span>
          </div>
          {(inv.amountPaid !== undefined || inv.amountDue !== undefined) && (
            <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm text-muted-foreground">
              <span>Amount paid</span>
              <span className="text-right tabular-nums">{fmt(inv.amountPaid ?? 0)}</span>
              <span>Amount due</span>
              <span className="text-right tabular-nums">{fmt(inv.amountDue ?? 0)}</span>
            </div>
          )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            <Kv label="Customer" value={inv.customerId ?? '—'} mono />
            <Kv label="Email" value={inv.customerEmail ?? '—'} />
            <Kv label="Subscription" value={inv.subscriptionId ?? '—'} mono />
            <Kv label="Due" value={inv.dueAt ? formatDate(inv.dueAt) : inv.dueDate ? formatDate(inv.dueDate) : '—'} />
            <div className="flex flex-wrap gap-2 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadPdf}
                className="text-xs"
              >
                <Download className="h-3 w-3" /> PDF
              </Button>
              <Button variant="outline" size="sm" className="text-xs" asChild>
                <a
                  href={`https://plugipay.com/i/${inv.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3 w-3" /> View hosted
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={shareLink}
                className="text-xs"
              >
                {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Share link'}
              </Button>
            </div>
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
            title="Invoice preview"
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

function Row({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-border py-2.5">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-[13px] tabular-nums">{amount}</span>
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={mono ? 'font-mono text-[12.5px]' : 'text-sm'}>{value}</p>
    </div>
  );
}
