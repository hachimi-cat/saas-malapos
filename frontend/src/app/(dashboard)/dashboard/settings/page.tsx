'use client';

import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Check, User, ShieldCheck } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/*
 * Settings — business profile (how Malapos behaves) + the signed-in
 * user's own Forjio identity (name / email / password), which lives in
 * Huudis and is edited through the IAM proxy (/api/v1/huudis/account*).
 *
 * Phase 1 of the UI revamp: this page is the shadcn/ui proof. Every other
 * dashboard page still renders with the bespoke @forjio markup. Behaviour
 * and data wiring are unchanged — only the presentation primitives swapped
 * to shadcn (Card / Input / Label / Button / Select / Badge / Separator).
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

export default function SettingsPage() {
  return (
    <div className="space-y-8">
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="text-primary">{icon}</span>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription className="text-xs">{subtitle}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StatusRow({ saved, error }: { saved: boolean; error: string | null }) {
  if (error)
    return (
      <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
    );
  if (saved)
    return (
      <Badge variant="secondary" className="gap-1 text-primary">
        <Check className="h-3.5 w-3.5" /> Saved
      </Badge>
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
          <div className="space-y-1.5">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Toko Sumber Rejeki"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="businessType">Business type</Label>
            <Select
              value={businessType}
              onValueChange={(v) => setBusinessType(v as BusinessType)}
            >
              <SelectTrigger id="businessType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {TYPE_OPTIONS.find((o) => o.value === businessType)?.hint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              value={currency}
              readOnly
              className="cursor-not-allowed bg-muted text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Only IDR (Indonesian Rupiah) is supported in v1.
            </p>
          </div>

          <div className="space-y-4 rounded-md border border-border bg-muted/20 p-4">
            <div>
              <h3 className="text-sm font-semibold">Bank transfer account</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shown to a customer who pays by bank transfer on the sell screen. This is
                separate from your Plugipay payout account — it&apos;s the account customers
                transfer to at the counter.
              </p>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="transferBankName">Bank name</Label>
              <Input
                id="transferBankName"
                value={transferBankName}
                onChange={(e) => setTransferBankName(e.target.value)}
                placeholder="e.g. BCA"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transferBankAccountNumber">Account number</Label>
              <Input
                id="transferBankAccountNumber"
                value={transferBankAccountNumber}
                onChange={(e) => setTransferBankAccountNumber(e.target.value)}
                placeholder="e.g. 1234567890"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transferBankAccountHolder">Account holder</Label>
              <Input
                id="transferBankAccountHolder"
                value={transferBankAccountHolder}
                onChange={(e) => setTransferBankAccountHolder(e.target.value)}
                placeholder="e.g. Toko Sumber Rejeki"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={saving || !businessName.trim()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
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
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{email}</span> — change your email
            below.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save name'}
            </Button>
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
          <div className="space-y-1.5">
            <Label htmlFor="newEmail">New email</Label>
            <Input
              id="newEmail"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emailPw">Current password</Label>
            <Input
              id="emailPw"
              type="password"
              required
              value={emailPw}
              onChange={(e) => setEmailPw(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={emailBusy || !newEmail.trim() || !emailPw}
          >
            {emailBusy ? 'Sending…' : 'Send confirmation'}
          </Button>
          {emailMsg && <p className="text-xs text-primary">{emailMsg}</p>}
          {emailErr && <p className="text-xs text-destructive">{emailErr}</p>}
        </form>

        <form onSubmit={changePassword} className="space-y-4">
          <h3 className="text-sm font-medium">Change password</h3>
          <div className="space-y-1.5">
            <Label htmlFor="curPw">Current password</Label>
            <Input
              id="curPw"
              type="password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPw">New password (min 10 characters)</Label>
            <Input
              id="newPw"
              type="password"
              required
              minLength={10}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={pwBusy || newPw.length < 10}>
            {pwBusy ? 'Updating…' : 'Update password'}
          </Button>
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
