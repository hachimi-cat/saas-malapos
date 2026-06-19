'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, Loader2, ExternalLink, QrCode, CheckCircle2, Settings } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';

/*
 * Payment settings — the Payment (Plugipay) module's "Settings" sub-page.
 *
 * The actual payment provider (QRIS acquirer, settlement bank, payout
 * schedule) is configured in the merchant's Plugipay workspace, not in
 * Malapos — Malapos just charges through the gated per-merchant Plugipay
 * client. This page explains that, links out to Plugipay, and confirms
 * QRIS is wired by probing /payments/overview (reachable ⇒ the Plugipay
 * client is provisioned). When the Payments module is OFF the backend
 * returns 409 and this page shows the enable empty state. No mock data.
 */

const PLUGIPAY_DASHBOARD = 'https://plugipay.com/dashboard';

export default function PaymentSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setModuleOff(false);
    try {
      // Reachable overview ⇒ the merchant's Plugipay client is provisioned
      // and able to charge. We don't surface raw balances here.
      await api.get('/payments/overview');
      setConnected(true);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setModuleOff(true);
      } else {
        // Module on but the client errored (e.g. not yet linked) — still
        // render the settings copy, just without the "connected" badge.
        setConnected(false);
        setError(e instanceof ApiRequestError ? e.message : 'Could not reach Plugipay');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payment settings…
      </div>
    );
  }

  if (moduleOff) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg border border-border bg-card px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Enable the Payments module</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Payments uses Plugipay to accept live dynamic QRIS at the sell screen. Turn on the
            Payments module to configure how you collect and settle money.
          </p>
          <Link
            href="/dashboard/settings/modules"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to Modules <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Settings className="h-5 w-5 text-primary" /> Payment settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure how Malapos collects and settles money through Plugipay.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* Provider status */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Plugipay</p>
              <p className="text-xs text-muted-foreground">Your payment provider for QRIS collection.</p>
            </div>
          </div>
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Connected
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Not linked
            </span>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Your QRIS acquirer, settlement bank account, and payout schedule are managed in your
          Plugipay workspace — not in Malapos. To change acquirers, update bank details, or adjust
          payout timing, open Plugipay and configure your provider there.
        </p>
        <a
          href={PLUGIPAY_DASHBOARD}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Configure in Plugipay <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Enabled methods */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3 text-sm font-medium">Payment methods</div>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <QrCode className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Dynamic QRIS</p>
              <p className="text-xs text-muted-foreground">
                Customer scans a per-sale QR at the till; the sale settles automatically.
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              connected
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {connected ? 'Active' : 'Pending link'}
          </span>
        </div>
      </div>
    </div>
  );
}
