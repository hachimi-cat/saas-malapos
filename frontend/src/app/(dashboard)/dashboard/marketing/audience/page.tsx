'use client';

import { useEffect, useState } from 'react';
import { Users, Loader2, Plus, List as ListIcon, Upload, X, ShieldOff, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
import { DataTable, type Column } from '@/components/data-table';

interface Contact {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string | null;
  createdAt: string;
}

interface ContactList {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

interface Suppression { id: string; email: string; abandonedCartOptOut: boolean; optedOutAt: string | null }

export default function AudiencePage() {
  const [tab, setTab] = useState<'contacts' | 'lists' | 'suppressions'>('contacts');
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [lists, setLists] = useState<ContactList[] | null>(null);
  const [suppressions, setSuppressions] = useState<Suppression[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState<'contact' | 'list' | null>(null);
  const [showImport, setShowImport] = useState(false);

  async function loadContacts() {
    try {
      const r = await marketingFetch('/api/v1/account/marketing/contacts?limit=200', { credentials: 'include' });
      const b = await r.json();
      setContacts(b?.data?.data ?? []);
    } catch (e) { setError((e as Error).message); }
  }
  async function loadLists() {
    try {
      const r = await marketingFetch('/api/v1/account/marketing/contact-lists', { credentials: 'include' });
      const b = await r.json();
      setLists(b?.data ?? []);
    } catch (e) { setError((e as Error).message); }
  }

  async function loadSuppressions() {
    try {
      const r = await marketingFetch('/api/v1/account/marketing/abandoned-cart/suppressions', { credentials: 'include' });
      const b = await r.json();
      setSuppressions(b?.data?.suppressions ?? []);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { if (tab === 'contacts') loadContacts(); }, [tab]);
  useEffect(() => { if (tab === 'lists') loadLists(); }, [tab]);
  useEffect(() => { if (tab === 'suppressions') loadSuppressions(); }, [tab]);

  async function removeSuppression(email: string) {
    if (!confirm(`Remove ${email} from the suppression list? They'll start receiving abandoned-cart reminders again.`)) return;
    try {
      await marketingFetch(`/api/v1/account/marketing/abandoned-cart/suppressions/${encodeURIComponent(email)}`, { method: 'DELETE', credentials: 'include' });
      await loadSuppressions();
    } catch (e) { setError((e as Error).message); }
  }

  const contactColumns: Column<Contact>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      sortValue: (c) => [c.firstName, c.lastName].filter(Boolean).join(' '),
      searchValue: (c) => `${c.firstName ?? ''} ${c.lastName ?? ''} ${c.email ?? ''} ${c.phone ?? ''}`,
      cell: (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '—',
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      sortValue: (c) => c.email ?? '',
      cell: (c) => <span className="text-xs">{c.email ?? '—'}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: true,
      sortValue: (c) => c.phone ?? '',
      cell: (c) => <span className="font-mono text-xs">{c.phone ?? '—'}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      sortValue: (c) => c.source ?? 'manual',
      cell: (c) => <span className="text-xs text-muted-foreground">{c.source ?? 'manual'}</span>,
    },
    {
      key: 'createdAt',
      header: 'Added',
      align: 'right',
      sortable: true,
      sortValue: (c) => new Date(c.createdAt).getTime(),
      cell: (c) => (
        <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
      ),
    },
  ];

  const suppressionColumns: Column<Suppression>[] = [
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      sortValue: (s) => s.email,
      searchValue: (s) => s.email,
      cell: (s) => <span className="font-mono text-xs">{s.email}</span>,
    },
    {
      key: 'optedOutAt',
      header: 'Opted out',
      sortable: true,
      sortValue: (s) => (s.optedOutAt ? new Date(s.optedOutAt).getTime() : 0),
      cell: (s) => (
        <span className="text-xs text-muted-foreground">
          {s.optedOutAt ? new Date(s.optedOutAt).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (s) => (
        <button
          onClick={() => removeSuppression(s.email)}
          className="rounded p-1 text-destructive hover:bg-destructive/10"
          title="Remove from suppression"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Audience"
        description="Your contacts, tags, and lists. The base layer for email + SMS + WA campaigns."
        action={
          <div className="flex items-center gap-2">
            {tab === 'contacts' && (
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <Upload size={14} /> Import CSV
              </button>
            )}
            <button
              onClick={() => setShowAdd(tab === 'contacts' ? 'contact' : 'list')}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-brand-600"
            >
              <Plus size={14} /> {tab === 'contacts' ? 'Add contact' : 'New list'}
            </button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2 text-sm">
        <button onClick={() => setTab('contacts')} className={`rounded-md px-3 py-1.5 ${tab === 'contacts' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground'}`}>Contacts</button>
        <button onClick={() => setTab('lists')} className={`rounded-md px-3 py-1.5 ${tab === 'lists' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground'}`}>Lists</button>
        <button onClick={() => setTab('suppressions')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === 'suppressions' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground'}`}><ShieldOff size={12} /> Suppressions</button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{error}</div>}

      {tab === 'contacts' && (
        contacts === null ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : contacts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">No contacts yet.</div>
        ) : (
          <DataTable
            rows={contacts}
            columns={contactColumns}
            rowKey={(c) => c.id}
            searchPlaceholder="Search by email, name, or phone…"
            defaultSort={{ key: 'createdAt', dir: 'desc' }}
            empty="No contacts match."
          />
        )
      )}

      {tab === 'lists' && (
        <>
          {lists === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : lists.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">No lists yet.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lists.map((l) => (
                <div key={l.id} className="rounded-xl border border-border bg-card p-5">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"><ListIcon size={18} /></span>
                  <p className="mt-3 font-semibold">{l.name}</p>
                  {l.description && <p className="mt-1 text-xs text-muted-foreground">{l.description}</p>}
                  <p className="mt-3 text-xs text-muted-foreground"><span className="font-mono tabular-nums">{l.memberCount}</span> contact(s)</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'suppressions' && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Buyers who unsubscribed from abandoned-cart emails. They keep showing up in your contacts list — they just won&rsquo;t receive recovery messages.
          </p>
          {suppressions === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : suppressions.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">No suppressions yet. Buyers can opt out via the unsubscribe link in any abandoned-cart email.</div>
          ) : (
            <DataTable
              rows={suppressions}
              columns={suppressionColumns}
              rowKey={(s) => s.id}
              searchPlaceholder="Search email…"
              defaultSort={{ key: 'optedOutAt', dir: 'desc' }}
              empty="No suppressions match."
            />
          )}
        </>
      )}

      {showAdd === 'contact' && <AddContactModal onClose={() => setShowAdd(null)} onSaved={async () => { setShowAdd(null); await loadContacts(); }} />}
      {showAdd === 'list' && <AddListModal onClose={() => setShowAdd(null)} onSaved={async () => { setShowAdd(null); await loadLists(); }} />}
      {showImport && <ImportCsvModal onClose={() => setShowImport(false)} onDone={async () => { setShowImport(false); await loadContacts(); }} />}
    </div>
  );
}

function ImportCsvModal({ onClose, onDone }: { onClose: () => void; onDone: () => void | Promise<void> }) {
  const [rawText, setRawText] = useState('');
  const [listName, setListName] = useState('');
  const [skipExisting, setSkipExisting] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; updated: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null);

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const split = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQuote = false;
          else cur += ch;
        } else {
          if (ch === ',') { out.push(cur); cur = ''; }
          else if (ch === '"') inQuote = true;
          else cur += ch;
        }
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const headers = split(lines[0]!).map((h) => h.toLowerCase());
    const rows = lines.slice(1).map((l) => {
      const cells = split(l);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
      return obj;
    });
    return { headers, rows };
  }

  const parsed = parseCsv(rawText);
  const preview = parsed.rows.slice(0, 5);
  const knownHeaders = ['email', 'phone', 'first_name', 'firstname', 'last_name', 'lastname'];
  const recognized = parsed.headers.filter((h) => knownHeaders.includes(h));

  function rowToContact(row: Record<string, string>): { email?: string; phone?: string; firstName?: string; lastName?: string } {
    const c: { email?: string; phone?: string; firstName?: string; lastName?: string } = {};
    if (row.email) c.email = row.email;
    if (row.phone) c.phone = row.phone;
    if (row.first_name || row.firstname) c.firstName = row.first_name || row.firstname;
    if (row.last_name || row.lastname) c.lastName = row.last_name || row.lastname;
    return c;
  }

  async function submit() {
    if (parsed.rows.length === 0) { setError('No rows parsed from CSV.'); return; }
    setWorking(true);
    setError(null);
    try {
      const rows = parsed.rows.map(rowToContact).filter((r) => r.email || r.phone);
      if (rows.length === 0) { setError('No rows have email or phone.'); return; }
      const r = await marketingFetch('/api/v1/account/marketing/contacts/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows, listName: listName.trim() || undefined, skipExisting }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'import failed');
      setSummary(b?.data ?? null);
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Import contacts from CSV</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Expected columns: <span className="font-mono">email, phone, first_name, last_name</span>. Header row required. Up to 5,000 rows per import.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary"><X size={14} /></button>
        </div>

        {error && <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">{error}</div>}

        {summary ? (
          <div className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
            <p className="font-semibold">Import complete.</p>
            <ul className="mt-2 space-y-0.5 text-xs">
              <li>· <span className="font-mono">{summary.created}</span> contact(s) created</li>
              <li>· <span className="font-mono">{summary.updated}</span> contact(s) updated</li>
              {summary.skipped > 0 && <li>· <span className="font-mono">{summary.skipped}</span> row(s) skipped</li>}
              {summary.errors.length > 0 && (
                <li className="mt-2 text-destructive">{summary.errors.length} row(s) had errors — see audit log for details</li>
              )}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onDone} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-brand-600">Done</button>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-5 block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm hover:file:bg-secondary/80"
              />
            </label>

            {parsed.rows.length > 0 && (
              <div className="mt-4 rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium">Preview ({parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} total · recognized columns: {recognized.length > 0 ? recognized.join(', ') : 'none'})</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-muted-foreground">{parsed.headers.map((h) => <th key={h} className="px-2 py-1 text-left font-mono">{h}</th>)}</tr></thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          {parsed.headers.map((h) => <td key={h} className="px-2 py-1">{r[h] ?? ''}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Add to list (optional, created if missing)</span>
              <input type="text" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g. Newsletter subscribers" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            </label>

            <label className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} className="h-3.5 w-3.5" />
              Skip rows that already exist (don&rsquo;t overwrite their fields)
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">Cancel</button>
              <button
                type="button"
                onClick={submit}
                disabled={working || parsed.rows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-brand-600 disabled:opacity-60"
              >
                {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload size={12} />} Import {parsed.rows.length > 0 ? `${parsed.rows.length} row(s)` : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AddContactModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) { setError('Email or phone required'); return; }
    setWorking(true);
    setError(null);
    try {
      const r = await marketingFetch('/api/v1/account/marketing/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email || null, phone: phone || null, firstName: firstName || null, lastName: lastName || null, source: 'manual' }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed');
      await onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Add contact</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">First name</span><input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Last name</span><input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        </div>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Phone (E.164)</span><input type="tel" placeholder="+62…" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono" /></label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border py-2 text-sm">Cancel</button>
          <button type="submit" disabled={working} className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-brand-600 disabled:opacity-60">{working ? 'Saving…' : 'Save contact'}</button>
        </div>
      </form>
    </div>
  );
}

function AddListModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    try {
      const r = await marketingFetch('/api/v1/account/marketing/contact-lists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description: description || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed');
      await onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">New contact list</h2>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Description</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border py-2 text-sm">Cancel</button>
          <button type="submit" disabled={working} className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-brand-600 disabled:opacity-60">{working ? 'Creating…' : 'Create list'}</button>
        </div>
      </form>
    </div>
  );
}
