'use client';

import { useEffect, useState } from 'react';
import { Inbox, Loader2, MessageSquare, Search } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Thread {
  provider: string;
  senderHandle: string;
  senderName: string | null;
  contactId: string | null;
  unreadCount: number;
  lastMessageAt: string;
  lastBody: string;
}

interface Message {
  id: string;
  provider: string;
  senderHandle: string;
  senderName: string | null;
  body: string;
  receivedAt: string;
  status: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  whatsapp_cloud: 'WhatsApp',
  telegram_bot: 'Telegram',
  line_business: 'LINE',
  meta_business: 'Meta DM',
  threads: 'Threads',
  twitter: 'X',
  email_resend: 'Email', email_sendgrid: 'Email', email_mailgun: 'Email', email_postmark: 'Email', email_ses: 'Email',
};

export default function InboxPage() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  async function loadThreads() {
    try {
      const r = await marketingFetch('/api/v1/account/marketing/inbox/threads', { credentials: 'include' });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed to load threads');
      const list: Thread[] = b?.data?.threads ?? [];
      setThreads(list);
      // Auto-select the first thread if none picked yet.
      if (!active && list.length > 0) setActive(list[0] ?? null);
    } catch (e) { setError((e as Error).message); }
  }

  async function loadMessages(t: Thread) {
    setMessages(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/inbox/threads/${encodeURIComponent(t.provider)}/${encodeURIComponent(t.senderHandle)}`, { credentials: 'include' });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed to load thread');
      setMessages(b?.data?.messages ?? []);
      // Server marks the thread read on read; refresh thread list to clear the badge.
      await loadThreads();
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { loadThreads(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (active) loadMessages(active); /* eslint-disable-next-line */ }, [active?.provider, active?.senderHandle]);

  const filtered = (threads ?? []).filter((t) => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
      (t.senderName ?? '').toLowerCase().includes(ql) ||
      t.senderHandle.toLowerCase().includes(ql) ||
      t.lastBody.toLowerCase().includes(ql)
    );
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={Inbox}
        title="Inbox"
        description="Replies that landed via your connected channels. Currently captures WhatsApp Cloud inbound — Telegram and others as those webhooks land."
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-xs" />
            </div>
          </div>
          {threads === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {q ? 'No threads match.' : 'No replies yet. They’ll appear here as they land via WhatsApp / Telegram / etc.'}
            </div>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto">
              {filtered.map((t) => {
                const isActive = active?.provider === t.provider && active?.senderHandle === t.senderHandle;
                return (
                  <li key={`${t.provider}:${t.senderHandle}`}>
                    <button
                      type="button"
                      onClick={() => setActive(t)}
                      className={`block w-full border-b border-border px-4 py-3 text-left transition ${isActive ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{t.senderName ?? t.senderHandle}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{relTime(t.lastMessageAt)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{PROVIDER_LABEL[t.provider] ?? t.provider}</span>
                        {t.unreadCount > 0 && (
                          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-600">{t.unreadCount}</span>
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{t.lastBody}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="rounded-xl">
          {!active ? (
            <div className="flex h-96 flex-col items-center justify-center text-sm text-muted-foreground">
              <MessageSquare size={32} className="mb-3 text-muted-foreground/40" />
              Pick a thread to read.
            </div>
          ) : (
            <>
              <header className="border-b border-border p-5">
                <h2 className="text-base font-semibold">{active.senderName ?? active.senderHandle}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{PROVIDER_LABEL[active.provider] ?? active.provider} · <span className="font-mono">{active.senderHandle}</span></p>
              </header>
              <div className="space-y-3 p-5">
                {messages === null ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground">No messages.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="rounded-lg border border-border bg-background p-3">
                      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground">{new Date(m.receivedAt).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
                Reply-from-inbox isn&rsquo;t wired yet — send back via Compose or your provider&rsquo;s admin tools for now.
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}
