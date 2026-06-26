'use client';

import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Check, User, ShieldCheck } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';

/*
 * Settings — business profile (how Malapos behaves) + the signed-in
 * user's own Forjio identity (name / email / password), which lives in
 * Huudis and is edited through the IAM proxy (/api/v1/huudis/account*).
 */

type BusinessType = 'GENERAL' | 'RETAIL' | 'FNB' | 'PHARMACY';

type SettingsRecord = {
  id: string;
  businessName: string;
  businessType: BusinessType;
  currency: string;
  transferBankName: string | null;
  transferBankAccountNumber: string | null;
  transferBankAccountHolder: string | null;
};

const TYPE_OPTIONS: { value: BusinessType; label: string; hint: string }[] = [
  { value: 'GENERAL', label: 'General', hint: 'A balanced default for any small business.' },
  { value: 'RETAIL', label: 'Retail', hint: 'Barcode scanning + SKU-first search on the sell screen.' },
  { value: 'FNB', label: 'F&B', hint: 'Menus, modifiers and table-friendly ordering.' },
  { value: 'PHARMACY', label: 'Pharmacy', hint: 'Batch and expiry tracking on stock and sales.' },
];

const inputCls =
  'mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Your business profile, and your Forjio account.
          </p>
        </div>
      </div>

      <BusinessSection />
      <ProfileSection />
      <SecuritySection />
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="text-primary">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusRow({ saved, error }: { saved: boolean; error: string | null }) {
  if (error) return <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>;
  if (saved)
    return (
      <span className="flex items-center gap-1 text-sm text-primary">
        <Check className="h-4 w-4" /> Saved
      </span>
    );
  return null;
}

// ─── Business profile (PosSettings, /api/v1/settings) ──────────────────────
function BusinessSection() {
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('GENERAL');
  const [currency, setCurrency] = useState('IDR');
  const [transferBankName, setTransferBankName] = useState('');
  const [transferBankAccountNumber, setTransferBankAccountNumber] = useState('');
  const [transferBankAccountHolder, setTransferBankAccountHolder] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ settings: SettingsRecord }>('/settings');
        const s = res.data.settings;
        setBusinessName(s.businessName ?? '');
        setBusinessType(s.businessType ?? 'GENERAL');
        setCurrency(s.currency ?? 'IDR');
        setTransferBankName(s.transferBankName ?? '');
        setTransferBankAccountNumber(s.transferBankAccountNumber ?? '');
        setTransferBankAccountHolder(s.transferBankAccountHolder ?? '');
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await api.put<{ settings: SettingsRecord }>('/settings', {
        businessName: businessName.trim(),
        businessType,
        currency,
        transferBankName: transferBankName.trim(),
        transferBankAccountNumber: transferBankAccountNumber.trim(),
        transferBankAccountHolder: transferBankAccountHolder.trim(),
      });
      const s = res.data.settings;
      setBusinessName(s.businessName ?? '');
      setBusinessType(s.businessType ?? 'GENERAL');
      setTransferBankName(s.transferBankName ?? '');
      setTransferBankAccountNumber(s.transferBankAccountNumber ?? '');
      setTransferBankAccountHolder(s.transferBankAccountHolder ?? '');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      icon={<SettingsIcon className="h-5 w-5" />}
      title="Business profile"
      subtitle="How Malapos behaves for your shop."
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form onSubmit={save} className="max-w-xl space-y-6">
          <label className="block">
            <span className="text-sm font-medium">Business name</span>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Toko Sumber Rejeki"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Business type</span>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value as BusinessType)}
              className={inputCls}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-xs text-muted-foreground">
              {TYPE_OPTIONS.find((o) => o.value === businessType)?.hint}
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Currency</span>
            <input
              value={currency}
              readOnly
              className="mt-1.5 w-full cursor-not-allowed rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground outline-none"
            />
            <span className="mt-1.5 block text-xs text-muted-foreground">
              Only IDR (Indonesian Rupiah) is supported in v1.
            </span>
          </label>

          <div className="space-y-4 rounded-md border border-border bg-muted/20 p-4">
            <div>
              <h3 className="text-sm font-semibold">Bank transfer account</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shown to a customer who pays by bank transfer on the sell screen. This is
                separate from your Plugipay payout account — it&apos;s the account customers
                transfer to at the counter.
              </p>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Bank name</span>
              <input
                value={transferBankName}
                onChange={(e) => setTransferBankName(e.target.value)}
                placeholder="e.g. BCA"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Account number</span>
              <input
                value={transferBankAccountNumber}
                onChange={(e) => setTransferBankAccountNumber(e.target.value)}
                placeholder="e.g. 1234567890"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Account holder</span>
              <input
                value={transferBankAccountHolder}
                onChange={(e) => setTransferBankAccountHolder(e.target.value)}
                placeholder="e.g. Toko Sumber Rejeki"
                className={inputCls}
              />
            </label>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !businessName.trim()}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <StatusRow saved={saved} error={error} />
          </div>
        </form>
      )}
    </SectionCard>
  );
}

