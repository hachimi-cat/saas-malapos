'use client';

import { useEffect, useState } from 'react';
import {
  Plug, Loader2, Plus, Mail, MessageCircle, Globe, Briefcase, Music2, Phone,
  Send, Hash, Bell, Zap, Webhook, Check, Video,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { AskAssistantEntry } from '@/components/catentio/agentic-entry';
import { marketingFetch } from '@/lib/marketing-api';
import {
  PROVIDERS,
  CATEGORIES,
  PROVIDER_BY_KEY,
  type Provider,
  type ProviderMeta,
} from '@/lib/channel-providers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';



interface Channel {
  id: string;
  provider: Provider;
  externalId: string | null;
  displayName: string;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  config: Record<string, unknown>;
  scopesGranted: string[];
  lastSyncedAt: string | null;
  lastError: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Icons live here, not in the catalog: they are React components and
 * `@/lib/channel-providers` is a plain module the assistant descriptor
 * imports too. Keyed by provider, so a new provider that forgets an
 * icon is a type error rather than a blank card.
 */
const PROVIDER_ICONS: Record<Provider, React.ComponentType<{ size?: number; className?: string }>> = {
  email_resend: Mail,
  email_sendgrid: Mail,
  email_mailgun: Mail,
  email_postmark: Mail,
  email_ses: Mail,
  sms_twilio: Phone,
  sms_vonage: Phone,
  whatsapp_cloud: MessageCircle,
  telegram_bot: Send,
  line_business: MessageCircle,
  discord_webhook: Hash,
  slack_webhook: Hash,
  push_onesignal: Bell,
  push_fcm: Bell,
  meta_business: Globe,
  linkedin: Briefcase,
  tiktok_business: Music2,
  twitter: Zap,
  youtube: Video,
  pinterest: Globe,
  threads: Hash,
  webhook_generic: Webhook,
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState<Provider | null>(null);
  const [testFor, setTestFor] = useState<Channel | null>(null);

  async function load() {
    try {
      const r = await marketingFetch('/api/v1/account/marketing/channels', { credentials: 'include' });
      const b = await r.json();
      setChannels(b?.data?.channels ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); }, []);

  async function disconnect(id: string) {
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/channels/${id}`, { method: 'DELETE', credentials: 'include' });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const connectedKeys = new Set((channels ?? []).filter((c) => c.status !== 'revoked').map((c) => c.provider));

  return (
    <div>
      <PageHeader
        title="Channels"
        description="Connect the send channels you use. Email, SMS, messaging apps, push, social."
        action={
          // "Ask assistant", not "New channel". bang, 2026-08-14:
          // *"marketing > channels doesn't have ask assistant button. at
          // least we need this to ask how to setup each channels"*, and
          // on behaviour: *"it should open the agentic sheet without the
          // manual input"*.
          //
          // Nothing manual is lost: connecting has always been the
          // per-provider cards below, each with its own field list. The
          // agent proposes provider + display name and explains where
          // each credential comes from; the values stay the merchant's
          // to paste.
          <AskAssistantEntry
            resource="channels"
            mode="create"
            onApplied={() => { void load(); }}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          />
        }
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">{notice}</div>}

      <h2 className="mb-3 text-sm font-semibold tracking-tight font-display">Connected</h2>
      {channels === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : channels.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No channels connected yet.</Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {channels.map((c) => {
              const meta = PROVIDER_BY_KEY[c.provider];
              const Icon = PROVIDER_ICONS[c.provider] ?? Plug;
              return (
                <li key={c.id} className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.displayName}</p>
                    <p className="text-xs text-muted-foreground">{meta?.label ?? c.provider} · {meta?.category}</p>
                  </div>
                  <Badge variant="outline" className={`rounded-full border-transparent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    c.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' :
                    c.status === 'expired' ? 'bg-amber-500/10 text-amber-600' :
                    c.status === 'revoked' ? 'bg-secondary text-muted-foreground' :
                    'bg-sky-500/10 text-sky-400'
                  }`}>{c.status}</Badge>
                  {c.status === 'active' && (
                    <Button variant="link" onClick={() => setTestFor(c)} className="ml-2 h-auto p-0 text-xs text-foreground">Send test</Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="link" className="ml-2 h-auto p-0 text-xs text-destructive">Disconnect</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect this channel?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Existing scheduled sends on this channel will stop.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep connected</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => disconnect(c.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold tracking-tight font-display">All channels</h2>
      <div className="space-y-8">
        {CATEGORIES.map((cat) => {
          const inCat = PROVIDERS.filter((p) => p.category === cat);
          if (inCat.length === 0) return null;
          return (
            <div key={cat}>
              <p className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{cat}</p>
              <Card className="overflow-hidden">
                <ul>
                  {inCat.map((p) => {
                    const Icon = PROVIDER_ICONS[p.key];
                    const connected = connectedKeys.has(p.key);
                    const isOauth = p.authKind === 'oauth';
                    return (
                      <li key={p.key} className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{p.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.blurb}</p>
                        </div>
                        {connected ? (
                          <Badge variant="outline" className="gap-1 rounded-full border-transparent bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-600">
                            <Check size={10} /> connected
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => !isOauth && setAdding(p.key)}
                            disabled={isOauth}
                          >
                            <Plus size={12} /> {isOauth ? 'OAuth (soon)' : 'Connect'}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          );
        })}
      </div>

      {adding && (
        <ConnectModal
          meta={PROVIDER_BY_KEY[adding]}
          onClose={() => setAdding(null)}
          onConnected={async () => { setAdding(null); await load(); }}
        />
      )}

      {testFor && (
        <TestChannelModal
          channel={testFor}
          onClose={() => setTestFor(null)}
          onSent={(messageId) => {
            setTestFor(null);
            setNotice(`Test queued (message ${messageId.slice(0, 8)}…). Check the recipient — delivery typically arrives within ~10s.`);
          }}
        />
      )}
    </div>
  );
}

function TestChannelModal({ channel, onClose, onSent }: { channel: Channel; onClose: () => void; onSent: (messageId: string) => void }) {
  const [recipient, setRecipient] = useState('');
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setWorking(true);
    setErr(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/channels/${channel.id}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipient: recipient.trim() }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'test send failed');
      onSent(b?.data?.messageId ?? '');
    } catch (e) {
      setErr((e as Error).message);
    } finally { setWorking(false); }
  }

  const provider = channel.provider;
  const placeholder = provider.startsWith('email_') ? 'you@example.com'
    : provider.startsWith('sms_') || provider === 'whatsapp_cloud' ? '+628…'
    : provider === 'telegram_bot' ? 'chatId (numeric)'
    : provider === 'discord_webhook' || provider === 'slack_webhook' ? 'ignored — sent to webhook URL'
    : 'recipient handle / id';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Send test on {channel.displayName}</DialogTitle>
          <p className="text-xs text-muted-foreground">Dispatches a one-shot canned message through this integration so you can confirm credentials and routing.</p>
        </DialogHeader>
        {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-xs">{err}</div>}
        <div className="space-y-1.5">
          <Label htmlFor="testRecipient" className="text-xs text-muted-foreground">Recipient</Label>
          <Input
            id="testRecipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            size="sm"
            onClick={send}
            disabled={working || (provider !== 'discord_webhook' && provider !== 'slack_webhook' && !recipient.trim())}
          >
            {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Send test
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConnectModal({ meta, onClose, onConnected }: { meta: ProviderMeta; onClose: () => void; onConnected: () => void | Promise<void> }) {
  const [displayName, setDisplayName] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const r = await marketingFetch('/api/v1/account/marketing/channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: meta.key, displayName, credentials: creds }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'connect failed');
      await onConnected();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Connect {meta.label}</DialogTitle>
            <p className="text-xs text-muted-foreground">{meta.blurb}</p>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="connectDisplayName" className="text-xs text-muted-foreground">Display name</Label>
            <Input id="connectDisplayName" type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. @mambo_official" />
          </div>
          {(meta.fields ?? []).map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`connect-${f.key}`} className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                id={`connect-${f.key}`}
                type={f.type ?? 'text'}
                required
                value={creds[f.key] ?? ''}
                onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="font-mono"
              />
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={working} className="flex-1">
              {working ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
