'use client';

import { useEffect, useState } from 'react';
import { Mail, Loader2, Send, Plug, Users, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
import { resolveProviders } from '@/lib/compose-providers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Channel {
  id: string;
  provider: string;
  displayName: string;
  status: string;
}
interface ContactList {
  id: string;
  name: string;
  memberCount: number;
}
interface Campaign {
  id: string;
  name: string;
  status: string;
  providers: string[];
  createdAt: string;
  _count?: { messages: number };
}

const CHANNEL_LABELS: Record<string, string> = {
  email_resend: 'Resend (Email)', email_sendgrid: 'SendGrid (Email)', email_mailgun: 'Mailgun (Email)',
  email_postmark: 'Postmark (Email)', email_ses: 'AWS SES (Email)',
  sms_twilio: 'Twilio (SMS)', sms_vonage: 'Vonage (SMS)',
  whatsapp_cloud: 'WhatsApp', telegram_bot: 'Telegram', line_business: 'LINE',
  discord_webhook: 'Discord', slack_webhook: 'Slack',
  push_onesignal: 'OneSignal', push_fcm: 'FCM',
  meta_business: 'Meta', linkedin: 'LinkedIn', tiktok_business: 'TikTok',
  twitter: 'X', youtube: 'YouTube', pinterest: 'Pinterest', threads: 'Threads',
  webhook_generic: 'Generic webhook',
};

