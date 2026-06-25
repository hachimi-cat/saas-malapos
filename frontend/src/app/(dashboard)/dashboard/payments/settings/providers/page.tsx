'use client';

import * as React from 'react';
import { Check, Plus, Trash2, Loader2 } from 'lucide-react';
import {
  plugipaySettingsApi,
  type AdapterConfigMap,
  type AdapterSummary,
  type ManagedOnboardingDTO,
  type ManualBankAccount,
} from '@/lib/plugipay-settings-api';

type ProviderKey = 'managed' | 'xendit' | 'midtrans' | 'paypal' | 'manual';
type Option = { key: ProviderKey; title: string; description: string; meta: string };

const OPTIONS: Option[] = [
  // 'managed' (Plugipay xenPlatform sub-account) intentionally omitted.
  // Merchants reach Plugipay via Pattern-2 partner billing —
  // their Plugipay workspace is auto-provisioned + lives under the
  // malapos channel. Direct xenPlatform onboarding from this UI
  // would create a redundant sub-account that malapos can't route
  // to. BYO adapters (Xendit / Midtrans / PayPal) + manual still apply.
  {
    key: 'xendit',
    title: 'Bring your own Xendit',
    description: 'Paste your Xendit secret key. Full control of your Xendit account, your rate card.',
    meta: 'Setup: 5 min · All SEA methods · IDR',
  },
  {
    key: 'midtrans',
    title: 'Bring your own Midtrans',
    description: 'Use your own Midtrans account. Server Key + Client Key + Merchant ID from the dashboard.',
    meta: 'Setup: 5 min · QRIS, GoPay, cards, VA · IDR',
  },
  {
    key: 'paypal',
    title: 'Bring your own PayPal',
    description: 'OAuth credentials from your REST app. USD only.',
    meta: 'Setup: 3 min · Card, PayPal balance · USD',
  },
  {
    key: 'manual',
    title: 'Offline & manual',
    description:
      'For cash, bank transfer to your own account, and EDC receipts. No PSP, no API keys — merchant confirms each payment.',
    meta: 'Setup: 1 min · Bank transfer, cash, EDC · IDR',
  },
];

const KYB_STAGES = [
  { id: 'not_started', label: 'Not started', description: 'Give us your business email to kick things off.' },
  { id: 'invited', label: 'Invited', description: 'Check your inbox for the Xendit invitation.' },
  { id: 'registered', label: 'Registered', description: 'Upload KYB docs + payout bank account in Xendit.' },
  { id: 'live', label: 'Live', description: 'Xendit approved you. You can accept payments.' },
];

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';
const labelCls = 'mb-1.5 block text-xs font-medium text-foreground';
const helpCls = 'mt-1 text-[11px] text-muted-foreground';
const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
const btnSecondary =
  'inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50';

