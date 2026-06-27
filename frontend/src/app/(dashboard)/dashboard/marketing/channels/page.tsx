'use client';

import { useEffect, useState } from 'react';
import {
  Plug, Loader2, Plus, Mail, MessageCircle, Globe, Briefcase, Music2, Phone,
  Send, Hash, Bell, Zap, Webhook, Check, Video,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
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

type Provider =
  | 'email_resend' | 'email_sendgrid' | 'email_mailgun' | 'email_postmark' | 'email_ses'
  | 'sms_twilio' | 'sms_vonage'
  | 'whatsapp_cloud' | 'telegram_bot' | 'line_business' | 'discord_webhook' | 'slack_webhook'
  | 'push_onesignal' | 'push_fcm'
  | 'meta_business' | 'linkedin' | 'tiktok_business' | 'twitter' | 'youtube' | 'pinterest' | 'threads'
  | 'webhook_generic';

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

interface ProviderField {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password';
}

interface ProviderMeta {
  key: Provider;
  label: string;
  category: 'Email' | 'SMS' | 'Messaging' | 'Push' | 'Social' | 'Generic';
  icon: React.ComponentType<{ size?: number; className?: string }>;
  blurb: string;
  authKind: 'api_key' | 'oauth' | 'webhook_url';
  fields?: ProviderField[];
}

const PROVIDERS: ProviderMeta[] = [
  // Email
  { key: 'email_resend', label: 'Resend', category: 'Email', icon: Mail, blurb: 'Modern transactional + marketing email API.', authKind: 'api_key', fields: [
    { key: 'apiKey', label: 'API key', placeholder: 're_…', type: 'password' },
    { key: 'fromEmail', label: 'From address', placeholder: 'hello@yourstore.com' },
    { key: 'fromName', label: 'From name', placeholder: 'Your Store' },
  ] },
  { key: 'email_sendgrid', label: 'SendGrid', category: 'Email', icon: Mail, blurb: 'Twilio SendGrid email send.', authKind: 'api_key', fields: [
    { key: 'apiKey', label: 'API key', placeholder: 'SG.…', type: 'password' },
    { key: 'fromEmail', label: 'From address' },
    { key: 'fromName', label: 'From name' },
  ] },
  { key: 'email_mailgun', label: 'Mailgun', category: 'Email', icon: Mail, blurb: 'Mailgun European/US sending domain.', authKind: 'api_key', fields: [
    { key: 'apiKey', label: 'API key', placeholder: 'key-…', type: 'password' },
    { key: 'domain', label: 'Sending domain', placeholder: 'mg.yourstore.com' },
    { key: 'region', label: 'Region (us / eu)', placeholder: 'us' },
    { key: 'fromEmail', label: 'From address' },
    { key: 'fromName', label: 'From name' },
  ] },
  { key: 'email_postmark', label: 'Postmark', category: 'Email', icon: Mail, blurb: 'Transactional email — high deliverability.', authKind: 'api_key', fields: [
    { key: 'serverToken', label: 'Server token', type: 'password' },
    { key: 'fromEmail', label: 'From address' },
    { key: 'fromName', label: 'From name' },
  ] },
  { key: 'email_ses', label: 'AWS SES', category: 'Email', icon: Mail, blurb: 'Amazon Simple Email Service.', authKind: 'api_key', fields: [
    { key: 'accessKeyId', label: 'Access key ID' },
    { key: 'secretAccessKey', label: 'Secret access key', type: 'password' },
    { key: 'region', label: 'AWS region', placeholder: 'ap-southeast-1' },
    { key: 'fromEmail', label: 'From address' },
    { key: 'fromName', label: 'From name' },
  ] },
  // SMS
  { key: 'sms_twilio', label: 'Twilio SMS', category: 'SMS', icon: Phone, blurb: 'SMS via Twilio messaging service.', authKind: 'api_key', fields: [
    { key: 'accountSid', label: 'Account SID' },
    { key: 'authToken', label: 'Auth token', type: 'password' },
    { key: 'messagingServiceSid', label: 'Messaging service SID' },
  ] },
  { key: 'sms_vonage', label: 'Vonage SMS', category: 'SMS', icon: Phone, blurb: 'Vonage (formerly Nexmo) SMS API.', authKind: 'api_key', fields: [
    { key: 'apiKey', label: 'API key' },
    { key: 'apiSecret', label: 'API secret', type: 'password' },
    { key: 'fromNumber', label: 'From number / sender ID', placeholder: '+62…' },
  ] },
  // Messaging
  { key: 'whatsapp_cloud', label: 'WhatsApp', category: 'Messaging', icon: MessageCircle, blurb: 'WA Cloud API — campaign + transactional.', authKind: 'api_key', fields: [
    { key: 'phoneNumberId', label: 'Phone number ID' },
    { key: 'accessToken', label: 'Access token', type: 'password' },
    { key: 'businessAccountId', label: 'Business account ID' },
  ] },
  { key: 'telegram_bot', label: 'Telegram', category: 'Messaging', icon: Send, blurb: 'Bot API — broadcast to subscribers + DM.', authKind: 'api_key', fields: [
    { key: 'botToken', label: 'Bot token (from @BotFather)', type: 'password' },
    { key: 'defaultChatId', label: 'Default chat / channel ID', placeholder: '@yourchannel or -100…' },
  ] },
  { key: 'line_business', label: 'LINE Business', category: 'Messaging', icon: MessageCircle, blurb: 'LINE Official Account messaging API.', authKind: 'api_key', fields: [
    { key: 'channelId', label: 'Channel ID' },
    { key: 'channelAccessToken', label: 'Channel access token', type: 'password' },
    { key: 'channelSecret', label: 'Channel secret', type: 'password' },
  ] },
  { key: 'discord_webhook', label: 'Discord', category: 'Messaging', icon: Hash, blurb: 'Webhook to a single Discord channel.', authKind: 'webhook_url', fields: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/…', type: 'password' },
  ] },
  { key: 'slack_webhook', label: 'Slack', category: 'Messaging', icon: Hash, blurb: 'Incoming webhook to a Slack channel.', authKind: 'webhook_url', fields: [
    { key: 'webhookUrl', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/services/…', type: 'password' },
  ] },
  // Push
  { key: 'push_onesignal', label: 'OneSignal', category: 'Push', icon: Bell, blurb: 'Web + mobile push notifications.', authKind: 'api_key', fields: [
    { key: 'appId', label: 'App ID' },
    { key: 'restApiKey', label: 'REST API key', type: 'password' },
  ] },
  { key: 'push_fcm', label: 'Firebase Cloud Messaging', category: 'Push', icon: Bell, blurb: 'Mobile push via FCM (HTTP v1).', authKind: 'api_key', fields: [
    { key: 'projectId', label: 'Project ID' },
    { key: 'serviceAccountJson', label: 'Service account JSON', placeholder: 'paste full JSON here', type: 'password' },
  ] },
  // Social
  { key: 'meta_business', label: 'Meta (FB + IG)', category: 'Social', icon: Globe, blurb: 'Page posts + IG Business posts via Graph API.', authKind: 'oauth' },
  { key: 'linkedin', label: 'LinkedIn', category: 'Social', icon: Briefcase, blurb: 'Personal + Company page posts.', authKind: 'oauth' },
  { key: 'tiktok_business', label: 'TikTok', category: 'Social', icon: Music2, blurb: 'Business account posts via TikTok API.', authKind: 'api_key', fields: [
    { key: 'accessToken', label: 'Access token', type: 'password' },
    { key: 'advertiserId', label: 'Advertiser ID' },
  ] },
  { key: 'twitter', label: 'X (Twitter)', category: 'Social', icon: Zap, blurb: 'Post to X via the v2 API.', authKind: 'oauth' },
  { key: 'youtube', label: 'YouTube', category: 'Social', icon: Video, blurb: 'Channel posts (Community tab).', authKind: 'oauth' },
  { key: 'pinterest', label: 'Pinterest', category: 'Social', icon: Globe, blurb: 'Pin to boards via Pinterest API.', authKind: 'oauth' },
  { key: 'threads', label: 'Threads', category: 'Social', icon: Hash, blurb: 'Threads posts via Meta Graph.', authKind: 'oauth' },
  // Generic
  { key: 'webhook_generic', label: 'Generic webhook', category: 'Generic', icon: Webhook, blurb: 'POST to any URL — for in-house tools / Zapier-style hooks.', authKind: 'webhook_url', fields: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://your-endpoint.example.com/hook', type: 'password' },
    { key: 'authHeader', label: 'Authorization header (optional)', placeholder: 'Bearer …', type: 'password' },
  ] },
];

const PROVIDER_BY_KEY = Object.fromEntries(PROVIDERS.map((p) => [p.key, p])) as Record<Provider, ProviderMeta>;
const CATEGORIES: ProviderMeta['category'][] = ['Email', 'SMS', 'Messaging', 'Push', 'Social', 'Generic'];

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
        icon={Plug}
        title="Channels"
        description="Connect the send channels you use. Email, SMS, messaging apps, push, social."
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
              const Icon = meta?.icon ?? Plug;
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
              <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{cat}</p>
              <Card className="overflow-hidden">
                <ul>
                  {inCat.map((p) => {
                    const Icon = p.icon;
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