export default function ComposePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [past, setPast] = useState<Campaign[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickedLists, setPickedLists] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailHtml, setEmailHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [testProvider, setTestProvider] = useState<string>('');
  const [testRecipient, setTestRecipient] = useState('');
  const [testWorking, setTestWorking] = useState(false);

  async function loadAll() {
    try {
      const [c, l, p] = await Promise.all([
        marketingFetch('/api/v1/account/marketing/channels', { credentials: 'include' }).then((r) => r.json()),
        marketingFetch('/api/v1/account/marketing/contact-lists', { credentials: 'include' }).then((r) => r.json()),
        // Past blasts list — ripllo 0.3.0 moved this from
        // /marketing-campaigns (now the campaign HUB) to /broadcasts.
        marketingFetch('/api/v1/account/marketing/broadcasts', { credentials: 'include' }).then((r) => r.json()),
      ]);
      // The marketing proxy relays Ripllo's payload verbatim: channels →
      // { channels }, contact-lists → { lists }, broadcasts → { broadcasts }.
      // Reading `.data` directly gave an object (or undefined), so the lists
      // silently never populated. Read the wrapped field; fall back to the
      // bare array for safety.
      setChannels((c?.data?.channels ?? c?.data ?? []).filter((x: Channel) => x.status === 'active'));
      setLists(l?.data?.lists ?? l?.data ?? []);
      setPast(p?.data?.broadcasts ?? p?.data ?? []);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { loadAll(); }, []);

  function toggleProvider(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleList(id: string) {
    setPickedLists((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pickedProviders = Array.from(picked).map((id) => channels.find((c) => c.id === id)?.provider).filter(Boolean) as string[];
  const needsEmail = pickedProviders.some((p) => p.startsWith('email_'));
  const needsBody = pickedProviders.some((p) => !p.startsWith('email_'));

  async function send() {
    if (picked.size === 0) { setError('Pick at least one channel'); return; }
    if (pickedLists.size === 0) { setError('Pick at least one audience list'); return; }
    if (!name.trim()) { setError('Name required'); return; }
    // Map any generic tokens (e.g. 'email') to the merchant's
    // configured integration key (e.g. 'email_resend'). PR #3 caught
    // a regression where the form submitted `providers: ['email']`
    // and the API silently 400'd. See lib/compose-providers.
    const { resolved: resolvedProviders, unresolved } = resolveProviders(pickedProviders, channels);
    if (unresolved.length > 0) {
      setError(`No active channel found for: ${unresolved.join(', ')}. Connect one in Channels first.`);
      return;
    }
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const content: Record<string, Record<string, unknown>> = {};
      if (needsEmail) content.email = { subject: emailSubject, html: emailHtml, text: stripHtml(emailHtml) };
      if (needsBody) {
        const txt = bodyText || stripHtml(emailHtml);
        for (const p of resolvedProviders) {
          if (p.startsWith('email_')) continue;
          if (p === 'whatsapp_cloud' || p === 'whatsapp_twilio') content.whatsapp = { text: txt };
          else if (p === 'telegram_bot') content.telegram = { text: txt };
          else if (p === 'discord_webhook') content.discord = { text: txt };
          else if (p === 'slack_webhook') content.slack = { text: txt };
          else if (p.startsWith('sms_')) content.sms = { text: txt };
          else (content as Record<string, unknown>)[p] = { text: txt };
        }
      }

      const created = await marketingFetch('/api/v1/account/marketing/broadcasts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          providers: resolvedProviders,
          content,
          audience: { listIds: Array.from(pickedLists) },
        }),
      });
      const cb = await created.json();
      if (!created.ok) throw new Error(cb?.error?.message ?? 'create failed');
      const sent = await marketingFetch(`/api/v1/account/marketing/broadcasts/${cb.data.id}/send`, {
        method: 'POST', credentials: 'include',
      });
      const sb = await sent.json();
      if (!sent.ok) throw new Error(sb?.error?.message ?? 'send failed');
      setNotice(`Queued ${sb.data.queued} message(s).`);
      setName(''); setEmailSubject(''); setEmailHtml(''); setBodyText('');
      setPicked(new Set()); setPickedLists(new Set());
      await loadAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <PageHeader
        icon={Mail}
        title="Compose"
        description="Write once, fan out across the channels you pick. Audience comes from your lists."
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">{notice}</div>}

      {channels.length === 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <Plug className="h-5 w-5 shrink-0 text-amber-500" />
          <p>You haven&rsquo;t connected any channels yet. <Link href="/dashboard/marketing/channels" className="font-medium underline">Connect one →</Link></p>
        </div>
      )}
      {lists.length === 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <Users className="h-5 w-5 shrink-0 text-amber-500" />
          <p>You haven&rsquo;t created any contact lists yet. <Link href="/dashboard/marketing/audience" className="font-medium underline">Build a list →</Link></p>
        </div>
      )}

      <Section title="Campaign name">
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. November Flash Sale Announcement" />
      </Section>

      <Section title="Channels">
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active channels.</p>
        ) : (
          <div className="space-y-1.5">
            {channels.map((c) => {
              const checked = picked.has(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => toggleProvider(c.id)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${checked ? 'border-brand-500 bg-brand-500/5' : 'border-border'}`}
                >
                  <Checkbox checked={checked} className="pointer-events-none h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.displayName}</p>
                    <p className="text-xs text-muted-foreground">{CHANNEL_LABELS[c.provider] ?? c.provider}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Audience">
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lists yet.</p>
        ) : (
          <div className="space-y-1.5">
            {lists.map((l) => {
              const checked = pickedLists.has(l.id);
              return (
                <div
                  key={l.id}
                  onClick={() => toggleList(l.id)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${checked ? 'border-brand-500 bg-brand-500/5' : 'border-border'}`}
                >
                  <Checkbox checked={checked} className="pointer-events-none h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.memberCount} contact(s)</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {needsEmail && (
        <Section title="Email">
          <div className="space-y-1.5">
            <Label htmlFor="emailSubject" className="text-xs text-muted-foreground">Subject</Label>
            <Input id="emailSubject" type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emailHtml" className="text-xs text-muted-foreground">HTML body</Label>
            <Textarea id="emailHtml" rows={10} value={emailHtml} onChange={(e) => setEmailHtml(e.target.value)} className="font-mono" placeholder="<h1>Hi {firstName}</h1>" />
          </div>
        </Section>
      )}

      {needsBody && (
        <Section title="Message body" hint="Used for SMS / WhatsApp / Telegram / Discord / Slack. Falls back to a stripped version of the email HTML if you leave it blank.">
          <Textarea rows={5} value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Hey there, our flash sale is live — grab 20% off until Monday!" />
        </Section>
      )}

      <div className="mt-8 flex items-center justify-end gap-3 border-t border-border pt-6">
        <Button
          variant="outline"
          onClick={() => {
            if (picked.size === 0) { setError('Pick at least one channel first'); return; }
            setError(null);
            setTestProvider(pickedProviders[0] ?? '');
            setTestRecipient('');
            setShowTest(true);
          }}
          disabled={working || picked.size === 0 || !name.trim()}
        >
          <FlaskConical size={14} /> Send test
        </Button>
        <Button
          onClick={send}
          disabled={working || picked.size === 0 || pickedLists.size === 0 || !name.trim()}
        >
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={14} />}
          Send now
        </Button>
      </div>

      {showTest && (
        <Dialog open onOpenChange={(o) => !o && setShowTest(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Send test message</DialogTitle>
              <p className="text-xs text-muted-foreground">Saves the campaign as a draft and dispatches one message to the recipient you specify.</p>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="testChannel" className="text-xs text-muted-foreground">Channel</Label>
              <Select value={testProvider} onValueChange={(v) => setTestProvider(v)}>
                <SelectTrigger id="testChannel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pickedProviders.map((p) => (<SelectItem key={p} value={p}>{CHANNEL_LABELS[p] ?? p}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="testRecipient" className="text-xs text-muted-foreground">Recipient</Label>
              <Input
                id="testRecipient"
                type="text"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder={testProvider.startsWith('email_') ? 'you@example.com' : testProvider.startsWith('sms_') || testProvider === 'whatsapp_cloud' ? '+628…' : 'recipient handle / id'}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowTest(false)}>Cancel</Button>
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  if (!testRecipient.trim() || !testProvider) return;
                  // Resolve generic → specific provider keys (PR #3 fix).
                  const { resolved: resolvedProviders, unresolved } = resolveProviders(pickedProviders, channels);
                  if (unresolved.length > 0) {
                    setError(`No active channel found for: ${unresolved.join(', ')}. Connect one in Channels first.`);
                    return;
                  }
                  const { resolved: resolvedTestProviderArr } = resolveProviders([testProvider], channels);
                  const resolvedTestProvider = resolvedTestProviderArr[0] ?? testProvider;
                  setTestWorking(true);
                  setError(null);
                  try {
                    // Build content from current form state, then create a
                    // draft campaign + fire send-test against it.
                    const content: Record<string, Record<string, unknown>> = {};
                    if (needsEmail) content.email = { subject: emailSubject, html: emailHtml, text: stripHtml(emailHtml) };
                    if (needsBody) {
                      const txt = bodyText || stripHtml(emailHtml);
                      for (const p of resolvedProviders) {
                        if (p.startsWith('email_')) continue;
                        if (p === 'whatsapp_cloud' || p === 'whatsapp_twilio') content.whatsapp = { text: txt };
                        else if (p === 'telegram_bot') content.telegram = { text: txt };
                        else if (p === 'discord_webhook') content.discord = { text: txt };
                        else if (p === 'slack_webhook') content.slack = { text: txt };
                        else if (p.startsWith('sms_')) content.sms = { text: txt };
                        else (content as Record<string, unknown>)[p] = { text: txt };
                      }
                    }
                    const created = await marketingFetch('/api/v1/account/marketing/broadcasts', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ name: `[TEST] ${name}`, providers: resolvedProviders, content, audience: { listIds: [] } }),
                    });
                    const cb = await created.json();
                    if (!created.ok) throw new Error(cb?.error?.message ?? 'create failed');
                    const r = await marketingFetch(`/api/v1/account/marketing/broadcasts/${cb.data.id}/send-test`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ provider: resolvedTestProvider, recipient: testRecipient.trim() }),
                    });
                    const b = await r.json();
                    if (!r.ok) throw new Error(b?.error?.message ?? 'send-test failed');
                    setNotice(`Test queued. Check ${testRecipient.trim()} in a few seconds.`);
                    setShowTest(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally { setTestWorking(false); }
                }}
                disabled={testWorking || !testRecipient.trim() || !testProvider}
              >
                {testWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical size={12} />} Send
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-12 text-sm font-semibold tracking-tight">Past campaigns</h2>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead className="px-4 text-xs uppercase tracking-wider">Name</TableHead>
                  <TableHead className="px-4 text-xs uppercase tracking-wider">Channels</TableHead>
                  <TableHead className="px-4 text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="px-4 text-right text-xs uppercase tracking-wider">Messages</TableHead>
                  <TableHead className="px-4 text-right text-xs uppercase tracking-wider">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {past.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-4 py-2.5 font-medium">{c.name}</TableCell>
                    <TableCell className="px-4 py-2.5 text-xs text-muted-foreground">{c.providers.map((p) => CHANNEL_LABELS[p] ?? p).join(', ')}</TableCell>
                    <TableCell className="px-4 py-2.5 capitalize text-xs">{c.status}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right font-mono">{c._count?.messages ?? 0}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="space-y-3 md:hidden">
            {past.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{c.name}</div>
                  <span className="text-xs capitalize text-muted-foreground">{c.status}</span>
                </div>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Channels</dt><dd className="text-right">{c.providers.map((p) => CHANNEL_LABELS[p] ?? p).join(', ')}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Messages</dt><dd className="font-mono">{c._count?.messages ?? 0}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Created</dt><dd>{new Date(c.createdAt).toLocaleDateString()}</dd></div>
                </dl>
              </Card>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="mb-6 p-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
  );
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