export default function ProvidersSettingsPage() {
  const [adapters, setAdapters] = React.useState<AdapterConfigMap | null>(null);
  // Default selection is the first visible option; 'managed' is hidden
  // (see OPTIONS comment) so we pick 'xendit'.
  const [active, setActive] = React.useState<ProviderKey>('xendit');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const [xenditSecret, setXenditSecret] = React.useState('');
  const [xenditCallback, setXenditCallback] = React.useState('');
  const [paypalClientId, setPaypalClientId] = React.useState('');
  const [paypalSecret, setPaypalSecret] = React.useState('');
  const [paypalMode, setPaypalMode] = React.useState<'live' | 'sandbox'>('sandbox');
  const [midtransServerKey, setMidtransServerKey] = React.useState('');
  const [midtransClientKey, setMidtransClientKey] = React.useState('');
  const [midtransMerchantId, setMidtransMerchantId] = React.useState('');
  const [midtransEnv, setMidtransEnv] = React.useState<'sandbox' | 'production'>('sandbox');
  const [manualBankAccounts, setManualBankAccounts] = React.useState<ManualBankAccount[]>([]);
  const [manualStaticQrUrl, setManualStaticQrUrl] = React.useState('');
  const [manualInstructions, setManualInstructions] = React.useState('');

  const [managed, setManaged] = React.useState<ManagedOnboardingDTO | null>(null);
  const [managedEmail, setManagedEmail] = React.useState('');
  const [managedBusy, setManagedBusy] = React.useState(false);

  React.useEffect(() => {
    if (!adapters?.manual) return;
    const pc = adapters.manual.publicConfig as {
      bankAccounts?: ManualBankAccount[];
      staticQrImageUrl?: string | null;
      instructions?: string | null;
    } | null;
    if (Array.isArray(pc?.bankAccounts)) setManualBankAccounts(pc!.bankAccounts);
    if (pc?.staticQrImageUrl) setManualStaticQrUrl(pc.staticQrImageUrl);
    if (pc?.instructions) setManualInstructions(pc.instructions);
  }, [adapters]);

  React.useEffect(() => {
    Promise.all([
      plugipaySettingsApi.getAdapters(),
      plugipaySettingsApi.getManagedOnboarding().catch(() => null),
    ])
      .then(([map, mo]) => {
        setAdapters(map);
        setManaged(mo ?? null);
        if (mo?.email) setManagedEmail(mo.email);
        const first = Object.values(map).find((a) => a?.status === 'active');
        if (first) setActive(first.kind as ProviderKey);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load adapters'))
      .finally(() => setLoading(false));
  }, []);

  async function refreshManaged() {
    try {
      setManaged(await plugipaySettingsApi.getManagedOnboarding());
    } catch {
      /* swallow — keep last known state */
    }
  }

  async function startManaged() {
    setError(null);
    setInfo(null);
    setManagedBusy(true);
    try {
      const dto = await plugipaySettingsApi.startManagedOnboarding(managedEmail.trim());
      setManaged(dto);
      setInfo('Xendit onboarding invitation sent. Check your email to complete verification.');
      setAdapters(await plugipaySettingsApi.getAdapters());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start onboarding');
    } finally {
      setManagedBusy(false);
    }
  }

  async function simulate(patch: Parameters<typeof plugipaySettingsApi.simulateManagedStatus>[0]) {
    try {
      setManagedBusy(true);
      const dto = await plugipaySettingsApi.simulateManagedStatus(patch);
      setManaged(dto);
      setAdapters(await plugipaySettingsApi.getAdapters());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setManagedBusy(false);
    }
  }

  function showActive(k: string): AdapterSummary | undefined {
    return adapters?.[k as keyof AdapterConfigMap];
  }

  async function save() {
    setError(null);
    setInfo(null);
    setSaving(true);
    try {
      if (active === 'managed') {
        setSaving(false);
        return;
      } else if (active === 'xendit') {
        if (!xenditSecret) throw new Error('Secret key is required');
        await plugipaySettingsApi.putXendit({
          secretKey: xenditSecret,
          callbackToken: xenditCallback || undefined,
        });
        setInfo('Xendit adapter saved');
      } else if (active === 'paypal') {
        if (!paypalClientId || !paypalSecret) throw new Error('PayPal credentials required');
        await plugipaySettingsApi.putPaypal({
          clientId: paypalClientId,
          secret: paypalSecret,
          mode: paypalMode,
        });
        setInfo('PayPal adapter saved');
      } else if (active === 'midtrans') {
        if (!midtransServerKey || !midtransClientKey || !midtransMerchantId) {
          throw new Error('Server Key, Client Key, and Merchant ID are all required');
        }
        const env = midtransServerKey.startsWith('SB-') ? 'sandbox' : midtransEnv;
        await plugipaySettingsApi.putMidtrans({
          serverKey: midtransServerKey,
          clientKey: midtransClientKey,
          merchantId: midtransMerchantId,
          env,
        });
        setInfo('Midtrans adapter saved');
      } else if (active === 'manual') {
        await plugipaySettingsApi.putManual({
          bankAccounts: manualBankAccounts.filter(
            (b) => b.bankName.trim() && b.accountNumber.trim() && b.accountHolder.trim(),
          ),
          staticQrImageUrl: manualStaticQrUrl.trim() || null,
          instructions: manualInstructions.trim() || null,
        });
        setInfo('Offline & manual adapter saved');
      }
      const next = await plugipaySettingsApi.getAdapters();
      setAdapters(next);
      setXenditSecret('');
      setPaypalSecret('');
      setMidtransServerKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-xs text-muted-foreground">
        <span>Settings</span>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="text-foreground">Providers</span>
      </nav>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment providers</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
            Pick how you want to process payments. You can switch later — existing subscriptions re-route automatically.
          </p>
        </div>
        {active !== 'managed' && (
          <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save changes
          </button>
        )}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-muted/20" />
            ))
          : OPTIONS.map((o) => {
              const summary = showActive(o.key);
              const selected = active === o.key;
              const status = summary?.status ?? 'unconfigured';
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setActive(o.key)}
                  className={
                    'relative rounded-lg border p-5 text-left transition-colors ' +
                    (selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:border-primary/40')
                  }
                >
                  {status === 'active' && (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                      <Check className="h-3 w-3" strokeWidth={2.5} /> Active
                    </span>
                  )}
                  <h3 className="text-[15px] font-semibold tracking-tight">{o.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{o.description}</p>
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">{o.meta}</p>
                </button>
              );
            })}
      </div>

      {active === 'managed' && (
        <ManagedOnboardingCard
          state={managed}
          email={managedEmail}
          setEmail={setManagedEmail}
          busy={managedBusy}
          onStart={startManaged}
          onRefresh={refreshManaged}
          onSimulate={simulate}
        />
      )}

      {active === 'xendit' && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Bring your own Xendit</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="xendit-secret" className={labelCls}>Secret key</label>
              <input
                id="xendit-secret"
                type="password"
                placeholder="xnd_development_..."
                value={xenditSecret}
                onChange={(e) => setXenditSecret(e.target.value)}
                className={inputCls}
              />
              <p className={helpCls}>Find this under Settings → API keys in your Xendit dashboard.</p>
            </div>
            <div>
              <label htmlFor="xendit-callback" className={labelCls}>Callback token (optional)</label>
              <input
                id="xendit-callback"
                value={xenditCallback}
                onChange={(e) => setXenditCallback(e.target.value)}
                className={inputCls}
              />
            </div>
            {showActive('xendit')?.secretKeyLast4 && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                Currently saved: …{showActive('xendit')?.secretKeyLast4}
              </span>
            )}
          </div>
        </div>
      )}

      {active === 'paypal' && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Bring your own PayPal</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="pp-client" className={labelCls}>Client ID</label>
              <input
                id="pp-client"
                value={paypalClientId}
                onChange={(e) => setPaypalClientId(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="pp-secret" className={labelCls}>Secret</label>
              <input
                id="pp-secret"
                type="password"
                value={paypalSecret}
                onChange={(e) => setPaypalSecret(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <p className={labelCls}>Mode</p>
              <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                {(['sandbox', 'live'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaypalMode(m)}
                    className={
                      'h-8 rounded-sm px-4 text-xs font-medium capitalize transition-colors ' +
                      (paypalMode === m
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground')
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {active === 'midtrans' && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Midtrans credentials</h2>
          {showActive('midtrans')?.status === 'active' && (
            <div className="mb-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Kv label="Status" value="Active" />
              <Kv label="Environment" value={(showActive('midtrans')?.publicConfig as { env?: string } | null)?.env ?? '—'} />
              <Kv label="Merchant ID" value={(showActive('midtrans')?.publicConfig as { merchantId?: string } | null)?.merchantId ?? '—'} mono />
              <Kv label="Server key" value={showActive('midtrans')?.secretKeyLast4 ? `… ${showActive('midtrans')!.secretKeyLast4}` : '—'} mono />
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="mt-server" className={labelCls}>
                Server Key <span className="text-red-500">*</span>
              </label>
              <input
                id="mt-server"
                type="password"
                placeholder={
                  showActive('midtrans')?.status === 'active' ? 'Enter a new key to rotate' : 'SB-Mid-server-… or Mid-server-…'
                }
                value={midtransServerKey}
                onChange={(e) => {
                  const v = e.target.value;
                  setMidtransServerKey(v);
                  if (v.startsWith('SB-')) setMidtransEnv('sandbox');
                  else if (v.startsWith('Mid-server-')) setMidtransEnv('production');
                }}
                className={inputCls}
              />
              <p className={helpCls}>Settings → Access Keys → Server Key in the Midtrans dashboard.</p>
            </div>
            <div>
              <label htmlFor="mt-client" className={labelCls}>
                Client Key <span className="text-red-500">*</span>
              </label>
              <input
                id="mt-client"
                placeholder="SB-Mid-client-… or Mid-client-…"
                value={midtransClientKey}
                onChange={(e) => setMidtransClientKey(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="mt-merchant" className={labelCls}>
                Merchant ID <span className="text-red-500">*</span>
              </label>
              <input
                id="mt-merchant"
                placeholder="G…"
                value={midtransMerchantId}
                onChange={(e) => setMidtransMerchantId(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <p className={labelCls}>Environment</p>
              <div className="flex items-center gap-4">
                {(['sandbox', 'production'] as const).map((m) => (
                  <label key={m} className="inline-flex items-center gap-2 text-sm capitalize">
                    <input
                      type="radio"
                      name="mt-env"
                      checked={midtransEnv === m}
                      onChange={() => setMidtransEnv(m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {active === 'manual' && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Offline & manual payments</h2>
          <p className="mb-5 max-w-[68ch] text-sm text-muted-foreground">
            For payments Plugipay doesn&rsquo;t route through a PSP: direct bank transfer to your own
            account, cash, EDC receipts. Sessions land in{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">pending_review</code> — you confirm each
            one from the Checkout Sessions page once the money arrives.
          </p>
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className={labelCls}>Bank accounts</p>
                <button
                  type="button"
                  onClick={() =>
                    setManualBankAccounts((prev) => [...prev, { bankName: '', accountNumber: '', accountHolder: '' }])
                  }
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add account
                </button>
              </div>
              {manualBankAccounts.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                  No bank accounts yet. Add at least one to accept bank-transfer payments.
                </p>
              ) : (
                <div className="space-y-3">
                  {manualBankAccounts.map((acc, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 md:grid-cols-[1fr_1.2fr_1.5fr_auto]">
                      <input
                        placeholder="BCA / BNI / Mandiri"
                        value={acc.bankName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualBankAccounts((prev) => prev.map((a, i) => (i === idx ? { ...a, bankName: v } : a)));
                        }}
                        className={inputCls}
                      />
                      <input
                        placeholder="Account number"
                        value={acc.accountNumber}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualBankAccounts((prev) => prev.map((a, i) => (i === idx ? { ...a, accountNumber: v } : a)));
                        }}
                        className={inputCls}
                      />
                      <input
                        placeholder="Account holder name"
                        value={acc.accountHolder}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualBankAccounts((prev) => prev.map((a, i) => (i === idx ? { ...a, accountHolder: v } : a)));
                        }}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={() => setManualBankAccounts((prev) => prev.filter((_, i) => i !== idx))}
                        className="justify-self-end rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                        aria-label="Remove account"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className={helpCls}>Shown verbatim on the hosted checkout page when a customer picks &ldquo;Bank transfer&rdquo;.</p>
            </div>

            <div>
              <label htmlFor="manual-qr" className={labelCls}>Static QRIS image URL</label>
              <div className="flex items-start gap-3">
                {manualStaticQrUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={manualStaticQrUrl} alt="" className="h-16 w-16 rounded border border-border object-cover" />
                )}
                <input
                  id="manual-qr"
                  placeholder="https://cdn.example.com/qris.png"
                  value={manualStaticQrUrl}
                  onChange={(e) => setManualStaticQrUrl(e.target.value)}
                  className={inputCls}
                />
              </div>
              <p className={helpCls}>Optional. Use this when you have a printed QRIS from your bank and want to reuse it.</p>
            </div>

            <div>
              <label htmlFor="manual-instructions" className={labelCls}>Extra instructions</label>
              <input
                id="manual-instructions"
                placeholder="Include the order ID in the transfer note"
                value={manualInstructions}
                onChange={(e) => setManualInstructions(e.target.value)}
                className={inputCls}
              />
              <p className={helpCls}>Shown above the bank details on the hosted page. Keep it short.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={(mono ? 'font-mono text-[12.5px] ' : 'text-sm ') + 'text-foreground'}>{value}</p>
    </div>
  );
}

function stageIndex(status: string): number {
  const i = KYB_STAGES.findIndex((s) => s.id === status);
  return i === -1 ? 0 : i;
}

function ManagedOnboardingCard({
  state,
  email,
  setEmail,
  busy,
  onStart,
  onRefresh,
  onSimulate,
}: {
  state: ManagedOnboardingDTO | null;
  email: string;
  setEmail: (v: string) => void;
  busy: boolean;
  onStart: () => void;
  onRefresh: () => void;
  onSimulate: (patch: Parameters<typeof plugipaySettingsApi.simulateManagedStatus>[0]) => void;
}) {
  const started = !!state;
  const rejected = state?.kybStatus === 'rejected';
  const currentIdx = rejected ? 1 : stageIndex(state?.kybStatus ?? 'not_started');
  const stageNow = KYB_STAGES[currentIdx]!;
  const isDev = typeof window !== 'undefined' && !/plugipay\.com$/.test(window.location.hostname);

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 flex items-center gap-3 text-base font-semibold">
        Plugipay managed — Xendit onboarding
        {state?.payoutsReady && (
          <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
            Payouts ready
          </span>
        )}
      </h2>
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Managed sub-accounts settle directly from Xendit to your bank. Give us the email you want Xendit to
          invite, then finish KYB + link your payout bank in the Xendit dashboard.
        </p>

        <div className="rounded-md border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            {KYB_STAGES.map((s, i) => {
              const reached = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <React.Fragment key={s.id}>
                  <div className={'flex shrink-0 flex-col items-center gap-1 ' + (reached ? 'text-foreground' : 'text-muted-foreground')}>
                    <span
                      className={
                        'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ' +
                        (reached ? 'bg-primary text-primary-foreground' : 'border border-border bg-muted text-muted-foreground') +
                        (isCurrent && !rejected ? ' ring-2 ring-primary/40 ring-offset-2 ring-offset-card' : '')
                      }
                    >
                      {i + 1}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-wide">{s.label}</span>
                  </div>
                  {i < KYB_STAGES.length - 1 && (
                    <div className={'h-px flex-1 ' + (i < currentIdx ? 'bg-primary' : 'bg-border')} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {rejected ? "Xendit rejected the KYB. Fix the issues in Xendit's dashboard and resubmit." : stageNow.description}
          </p>
        </div>

        {!started && (
          <div className="space-y-2">
            <label htmlFor="managed-email" className={labelCls}>Business email for Xendit invitation</label>
            <div className="flex gap-2">
              <input
                id="managed-email"
                type="email"
                placeholder="finance@your-biz.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
              <button type="button" onClick={onStart} disabled={busy || !email.trim()} className={btnPrimary}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Start onboarding
              </button>
            </div>
            <p className={helpCls}>
              Xendit will email a verification link to this address. The recipient finishes KYB and links the
              payout bank account in Xendit&apos;s dashboard.
            </p>
          </div>
        )}

        {started && (
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Kv label="Sub-account" value={state!.subAccountId} mono />
            <Kv label="Invited email" value={state!.email ?? '—'} mono />
            <Kv label="KYB status" value={state!.kybStatus} mono />
            <Kv label="Capabilities" value={state!.capabilitiesStatus} mono />
            <Kv label="Last webhook" value={state!.lastWebhookAt ? new Date(state!.lastWebhookAt).toLocaleString() : 'never'} mono />
            <Kv label="Payouts ready" value={state!.payoutsReady ? 'yes' : 'no'} mono />
          </div>
        )}

        {started && (
          <div className="flex flex-wrap gap-2">
            {state!.onboardingUrl && (
              <a href={state!.onboardingUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
                Continue onboarding in Xendit →
              </a>
            )}
            <button type="button" onClick={onRefresh} disabled={busy} className={btnSecondary}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Refresh status
            </button>
          </div>
        )}

        {!state?.payoutsReady && started && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <strong>Heads up:</strong> managed methods (QRIS, VA, OVO, cards) stay hidden from checkout until
            Xendit marks your sub-account live. If you need to accept payments today, wire up{' '}
            <em>Bring your own Xendit/Midtrans</em> or <em>Offline &amp; manual</em> first.
          </div>
        )}

        {isDev && started && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-xs">
            <p className="font-mono uppercase tracking-wide text-muted-foreground">Dev-only · simulate webhook</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onSimulate({ kybStatus: 'registered' })} className={btnSecondary}>
                Mark registered
              </button>
              <button type="button" onClick={() => onSimulate({ kybStatus: 'live' })} className={btnSecondary}>
                Mark KYB live
              </button>
              <button type="button" onClick={() => onSimulate({ capabilitiesStatus: 'live', payoutsReady: true })} className={btnSecondary}>
                Capabilities live + payouts ready
              </button>
              <button type="button" onClick={() => onSimulate({ payoutsReady: false })} className={btnSecondary}>
                Reset payouts
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
