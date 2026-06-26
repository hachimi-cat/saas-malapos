'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Utensils,
  X,
  Store,
  List,
  LayoutGrid,
  Square,
  Circle,
  RectangleHorizontal,
  Save,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useBusinessType } from '@/hooks/use-business-type';

/*
 * Tables manager — define the dine-in floor for an F&B outlet. List every
 * table at the selected outlet (label, zone, seats, active state) and
 * create / edit / delete them. A table becomes "occupied" when a sale is
 * held on it (open bill) from the sell screen. F&B-only surface; built
 * against the real backend, no mock data.
 */

type Outlet = { id: string; name: string };

type Floor = { id: string; outletId: string; name: string; sortOrder: number };

type TableShape = 'SQUARE' | 'ROUND' | 'RECT';

type Table = {
  id: string;
  outletId: string;
  floorId: string | null;
  label: string;
  zone: string | null;
  seats: number | null;
  sortOrder: number;
  isActive: boolean;
  posX: number | null;
  posY: number | null;
  shape: TableShape;
  width: number;
  height: number;
};

type FormState = { label: string; zone: string; seats: string; sortOrder: string };

const empty: FormState = { label: '', zone: '', seats: '', sortOrder: '' };

function toForm(t: Table): FormState {
  return {
    label: t.label,
    zone: t.zone ?? '',
    seats: t.seats != null ? String(t.seats) : '',
    sortOrder: String(t.sortOrder),
  };
}