// ─── Profile: display name (PATCH /api/v1/huudis/account) ──────────────────
function ProfileSection() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ name?: string; email?: string }>('/huudis/account');
        setName(res.data.name ?? '');
        setEmail(res.data.email ?? '');
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.patch('/huudis/account', { name: name.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      icon={<User className="h-5 w-5" />}
      title="Your profile"
      subtitle="Your Forjio account — used across every Forjio product."
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form onSubmit={save} className="max-w-xl space-y-6">
          <label className="block">
            <span className="text-sm font-medium">Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <p className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{email}</span> — change your email
            below.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save name'}
            </button>
            <StatusRow saved={saved} error={error} />
          </div>
        </form>
      )}
    </SectionCard>
  );
}

// ─── Account security: email + password change (Huudis proxy) ──────────────
function SecuritySection() {
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailMsg(null);
    setEmailErr(null);
    try {
      await api.post('/huudis/account/email-change', { email: newEmail.trim(), password: emailPw });
      setEmailMsg(`Confirmation sent to ${newEmail.trim()}. Click the link there to finish the change.`);
      setNewEmail('');
      setEmailPw('');
    } catch (err) {
      setEmailErr(err instanceof ApiRequestError ? err.message : 'Failed to request email change');
    } finally {
      setEmailBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwSaved(false);
    setPwErr(null);
    try {
      await api.post('/huudis/account/password-change', {
        currentPassword: curPw,
        newPassword: newPw,
      });
      setPwSaved(true);
      setCurPw('');
      setNewPw('');
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) {
      setPwErr(err instanceof ApiRequestError ? err.message : 'Failed to change password');
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <SectionCard
      icon={<ShieldCheck className="h-5 w-5" />}
      title="Account security"
      subtitle="Change your sign-in email or password."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <form onSubmit={changeEmail} className="space-y-4">
          <h3 className="text-sm font-medium">Change email</h3>
          <label className="block">
            <span className="text-xs text-muted-foreground">New email</span>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Current password</span>
            <input
              type="password"
              required
              value={emailPw}
              onChange={(e) => setEmailPw(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            disabled={emailBusy || !newEmail.trim() || !emailPw}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-primary disabled:opacity-40"
          >
            {emailBusy ? 'Sending…' : 'Send confirmation'}
          </button>
          {emailMsg && <p className="text-xs text-primary">{emailMsg}</p>}
          {emailErr && <p className="text-xs text-destructive">{emailErr}</p>}
        </form>

        <form onSubmit={changePassword} className="space-y-4">
          <h3 className="text-sm font-medium">Change password</h3>
          <label className="block">
            <span className="text-xs text-muted-foreground">Current password</span>
            <input
              type="password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">New password (min 10 characters)</span>
            <input
              type="password"
              required
              minLength={10}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            disabled={pwBusy || newPw.length < 10}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-primary disabled:opacity-40"
          >
            {pwBusy ? 'Updating…' : 'Update password'}
          </button>
          {pwSaved && (
            <p className="flex items-center gap-1 text-xs text-primary">
              <Check className="h-3.5 w-3.5" /> Password changed — other sessions signed out.
            </p>
          )}
          {pwErr && <p className="text-xs text-destructive">{pwErr}</p>}
        </form>
      </div>
    </SectionCard>
  );
}