export default function TablesPage() {
  const { isFnb, loading: btLoading } = useBusinessType();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [floors, setFloors] = useState<Floor[]>([]);
  // The active floor — its own table layout is what the editor + list show.
  const [floorId, setFloorId] = useState('');
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Table | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<'list' | 'layout'>('list');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ outlets: Outlet[] }>('/outlets');
        setOutlets(res.data.outlets);
        setOutletId(res.data.outlets[0]?.id ?? '');
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load outlets');
        setLoading(false);
      }
    })();
  }, []);

  // Load the outlet's floors, then keep the active floor valid (preserve it on
  // a refresh, else default to the first floor). Returns the chosen floor id.
  async function loadFloors(oid: string): Promise<string> {
    if (!oid) {
      setFloors([]);
      setFloorId('');
      return '';
    }
    try {
      const res = await api.get<{ floors: Floor[] }>(`/floors?outletId=${encodeURIComponent(oid)}`);
      const list = res.data.floors;
      setFloors(list);
      let next = '';
      setFloorId((prev) => {
        next = list.some((f) => f.id === prev) ? prev : list[0]?.id ?? '';
        return next;
      });
      return next;
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load floors');
      return '';
    }
  }

  async function load(oid: string, fid: string) {
    if (!oid || !fid) {
      setTables([]);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ tables: Table[] }>(
        `/tables?outletId=${encodeURIComponent(oid)}&floorId=${encodeURIComponent(fid)}&includeInactive=true`,
      );
      setTables(res.data.tables);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  }

  // Outlet switch → (re)load its floors; the floor effect then loads tables.
  useEffect(() => {
    if (outletId) loadFloors(outletId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  useEffect(() => {
    if (outletId) load(outletId, floorId);
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId, floorId]);

  // ── Floor CRUD ─────────────────────────────────────────────────────────
  async function addFloor() {
    const name = prompt('New floor name (e.g. First Floor, Rooftop)')?.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await api.post<{ floor: Floor }>('/floors', { outletId, name });
      await loadFloors(outletId);
      setFloorId(res.data.floor.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to add floor');
    }
  }

  async function renameFloor(f: Floor) {
    const name = prompt('Rename floor', f.name)?.trim();
    if (!name || name === f.name) return;
    setError(null);
    try {
      await api.patch(`/floors/${f.id}`, { name });
      await loadFloors(outletId);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to rename floor');
    }
  }

  async function deleteFloor(f: Floor) {
    if (!confirm(`Delete floor "${f.name}"? It must have no tables.`)) return;
    setError(null);
    try {
      await api.delete(`/floors/${f.id}`);
      const next = await loadFloors(outletId);
      setFloorId(next);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to delete floor');
    }
  }

  // Reorder the active floor one slot left/right. Normalises every floor's
  // sortOrder to its new index so ordering is stable even from all-equal seeds.
  async function moveFloor(dir: -1 | 1) {
    const idx = floors.findIndex((f) => f.id === floorId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= floors.length) return;
    const ordered = [...floors];
    [ordered[idx], ordered[j]] = [ordered[j], ordered[idx]];
    setError(null);
    try {
      await Promise.all(
        ordered.map((f, i) => (f.sortOrder !== i ? api.patch(`/floors/${f.id}`, { sortOrder: i }) : null)),
      );
      await loadFloors(outletId);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to reorder floors');
    }
  }

  async function remove(t: Table) {
    if (!confirm(`Delete table "${t.label}"?`)) return;
    setError(null);
    try {
      await api.delete(`/tables/${t.id}`);
      await load(outletId, floorId);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to delete table');
    }
  }

  if (btLoading || loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!isFnb) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <Utensils className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">Tables are an F&amp;B feature</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set your business type to <strong>F&amp;B</strong> under{' '}
          <a href="/dashboard/settings" className="text-primary underline">Settings</a> to manage a dine-in floor.
        </p>
      </div>
    );
  }

  if (!outlets.length) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <Store className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">No outlet yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a store under <a href="/dashboard/outlets" className="text-primary underline">Outlets</a> first, then add its tables.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Tables</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your dine-in floor. Seat orders on a table from the sell screen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button
              onClick={() => setView('list')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="h-4 w-4" /> List
            </button>
            <button
              onClick={() => setView('layout')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'layout' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="h-4 w-4" /> Floor layout
            </button>
          </div>
          {outlets.length > 1 && (
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add table
          </button>
        </div>
      </div>

      <FloorSwitcher
        floors={floors}
        floorId={floorId}
        onPick={setFloorId}
        onAdd={addFloor}
        onRename={renameFloor}
        onDelete={deleteFloor}
        onMove={moveFloor}
      />

      {!floorId ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <LayoutGrid className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">No floors yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a floor (e.g. Ground Floor, Rooftop) to start laying out tables.
          </p>
          <button
            onClick={addFloor}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add floor
          </button>
        </div>
      ) : view === 'layout' ? (
        <FloorEditor
          tables={tables}
          outletId={outletId}
          floorId={floorId}
          onEdit={(t) => setEditing(t)}
          onDelete={remove}
          onSaved={() => load(outletId, floorId)}
          onError={setError}
        />
      ) : tables.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Utensils className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">No tables yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add your first table to start seating dine-in orders.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add table
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Zone</th>
                <th className="px-4 py-3 font-medium">Seats</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-accent">
                  <td className="px-4 py-3 font-medium">{t.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.zone || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.seats != null ? t.seats : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.sortOrder}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(t)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(t)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <TableModal
          outletId={outletId}
          floorId={floorId}
          table={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            // A table created on a no-floor outlet auto-creates "Main floor"
            // server-side — refresh floors so the new floor appears + activates.
            const fid = floorId || (await loadFloors(outletId));
            await load(outletId, fid);
          }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Floor layout editor ────────────────────────────────────────────────
//
// A grid-backed canvas where each table is a draggable box. Coordinates
// (posX/posY) are GRID CELLS, not pixels — one cell = CELL px on screen.
// A table occupies width×height cells. Dragging snaps to the nearest cell;
// dropping a table outside the canvas (e.g. back onto the tray) clears its
// position so it becomes "unplaced" again. Unplaced tables (posX === null)
// live in the side tray until dragged onto the floor. "Save layout" persists
// every table's position + shape + size in one PUT /tables/layout call.

const CELL = 56; // px per grid cell
const COLS = 20;
const ROWS = 14;

// Stable per-zone tint so tables read as grouped on the map (nice-to-have).
const ZONE_TINTS = [
  { bg: 'rgba(139,92,246,0.18)', border: 'rgb(139,92,246)' }, // violet (brand)
  { bg: 'rgba(16,185,129,0.18)', border: 'rgb(16,185,129)' }, // emerald
  { bg: 'rgba(245,158,11,0.18)', border: 'rgb(245,158,11)' }, // amber
  { bg: 'rgba(59,130,246,0.18)', border: 'rgb(59,130,246)' }, // blue
  { bg: 'rgba(236,72,153,0.18)', border: 'rgb(236,72,153)' }, // pink
  { bg: 'rgba(20,184,166,0.18)', border: 'rgb(20,184,166)' }, // teal
];

function zoneTint(zone: string | null) {
  if (!zone) return { bg: 'hsl(var(--card))', border: 'hsl(var(--border))' };
  let h = 0;
  for (let i = 0; i < zone.length; i++) h = (h * 31 + zone.charCodeAt(i)) >>> 0;
  return ZONE_TINTS[h % ZONE_TINTS.length];
}

function shapeRadius(shape: TableShape): string {
  if (shape === 'ROUND') return '9999px';
  return '0.5rem';
}

type Drag = { id: string; dx: number; dy: number; clientX: number; clientY: number };

function FloorEditor({
  tables,
  outletId,
  floorId,
  onEdit,
  onDelete,
  onSaved,
  onError,
}: {
  tables: Table[];
  outletId: string;
  floorId: string;
  onEdit: (t: Table) => void;
  onDelete: (t: Table) => void;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  // Working copy — edits stay local until "Save layout".
  const [items, setItems] = useState<Table[]>(tables.filter((t) => t.isActive));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Re-sync when the upstream table set changes (outlet switch, CRUD reload).
  useEffect(() => {
    setItems(tables.filter((t) => t.isActive));
    setDirty(false);
    setSelectedId(null);
  }, [tables]);

  const placed = items.filter((t) => t.posX != null && t.posY != null);
  const tray = items.filter((t) => t.posX == null || t.posY == null);
  const selected = items.find((t) => t.id === selectedId) ?? null;

  function patchItem(id: string, patch: Partial<Table>) {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setDirty(true);
  }

  function startDrag(e: React.PointerEvent, id: string) {
    const box = e.currentTarget.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(id);
    setDrag({ id, dx: e.clientX - box.left, dy: e.clientY - box.top, clientX: e.clientX, clientY: e.clientY });
  }

  function moveDrag(e: React.PointerEvent, id: string) {
    setDrag((d) => (d && d.id === id ? { ...d, clientX: e.clientX, clientY: e.clientY } : d));
  }

  function endDrag(e: React.PointerEvent, id: string) {
    setDrag((cur) => {
      if (!cur || cur.id !== id) return cur;
      const canvas = canvasRef.current;
      const item = items.find((t) => t.id === id);
      if (canvas && item) {
        const rect = canvas.getBoundingClientRect();
        const inside =
          e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (inside) {
          const localX = e.clientX - cur.dx - rect.left;
          const localY = e.clientY - cur.dy - rect.top;
          const maxX = Math.max(0, COLS - item.width);
          const maxY = Math.max(0, ROWS - item.height);
          const posX = Math.min(maxX, Math.max(0, Math.round(localX / CELL)));
          const posY = Math.min(maxY, Math.max(0, Math.round(localY / CELL)));
          patchItem(id, { posX, posY });
        } else {
          patchItem(id, { posX: null, posY: null }); // dropped off-canvas → tray
        }
      }
      return null;
    });
  }

  // Place an unplaced table at the first free-ish slot (click-to-place fallback
  // for touch users who can't drag, and a sane default drop target).
  function placeFromTray(id: string) {
    const item = items.find((t) => t.id === id);
    if (!item) return;
    patchItem(id, { posX: item.posX ?? 0, posY: item.posY ?? 0 });
    setSelectedId(id);
  }

  async function save() {
    setSaving(true);
    onError(null);
    try {
      await api.put('/tables/layout', {
        outletId,
        floorId,
        tables: items.map((t) => ({
          id: t.id,
          posX: t.posX,
          posY: t.posY,
          shape: t.shape,
          width: t.width,
          height: t.height,
        })),
      });
      setDirty(false);
      onSaved();
    } catch (err) {
      onError(err instanceof ApiRequestError ? err.message : 'Failed to save layout');
    } finally {
      setSaving(false);
    }
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <LayoutGrid className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-3 text-base font-medium">No tables to arrange</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add tables first, then drag them onto the floor.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Canvas */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Drag tables onto the floor; they snap to the grid. Drag a table off the floor to return it to the tray.
          </p>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : dirty ? 'Save layout' : 'Saved'}
          </button>
        </div>
        <div className="overflow-auto rounded-lg border border-border bg-muted/30">
          <div
            ref={canvasRef}
            className="relative"
            style={{
              width: COLS * CELL,
              height: ROWS * CELL,
              backgroundSize: `${CELL}px ${CELL}px`,
              backgroundImage:
                'linear-gradient(to right, hsl(var(--border)/0.4) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)/0.4) 1px, transparent 1px)',
            }}
          >
            {placed.map((t) => {
              const tint = zoneTint(t.zone);
              const isDragging = drag?.id === t.id;
              const left = isDragging && drag ? undefined : t.posX! * CELL;
              const top = isDragging && drag ? undefined : t.posY! * CELL;
              return (
                <div
                  key={t.id}
                  onPointerDown={(e) => startDrag(e, t.id)}
                  onPointerMove={(e) => moveDrag(e, t.id)}
                  onPointerUp={(e) => endDrag(e, t.id)}
                  style={{
                    position: isDragging ? 'fixed' : 'absolute',
                    left: isDragging && drag ? drag.clientX - drag.dx : left,
                    top: isDragging && drag ? drag.clientY - drag.dy : top,
                    width: t.width * CELL - 6,
                    height: t.height * CELL - 6,
                    margin: 3,
                    background: tint.bg,
                    borderColor: tint.border,
                    borderRadius: shapeRadius(t.shape),
                    zIndex: isDragging ? 50 : selectedId === t.id ? 20 : 10,
                    touchAction: 'none',
                  }}
                  className={`flex cursor-grab touch-none select-none flex-col items-center justify-center border-2 p-1 text-center shadow-sm active:cursor-grabbing ${
                    selectedId === t.id ? 'ring-2 ring-ring ring-offset-1' : ''
                  }`}
                >
                  <span className="text-xs font-semibold leading-tight">{t.label}</span>
                  {t.seats != null && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Users className="h-2.5 w-2.5" /> {t.seats}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar: tray + selected-table controls */}
      <div className="w-full shrink-0 space-y-4 lg:w-72">
        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="mb-2 text-sm font-semibold">Unplaced tables ({tray.length})</h3>
          {tray.length === 0 ? (
            <p className="text-xs text-muted-foreground">All tables are on the floor.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tray.map((t) => {
                const tint = zoneTint(t.zone);
                const isDragging = drag?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onPointerDown={(e) => startDrag(e, t.id)}
                    onPointerMove={(e) => moveDrag(e, t.id)}
                    onPointerUp={(e) => endDrag(e, t.id)}
                    onDoubleClick={() => placeFromTray(t.id)}
                    title="Drag onto the floor (or double-click to place)"
                    style={{
                      position: isDragging ? 'fixed' : 'relative',
                      left: isDragging && drag ? drag.clientX - drag.dx : undefined,
                      top: isDragging && drag ? drag.clientY - drag.dy : undefined,
                      background: tint.bg,
                      borderColor: tint.border,
                      borderRadius: shapeRadius(t.shape),
                      zIndex: isDragging ? 50 : undefined,
                      touchAction: 'none',
                    }}
                    className="flex h-12 min-w-[3rem] cursor-grab touch-none select-none items-center justify-center border-2 px-2 text-xs font-semibold active:cursor-grabbing"
                  >
                    {t.label}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selected ? (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{selected.label}</h3>
              <span className="text-xs text-muted-foreground">{selected.zone || 'No zone'}</span>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-xs text-muted-foreground">Shape</p>
              <div className="grid grid-cols-3 gap-1">
                {(['SQUARE', 'ROUND', 'RECT'] as TableShape[]).map((s) => {
                  const Icon = s === 'SQUARE' ? Square : s === 'ROUND' ? Circle : RectangleHorizontal;
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        const patch: Partial<Table> = { shape: s };
                        if (s === 'RECT' && selected.width <= selected.height) patch.width = Math.max(2, selected.width);
                        patchItem(selected.id, patch);
                      }}
                      className={`flex flex-col items-center gap-1 rounded border px-2 py-1.5 text-[10px] ${
                        selected.shape === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stepper
                label="Width"
                value={selected.width}
                onChange={(v) => patchItem(selected.id, { width: v })}
              />
              <Stepper
                label="Height"
                value={selected.height}
                onChange={(v) => patchItem(selected.id, { height: v })}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => onEdit(selected)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <Pencil className="h-3.5 w-3.5" /> Details
              </button>
              {selected.posX != null && (
                <button
                  onClick={() => patchItem(selected.id, { posX: null, posY: null })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <X className="h-3.5 w-3.5" /> Remove from floor
                </button>
              )}
              <button
                onClick={() => onDelete(selected)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
            Select a table on the floor or tray to set its shape and size.
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center rounded-md border border-border">
        <button
          onClick={() => onChange(Math.max(1, value - 1))}
          className="px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          −
        </button>
        <span className="flex-1 text-center text-sm font-medium">{value}</span>
        <button
          onClick={() => onChange(Math.min(6, value + 1))}
          className="px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          +
        </button>
      </div>
    </div>
  );
}

function TableModal({
  outletId,
  floorId,
  table,
  onClose,
  onSaved,
}: {
  outletId: string;
  floorId: string;
  table: Table | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(table ? toForm(table) : empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.label.trim()) {
      setErr('Label is required.');
      return;
    }
    setBusy(true);
    setErr(null);

    const seats = form.seats.trim() === '' ? null : Math.max(0, Math.round(Number(form.seats)));
    const sortOrder = form.sortOrder.trim() === '' ? 0 : Math.max(0, Math.round(Number(form.sortOrder)));

    try {
      if (table) {
        await api.patch<{ table: Table }>(`/tables/${table.id}`, {
          label: form.label.trim(),
          zone: form.zone.trim() || null,
          seats,
          sortOrder,
        });
      } else {
        await api.post<{ table: Table }>('/tables', {
          outletId,
          // Land the new table on the active floor (server defaults to the
          // outlet's first/Main floor when omitted).
          ...(floorId ? { floorId } : {}),
          label: form.label.trim(),
          zone: form.zone.trim() || null,
          seats,
          sortOrder,
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to save table');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{table ? 'Edit table' : 'New table'}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Label">
            <input
              autoFocus
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Table 5"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Zone">
              <input
                value={form.zone}
                onChange={(e) => set('zone', e.target.value)}
                placeholder="Indoor"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Seats">
              <input
                type="number"
                min={0}
                value={form.seats}
                onChange={(e) => set('seats', e.target.value)}
                placeholder="4"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>

          <Field label="Sort order">
            <input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => set('sortOrder', e.target.value)}
              placeholder="0"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </div>

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={save}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Saving…' : table ? 'Save changes' : 'Create table'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// ── Floor switcher ─────────────────────────────────────────────────────────
//
// Tabs across the top of the tables page: each floor is its own table layout.
// Pick a floor to load its tables; the active floor can be renamed, deleted
// (when empty), and nudged left/right to reorder. "+" adds a floor.
function FloorSwitcher({
  floors,
  floorId,
  onPick,
  onAdd,
  onRename,
  onDelete,
  onMove,
}: {
  floors: Floor[];
  floorId: string;
  onPick: (id: string) => void;
  onAdd: () => void;
  onRename: (f: Floor) => void;
  onDelete: (f: Floor) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const idx = floors.findIndex((f) => f.id === floorId);
  const active = floors[idx] ?? null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-1">
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              f.id === floorId
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {f.name}
          </button>
        ))}
        <button
          onClick={onAdd}
          title="Add floor"
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Floor
        </button>
      </div>

      {active && (
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => onMove(-1)}
            disabled={idx <= 0}
            title="Move floor left"
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={idx >= floors.length - 1}
            title="Move floor right"
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => onRename(active)}
            title="Rename floor"
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(active)}
            title="Delete floor"
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
