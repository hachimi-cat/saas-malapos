'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Receipt,
  X,
  QrCode,
  Loader2,
  CheckCircle2,
  Utensils,
  ArrowLeft,
  Clock,
  Users,
  PauseCircle,
  Split,
  StickyNote,
  Landmark,
  Copy,
  Truck,
  UserSearch,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { useBusinessType } from '@/hooks/use-business-type';
import { useModules } from '@/hooks/use-modules';
import { useRealtime } from '@/hooks/use-realtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

/*
 * The sell screen — Malapos's hero surface. Pick an outlet, search/scan the
 * catalog into a cart, then take payment (cash with change, QRIS, card). On
 * confirm it POSTs /sales (which deducts stock + earns loyalty server-side)
 * and shows the receipt. Built against the real backend; no mock data.
 */

type Variant = { id: string; name: string; price: number; sku: string | null; barcode: string | null };
type Product = { id: string; name: string; kind: string; isActive: boolean; imageUrl: string | null; variants: Variant[] };
type Outlet = { id: string; name: string; taxRateBps: number };
type TransferAccount = {
  transferBankName: string | null;
  transferBankAccountNumber: string | null;
  transferBankAccountHolder: string | null;
};
type Customer = { id: string; name: string; phone: string | null };

type CartLine = { variantId: string; productId: string; name: string; variantName: string; unitPrice: number; qty: number; note?: string };

type Sale = {
  id: string;
  number: string;
  total: number;
  changeTotal: number;
  // Courier fee folded into `total` for a DELIVERY order (0 for in-store).
  deliveryFee?: number;
  items: { productName: string; quantity: number; lineTotal: number }[];
};

// A Fulkruma (Biteship) courier rate quote — the chosen one's price becomes
// the delivery fee. Mirrors the Rate shape on the fulfillment page.
type Rate = {
  courierCode: string;
  courierServiceCode: string;
  courierName?: string;
  serviceName?: string;
  description?: string;
  price: number;
  duration?: string;
};

// Recipient/destination captured for a delivery quick sale. `email` is
// optional (used for Biteship notifications); mirrors the Fulfillment
// create-shipment modal's recipient.
type DeliveryDest = {
  contactName: string;
  contactPhone: string;
  email: string;
  address: string;
  area: string;
  postalCode: string;
};

// One itemized parcel line for a delivery — name + qty + per-unit weight
// (grams) + declared value. Pre-filled from the cart when a delivery sale
// starts (the cashier tops up weights/values). Total weight drives the quote.
type DeliveryItem = { name: string; qty: number; weight: number; value: number };

// A customer record rich enough to pre-fill a delivery recipient (the sell
// page's own Customer type has no email).
type CustomerLite = { id: string; name: string; phone: string | null; email: string | null };

// The delivery draft attached to the current quick sale: where it goes, the
// itemized parcel, the (optional) linked customer, and the courier the cashier
// picked. `rate` set ⇒ the fee is locked in and the order can be charged.
type DeliveryDraft = {
  dest: DeliveryDest;
  customerId: string | null;
  items: DeliveryItem[];
  rate: Rate | null;
};

// Shared wire builders so the modal's rate quote and the on-completion
// shipment create send an identical destination + parcel (mirrors the
// Fulfillment create-shipment modal, adapted to the /delivery proxy).
function deliveryDestinationPayload(dest: DeliveryDest): Record<string, unknown> {
  return {
    contactName: dest.contactName,
    contactPhone: dest.contactPhone,
    contactEmail: dest.email || undefined,
    address: [dest.address, dest.area].filter(Boolean).join(', '),
    area: dest.area,
    postalCode: dest.postalCode,
  };
}

function deliveryItemsPayload(items: DeliveryItem[]): Array<Record<string, unknown>> {
  return items.map((it) => ({
    name: it.name || 'Item',
    quantity: it.qty || 1,
    weight: it.weight || 0,
    value: it.value || 0,
  }));
}

// F&B table + its open bill (GET /tables/floor).
type Floor = { id: string; name: string; sortOrder: number };
type TableShape = 'SQUARE' | 'ROUND' | 'RECT';
type FloorTable = {
  id: string;
  label: string;
  zone: string | null;
  seats: number | null;
  posX: number | null;
  posY: number | null;
  shape: TableShape;
  width: number;
  height: number;
};
type OpenBill = { transactionId: string; total: number; itemCount: number; openedAt: string };
type FloorEntry = { table: FloorTable; openBill: OpenBill | null };
// The currently selected table on the sell screen + its open-bill id (if any).
type BoundTable = { id: string; label: string };

export default function SellPage() {
  const { isFnb } = useBusinessType();
  // Fulfillment (Fulkruma) module gate — the Delivery option is only offered
  // when it's on (matches the /delivery backend, which 409s when off).
  const { modules } = useModules();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);
  // F&B dine-in flow. `view` is 'floor' (table grid) or 'register' (the
  // catalog+cart). `table` binds the register to a dine-in table; when it
  // also has an open bill, `parkedTxnId` is that bill's transaction id.
  // Quick-sale (no table) keeps `table` null and works exactly as before.
  const [view, setView] = useState<'floor' | 'register'>('register');
  const [table, setTable] = useState<BoundTable | null>(null);
  const [parkedTxnId, setParkedTxnId] = useState<string | null>(null);
  // The open bill's server-side paidTotal (> 0 only when a split was started
  // then abandoned half-paid). The whole-bill Charge must collect just the
  // REMAINING balance, never the full total, or paidTotal overshoots.
  const [parkedPaid, setParkedPaid] = useState(0);
  const [floor, setFloor] = useState<FloorEntry[]>([]);
  const [floorBusy, setFloorBusy] = useState(false);
  // F&B floors (levels) for the active outlet + which one the floor view shows.
  // Each floor has its own table layout; the board shows the active floor only.
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState('');
  // Mirror floorId into a ref so the realtime/poll refetch closures (which we
  // deliberately don't re-subscribe on every floor switch) read the live value.
  const floorIdRef = useRef('');
  floorIdRef.current = floorId;
  const [holding, setHolding] = useState(false);
  const [splitting, setSplitting] = useState(false);
  // Split-bill flow (F&B). Set when the cashier splits an open table bill
  // into checks; carries the server-authoritative total + a frozen line
  // snapshot for the by-item split. Null = no split in progress.
  const [split, setSplit] = useState<
    | { txnId: string; total: number; initialPaid: number; lines: CartLine[] }
    | null
  >(null);
  // Keyboard-first cashier flow: a highlighted grid card + the cart line the
  // qty hotkeys act on (the most-recently-touched line).
  const [highlight, setHighlight] = useState(0);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  // Which cart line currently has its note input revealed (a line with an
  // existing note always shows it). Lightweight per-line note affordance.
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  // Dynamic checkout (Payment module) state — set when the cashier picks QRIS
  // or VA and the module is on; drives the checkout modal + status polling.
  // `method` selects QRIS (scan a QR) vs VA (pay a virtual-account number).
  const [qris, setQris] = useState<{ saleId: string; sessionId: string; qrUrl: string; amount: number; method: 'qris' | 'va' } | null>(null);
  // Store bank-transfer account (PosSettings) shown in the charge modal when the
  // cashier picks Transfer. Null/blank fields → the modal shows a "not
  // configured" notice instead of letting them confirm.
  const [transferAccount, setTransferAccount] = useState<TransferAccount | null>(null);
  // Delivery (Fulfillment module) on the current quick sale. `delivery` non-null
  // = the order is marked DELIVERY; `delivery.rate` set = a courier is picked
  // and its price is the delivery fee. `deliveryModal` opens the address +
  // rate-pick sheet. Counter/quick-sale only (never a dine-in table bill).
  const [delivery, setDelivery] = useState<DeliveryDraft | null>(null);
  const [deliveryModal, setDeliveryModal] = useState(false);
  const fulfillmentOn = modules.fulfillment === true;

  useEffect(() => {
    (async () => {
      try {
        const [o, p, s] = await Promise.all([
          api.get<{ outlets: Outlet[] }>('/outlets'),
          api.get<{ products: Product[] }>('/products?active=true'),
          api.get<{ settings: TransferAccount }>('/settings'),
        ]);
        setOutlets(o.data.outlets);
        setOutletId(o.data.outlets[0]?.id ?? '');
        setProducts(p.data.products.filter((x) => x.isActive && x.variants.length));
        setTransferAccount({
          transferBankName: s.data.settings.transferBankName ?? null,
          transferBankAccountNumber: s.data.settings.transferBankAccountNumber ?? null,
          transferBankAccountHolder: s.data.settings.transferBankAccountHolder ?? null,
        });
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const outlet = outlets.find((o) => o.id === outletId);

  // ── F&B floor ────────────────────────────────────────────────────────
  // Load the live board for one floor. `fid` defaults to the active floor (via
  // ref) so the realtime/poll callers refresh whatever floor is showing.
  const loadFloor = useCallback(async (oid: string, fid?: string) => {
    if (!oid) return;
    const f = fid ?? floorIdRef.current;
    setFloorBusy(true);
    try {
      const url = `/tables/floor?outletId=${encodeURIComponent(oid)}${f ? `&floorId=${encodeURIComponent(f)}` : ''}`;
      const res = await api.get<{ floor: FloorEntry[] }>(url);
      setFloor(res.data.floor);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load floor');
    } finally {
      setFloorBusy(false);
    }
  }, []);

  // Load the outlet's floors; keep the active floor valid (preserve on refresh,
  // else default to the first). Returns the chosen floor id.
  const loadFloors = useCallback(async (oid: string): Promise<string> => {
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
      floorIdRef.current = next;
      return next;
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load floors');
      return '';
    }
  }, []);

  // For F&B workspaces, the floor is the landing view. Load the outlet's floors
  // once we know the business type + have an outlet, unless a table is bound.
  useEffect(() => {
    if (isFnb && outletId) {
      if (!table) setView('floor');
      loadFloors(outletId);
    }
    if (!isFnb) setView('register');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFnb, outletId]);

  // Whenever the active floor changes (incl. right after loadFloors picks one),
  // refresh the board for that floor.
  useEffect(() => {
    if (isFnb && outletId && floorId) loadFloor(outletId, floorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorId]);

  // Realtime: keep the floor live so tables flip occupied↔available the moment
  // a bill is opened, held, settled, or voided anywhere (this terminal or
  // another). Scoped to this outlet; only active for F&B workspaces.
  useRealtime({
    enabled: isFnb && !!outletId,
    outletId,
    onChange: (topic) => {
      if (topic === 'floor') loadFloor(outletId);
    },
  });

  // Belt-and-suspenders fallback poll for the floor if the SSE stream drops.
  useEffect(() => {
    if (!isFnb || !outletId) return;
    const t = setInterval(() => loadFloor(outletId), 30000);
    return () => clearInterval(t);
  }, [isFnb, outletId, loadFloor]);

  // Clear the table binding + cart when the outlet changes (tables are
  // per-outlet); the floor effect above then reloads the new outlet's floor.
  function changeOutlet(next: string) {
    setOutletId(next);
    setTable(null);
    setParkedTxnId(null);
    setParkedPaid(0);
    setCart([]);
    setCustomer(null);
    setReceipt(null);
    setDelivery(null);
  }

  // Bind the register to a table. An occupied table loads its open bill's
  // items into the cart; an available table starts an empty bill.
  async function pickTable(entry: FloorEntry) {
    setError(null);
    setReceipt(null);
    setCustomer(null);
    setDelivery(null); // delivery is a quick-sale concern, never a table bill
    const bound: BoundTable = { id: entry.table.id, label: entry.table.label };
    if (entry.openBill) {
      try {
        const res = await api.get<{ sale: { items: { variantId: string | null; productName: string; variantName: string | null; unitPrice: number; quantity: number; note: string | null }[]; customer: Customer | null; paidTotal: number } }>(
          `/sales/${entry.openBill.transactionId}`,
        );
        const items = res.data.sale.items.filter((it) => it.variantId);
        setCart(
          items.map((it) => ({
            variantId: it.variantId as string,
            productId: '',
            name: it.productName,
            variantName: it.variantName ?? 'Default',
            unitPrice: it.unitPrice,
            qty: it.quantity,
            note: it.note ?? undefined,
          })),
        );
        setCustomer(res.data.sale.customer ?? null);
        setParkedTxnId(entry.openBill.transactionId);
        setParkedPaid(res.data.sale.paidTotal ?? 0);
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to open the bill');
        return;
      }
    } else {
      setCart([]);
      setParkedTxnId(null);
      setParkedPaid(0);
    }
    setTable(bound);
    setView('register');
  }

  // Leave the register back to the floor (does not auto-save — use Hold).
  function backToFloor() {
    setTable(null);
    setParkedTxnId(null);
    setParkedPaid(0);
    setCart([]);
    setCustomer(null);
    setReceipt(null);
    setDelivery(null);
    setView('floor');
    loadFloor(outletId);
  }

  // Start a no-table quick sale from the floor (identical to the retail path).
  function startQuickSale() {
    setTable(null);
    setParkedTxnId(null);
    setParkedPaid(0);
    setCart([]);
    setCustomer(null);
    setReceipt(null);
    setDelivery(null);
    setView('register');
  }

  // Build the cart's wire items (variantId + qty + unitPrice so a held
  // bill's prices survive a re-save).
  const cartItems = useCallback(
    () =>
      cart.map((l) => ({
        variantId: l.variantId,
        quantity: l.qty,
        unitPrice: l.unitPrice,
        note: l.note?.trim() ? l.note.trim() : undefined,
      })),
    [cart],
  );

  // F&B "Hold": persist the cart as the table's open bill (PARKED) — create
  // it on first hold, patch its items on a resume — then return to the floor.
  async function hold() {
    if (!table) return;
    if (!cart.length) {
      backToFloor();
      return;
    }
    setHolding(true);
    setError(null);
    try {
      if (parkedTxnId) {
        await api.patch(`/sales/${parkedTxnId}/items`, {
          items: cartItems(),
          orderType: 'DINE_IN',
          customerId: customer?.id ?? null,
        });
      } else {
        await api.post('/sales', {
          outletId,
          customerId: customer?.id ?? null,
          tableId: table.id,
          orderType: 'DINE_IN',
          status: 'PARKED',
          items: cartItems(),
        });
      }
      setHolding(false);
      backToFloor();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to hold the bill');
      setHolding(false);
    }
  }

  // F&B "Split bill": persist the cart as the table's open bill (so the
  // server has an authoritative PARKED total to split against), then open the
  // split flow. Per-check payments POST /sales/:id/payments; the bill
  // completes server-side when fully paid.
  async function startSplit() {
    if (!table || !cart.length) return;
    setSplitting(true);
    setError(null);
    try {
      let txnId = parkedTxnId;
      let serverTotal: number;
      let initialPaid: number;
      if (txnId) {
        const res = await api.patch<{ sale: { id: string; total: number; paidTotal: number } }>(
          `/sales/${txnId}/items`,
          { items: cartItems(), orderType: 'DINE_IN', customerId: customer?.id ?? null },
        );
        serverTotal = res.data.sale.total;
        initialPaid = res.data.sale.paidTotal;
      } else {
        const res = await api.post<{ sale: { id: string; total: number; paidTotal: number } }>(
          '/sales',
          {
            outletId,
            customerId: customer?.id ?? null,
            tableId: table.id,
            orderType: 'DINE_IN',
            status: 'PARKED',
            items: cartItems(),
          },
        );
        txnId = res.data.sale.id;
        serverTotal = res.data.sale.total;
        initialPaid = res.data.sale.paidTotal;
        setParkedTxnId(txnId);
      }
      setSplit({ txnId, total: serverTotal, initialPaid, lines: cart });
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to start the split');
    } finally {
      setSplitting(false);
    }
  }

  // The split bill fully paid → back to the floor (table now free).
  function finishSplit() {
    setSplit(null);
    setCart([]);
    setCustomer(null);
    setTable(null);
    setParkedTxnId(null);
    setParkedPaid(0);
    setView('floor');
    loadFloor(outletId);
  }

  // Create the Fulkruma shipment for a now-completed DELIVERY sale, mirroring
  // the fulfillment create-from-sale flow (destination + chosen courier +
  // a single weighted parcel). The backend stamps fulkrumaShipmentId on the
  // sale and is idempotent (a sale that already has a shipment returns the
  // existing one), so a double-fire never mints two shipments. Best-effort:
  // the sale is already paid, so a courier hiccup surfaces as an error toast
  // rather than failing the completed sale.
  async function createDeliveryShipment(saleId: string, d: DeliveryDraft) {
    if (!d.rate) return;
    const r = d.rate as Rate & { courierType?: string; serviceType?: string };
    try {
      await api.post('/delivery/shipments', {
        transactionId: saleId,
        destination: deliveryDestinationPayload(d.dest),
        courierCode: d.rate.courierCode,
        courierServiceCode: d.rate.courierServiceCode,
        courierType: r.courierType ?? r.serviceType ?? undefined,
        price: d.rate.price,
        items: deliveryItemsPayload(d.items),
        customerId: d.customerId ?? undefined,
        customerEmail: d.dest.email || undefined,
      });
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? `Sale completed, but creating the delivery failed: ${e.message}`
          : 'Sale completed, but creating the delivery failed.',
      );
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku?.toLowerCase().includes(q) || v.barcode?.includes(q)),
    );
  }, [products, query]);

  // Flatten the filtered catalog into the grid's cards (one per product+variant)
  // so the keyboard highlight can index into a single ordered list.
  const cards = useMemo(
    () => filtered.flatMap((p) => p.variants.map((v) => ({ p, v }))),
    [filtered],
  );

  function addVariant(p: Product, v: Variant) {
    setReceipt(null);
    setActiveLineId(v.id);
    setCart((c) => {
      const found = c.find((l) => l.variantId === v.id);
      if (found) return c.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...c,
        { variantId: v.id, productId: p.id, name: p.name, variantName: v.name, unitPrice: v.price, qty: 1 },
      ];
    });
  }

  function setQty(variantId: string, qty: number) {
    setActiveLineId(variantId);
    setCart((c) =>
      qty <= 0 ? c.filter((l) => l.variantId !== variantId) : c.map((l) => (l.variantId === variantId ? { ...l, qty } : l)),
    );
  }

  // Set a cart line's per-item note (e.g. "no onions"). Bound to the line in
  // the cart state; sent with the item in every create/hold/settle payload.
  function setLineNote(variantId: string, note: string) {
    setCart((c) => c.map((l) => (l.variantId === variantId ? { ...l, note } : l)));
  }

  // Adjust the qty of the active (most-recently-touched) cart line, falling
  // back to the last line in the cart. `delta` is +1 / -1.
  function bumpActiveQty(delta: number) {
    setCart((c) => {
      if (!c.length) return c;
      const target = c.find((l) => l.variantId === activeLineId) ?? c[c.length - 1];
      setActiveLineId(target.variantId);
      const next = target.qty + delta;
      if (next <= 0) return c.filter((l) => l.variantId !== target.variantId);
      return c.map((l) => (l.variantId === target.variantId ? { ...l, qty: next } : l));
    });
  }

  // Remove the active line (or the last line) from the cart.
  function removeActiveLine() {
    setCart((c) => {
      if (!c.length) return c;
      const target = c.find((l) => l.variantId === activeLineId) ?? c[c.length - 1];
      const rest = c.filter((l) => l.variantId !== target.variantId);
      setActiveLineId(rest[rest.length - 1]?.variantId ?? null);
      return rest;
    });
  }

  // Reset the highlight whenever the filtered result set changes.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Measure the live column count of the responsive grid so ↑/↓ jump a full row
  // (the grid is 2/3/4 cols across breakpoints — read it instead of guessing).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const tmpl = getComputedStyle(el).gridTemplateColumns;
      const n = tmpl.split(' ').filter(Boolean).length;
      if (n > 0) setCols(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // Keep the highlighted card scrolled into view as the cashier arrows around.
  useEffect(() => {
    gridRef.current
      ?.querySelector(`[data-card-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  // Global cashier hotkeys. A document-level listener catches keys even while
  // the search input holds focus (keydown bubbles up). We carefully scope the
  // qty/remove keys to an EMPTY query so they never fire while typing a search.
  useEffect(() => {
    function clamp(i: number) {
      return cards.length ? Math.max(0, Math.min(i, cards.length - 1)) : 0;
    }
    function onKey(e: KeyboardEvent) {
      // While any modal is open the modals own the keyboard (Esc/Enter there).
      if (paying || qris || receipt || split || deliveryModal) return;
      // The floor (table grid) has no catalog hotkeys — stand down there.
      if (view === 'floor') return;
      // Don't hijack keys while the cashier is typing in ANOTHER field (Attach
      // customer, qty inputs, etc.) — only the product search drives the
      // cashier hotkeys. Without this, Backspace/Delete got eaten in those
      // inputs (couldn't clear the Attach-customer field).
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable) &&
        !target.hasAttribute('data-sell-search')
      ) {
        return;
      }
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setHighlight((i) => clamp(i + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setHighlight((i) => clamp(i - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setHighlight((i) => clamp(i + cols));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlight((i) => clamp(i - cols));
          break;
        case 'Enter': {
          // Scanner flow first: an exact barcode match wins (existing behavior).
          const code = query.trim();
          if (code) {
            for (const p of products) {
              const v = p.variants.find((x) => x.barcode === code);
              if (v) {
                addVariant(p, v);
                setQuery('');
                return;
              }
            }
          }
          // Otherwise add the highlighted card (or the first filtered result).
          const card = cards[highlight] ?? cards[0];
          if (card) addVariant(card.p, card.v);
          break;
        }
        case 'F2':
          e.preventDefault();
          if (cart.length) setPaying(true);
          break;
        case 'Escape':
          setQuery('');
          break;
        case '+':
        case '=': // same physical key without Shift
          if (query === '') {
            e.preventDefault();
            bumpActiveQty(1);
          }
          break;
        case '-':
          if (query === '') {
            e.preventDefault();
            bumpActiveQty(-1);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (query === '') {
            e.preventDefault();
            removeActiveLine();
          }
          break;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, highlight, cols, query, cart.length, products, paying, qris, receipt, split, deliveryModal, activeLineId, view]);

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const tax = outlet && outlet.taxRateBps > 0 && !taxInclusiveUnknown ? Math.round((subtotal * outlet.taxRateBps) / 10000) : 0;
  // Delivery fee = the picked courier's price (0 until a courier is chosen).
  // Folded into the order total so it's charged + lands on the receipt; the
  // server recomputes the same total from the deliveryFee it's sent.
  const deliveryFee = delivery?.rate?.price ?? 0;
  const total = subtotal + tax + deliveryFee;
  // Amount the whole-bill Charge collects: the remaining balance when prior
  // (split) payments exist, else the full total. Quick sales: parkedPaid = 0.
  const due = Math.max(0, total - parkedPaid);

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!outlets.length) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">No outlet yet</h1>
        <p className="mt-2 text-muted-foreground">
          Create your first store under <a href="/dashboard/outlets" className="text-primary underline">Outlets</a> to start selling.
        </p>
      </div>
    );
  }

  // ── F&B floor view ──────────────────────────────────────────────────
  if (isFnb && view === 'floor') {
    return (
      <FloorView
        floor={floor}
        busy={floorBusy}
        outlets={outlets}
        outletId={outletId}
        floors={floors}
        floorId={floorId}
        onChangeFloor={setFloorId}
        onChangeOutlet={changeOutlet}
        onRefresh={() => loadFloor(outletId, floorId)}
        onPick={pickTable}
        onQuickSale={startQuickSale}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-4 lg:h-[calc(100vh-1.5rem)] lg:flex-row">
      {/* Catalog */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* F&B: which table this register is bound to (+ a way back to the
            floor). Shown for any F&B session — table-bound or quick sale. */}
        {isFnb && (
          <div className="mb-2 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={backToFloor}>
              <ArrowLeft className="h-4 w-4" /> Floor
            </Button>
            {table ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-transparent bg-primary/10 px-2.5 py-1.5 text-sm font-semibold text-primary"
              >
                <Utensils className="h-4 w-4" /> {table.label}
                {parkedTxnId && <span className="text-xs font-normal text-primary/80">· open bill</span>}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">Quick sale (no table)</span>
            )}
          </div>
        )}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              data-sell-search
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or scan barcode…"
              className="bg-card pl-9"
            />
          </div>
          <select
            value={outletId}
            onChange={(e) => changeOutlet(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div
          ref={gridRef}
          className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4"
        >
          {cards.map(({ p, v }, i) => {
            const code = v.sku || v.barcode;
            return (
              <button
                key={v.id}
                data-card-index={i}
                onClick={() => {
                  setHighlight(i);
                  addVariant(p, v);
                }}
                className={`flex flex-col rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent ${
                  i === highlight ? 'border-primary ring-2 ring-ring' : 'border-border'
                }`}
              >
                <ProductThumb name={p.name} imageUrl={p.imageUrl} className="mb-2 aspect-square w-full rounded-md" />
                <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                {v.name !== 'Default' && <span className="text-xs text-muted-foreground">{v.name}</span>}
                {code && <span className="font-mono text-[11px] text-muted-foreground">{code}</span>}
                <span className="mt-auto pt-2 text-sm font-semibold text-primary">{rupiah(v.price)}</span>
              </button>
            );
          })}
          {!cards.length && <p className="col-span-full p-8 text-center text-muted-foreground">No products match.</p>}
        </div>

        {/* Cashier hotkey legend */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd><Kbd>←</Kbd><Kbd>→</Kbd> navigate</span>
          <span><Kbd>Enter</Kbd> add</span>
          <span><Kbd>scan</Kbd> barcode</span>
          <span><Kbd>+</Kbd><Kbd>−</Kbd> qty</span>
          <span><Kbd>Del</Kbd> remove</span>
          <span><Kbd>F2</Kbd> pay</span>
          <span><Kbd>Esc</Kbd> clear</span>
        </div>
      </div>

      {/* Cart */}
      <Card className="flex w-full flex-col overflow-hidden lg:w-96">
        <div className="border-b border-border p-4">
          <CustomerPicker customer={customer} onChange={setCustomer} />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {cart.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Cart is empty. Tap a product.</p>}
          {cart.map((l) => {
            const noteOpen = openNoteId === l.variantId || !!l.note;
            return (
            <div key={l.variantId} className="rounded-md px-2 py-2 hover:bg-accent">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {rupiah(l.unitPrice)}{l.variantName !== 'Default' ? ` · ${l.variantName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(l.variantId, l.qty - 1)} className="rounded p-1 hover:bg-background"><Minus className="h-4 w-4" /></button>
                  <span className="w-6 text-center text-sm">{l.qty}</span>
                  <button onClick={() => setQty(l.variantId, l.qty + 1)} className="rounded p-1 hover:bg-background"><Plus className="h-4 w-4" /></button>
                </div>
                <span className="w-20 text-right text-sm font-medium">{rupiah(l.unitPrice * l.qty)}</span>
                {/* Per-item note toggle — reveals the inline note input below. */}
                <button
                  onClick={() => {
                    setOpenNoteId((id) => (id === l.variantId ? null : l.variantId));
                    setActiveLineId(l.variantId);
                  }}
                  title="Add a note for the kitchen"
                  aria-label="Add a note for the kitchen"
                  className={`rounded p-1 transition-colors hover:text-foreground ${l.note ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <StickyNote className="h-4 w-4" />
                </button>
                <button onClick={() => setQty(l.variantId, 0)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
              {noteOpen && (
                <Input
                  value={l.note ?? ''}
                  autoFocus={openNoteId === l.variantId}
                  onChange={(e) => setLineNote(l.variantId, e.target.value)}
                  placeholder="Note for kitchen (e.g. no onions)"
                  maxLength={280}
                  className="mt-1.5 h-auto bg-background px-2.5 py-1.5 text-xs"
                />
              )}
            </div>
            );
          })}
        </div>
        {/* Delivery (Fulfillment module) — quick-sale only. Toggle marks the
            order DELIVERY; the modal captures the address + picks a courier,
            whose price becomes the delivery fee. */}
        {!table && fulfillmentOn && (
          <div className="border-t border-border p-3">
            <button
              onClick={() => {
                if (delivery) {
                  setDelivery(null);
                } else {
                  setDelivery({
                    dest: {
                      contactName: customer?.name ?? '',
                      contactPhone: customer?.phone ?? '',
                      email: '',
                      address: '',
                      area: '',
                      postalCode: '',
                    },
                    customerId: customer?.id ?? null,
                    // Pre-fill the parcel from the cart — a delivery sale already
                    // knows what's shipping; the cashier just tops up weights.
                    items: cart.map((l) => ({
                      name: l.name,
                      qty: l.qty,
                      weight: 500,
                      value: l.unitPrice,
                    })),
                    rate: null,
                  });
                  setDeliveryModal(true);
                }
              }}
              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                delivery ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
              }`}
            >
              <span className="inline-flex items-center gap-2"><Truck className="h-4 w-4" /> Delivery</span>
              <span className="text-xs">{delivery ? 'On' : 'Off'}</span>
            </button>
            {delivery && (
              <div className="mt-2 rounded-md border border-border p-2 text-xs">
                {delivery.rate ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {(delivery.rate.courierName ?? delivery.rate.courierCode).toUpperCase()} ·{' '}
                        {delivery.rate.serviceName ?? delivery.rate.courierServiceCode}
                      </p>
                      <p className="truncate text-muted-foreground">
                        {delivery.dest.contactName || 'Recipient'} · {delivery.dest.address || 'No address'}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeliveryModal(true)}
                      className="shrink-0 font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setDeliveryModal(true)}
                    className="h-auto w-full gap-1.5 bg-primary/10 px-2 py-1.5 font-medium text-primary hover:bg-primary/20 hover:text-primary"
                  >
                    <Truck className="h-3.5 w-3.5" /> Add address & pick courier
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="space-y-1 border-t border-border p-4 text-sm">
          <Row label="Subtotal" value={rupiah(subtotal)} />
          {tax > 0 && <Row label={`Tax (${(outlet!.taxRateBps / 100).toFixed(0)}%)`} value={rupiah(tax)} />}
          {deliveryFee > 0 && <Row label="Delivery" value={rupiah(deliveryFee)} />}
          <div className="flex justify-between pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="text-primary">{rupiah(total)}</span>
          </div>
          {parkedPaid > 0 && (
            <>
              <Row label="Already paid" value={`− ${rupiah(parkedPaid)}`} />
              <div className="flex justify-between text-sm font-semibold">
                <span>Balance due</span>
                <span className="text-primary">{rupiah(due)}</span>
              </div>
            </>
          )}
          {table ? (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!cart.length || holding || splitting}
                  onClick={hold}
                  className="h-auto flex-1 gap-1.5 py-3 font-semibold"
                >
                  {holding ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />} Hold
                </Button>
                <Button
                  variant="outline"
                  disabled={!cart.length || holding || splitting}
                  onClick={startSplit}
                  className="h-auto flex-1 gap-1.5 py-3 font-semibold"
                >
                  {splitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />} Split
                </Button>
              </div>
              <Button
                disabled={!cart.length}
                onClick={() => setPaying(true)}
                className="h-auto w-full py-3 font-semibold"
              >
                Charge {rupiah(due)}
              </Button>
            </div>
          ) : (
            <Button
              disabled={!cart.length || (!!delivery && !delivery.rate)}
              onClick={() => setPaying(true)}
              className="mt-3 h-auto w-full py-3 font-semibold"
            >
              {delivery && !delivery.rate ? 'Pick a courier to charge' : `Charge ${rupiah(due)}`}
            </Button>
          )}
        </div>
      </Card>

      {paying && (
        <PaymentModal
          total={due}
          transferAccount={transferAccount}
          onClose={() => setPaying(false)}
          onConfirm={async (payments) => {
            setError(null);
            try {
              let sale: Sale;
              if (parkedTxnId) {
                // Settle an existing held bill: sync any cart edits, then charge.
                await api.patch(`/sales/${parkedTxnId}/items`, {
                  items: cartItems(),
                  orderType: 'DINE_IN',
                  customerId: customer?.id ?? null,
                });
                const res = await api.post<{ sale: Sale }>(`/sales/${parkedTxnId}/settle`, { payments });
                sale = res.data.sale;
              } else {
                // Immediate sale — quick sale, or a fresh table never held.
                const res = await api.post<{ sale: Sale }>('/sales', {
                  outletId,
                  customerId: customer?.id ?? null,
                  items: cartItems(),
                  payments,
                  ...(table
                    ? { tableId: table.id, orderType: 'DINE_IN' }
                    : delivery
                    ? { orderType: 'DELIVERY', deliveryFee }
                    : {}),
                });
                sale = res.data.sale;
              }
              setReceipt(sale);
              setCart([]);
              setCustomer(null);
              setPaying(false);
              // Delivery quick sale → dispatch the courier now that it's paid.
              if (delivery && !table) {
                await createDeliveryShipment(sale.id, delivery);
                setDelivery(null);
              }
              if (table) {
                setTable(null);
                setParkedTxnId(null);
                setParkedPaid(0);
                loadFloor(outletId);
              }
            } catch (e) {
              setError(e instanceof ApiRequestError ? e.message : 'Sale failed');
            }
          }}
          // Dynamic checkout (QRIS or VA) — module ON. Park the sale with a
          // PENDING QRIS/VA payment, mint a Plugipay checkout session, and hand
          // back the hosted-payment URL. Returns true on success; false → the
          // modal falls back to today's manual-reference payment (module OFF).
          onCheckout={async (channel) => {
            setError(null);
            const method = channel === 'va' ? 'VA' : 'QRIS';
            // A held open bill settles with manual tenders — fall back to the
            // manual-reference path rather than minting a second parked sale.
            if (parkedTxnId) return false;
            let saleId: string;
            try {
              const sale = await api.post<{ sale: Sale }>('/sales', {
                outletId,
                customerId: customer?.id ?? null,
                items: cartItems(),
                status: 'PARKED',
                payments: [{ method, amount: total, status: 'PENDING' }],
                ...(table
                  ? { tableId: table.id, orderType: 'DINE_IN' }
                  : delivery
                  ? { orderType: 'DELIVERY', deliveryFee }
                  : {}),
              });
              saleId = sale.data.sale.id;
            } catch (e) {
              setError(e instanceof ApiRequestError ? e.message : 'Could not start the sale');
              return false;
            }
            try {
              const q = await api.post<{ sessionId: string; qrUrl: string; amount: number }>(
                '/payments/qris',
                { transactionId: saleId, method: channel },
              );
              setQris({ saleId, sessionId: q.data.sessionId, qrUrl: q.data.qrUrl, amount: q.data.amount, method: channel });
              setPaying(false);
              return true;
            } catch (e) {
              // Module off (409) or Plugipay hiccup → void the parked sale
              // and let the cashier complete via a manual reference / cash.
              await api.post(`/sales/${saleId}/discard`, { reason: 'checkout_unavailable' }).catch(() => {});
              if (e instanceof ApiRequestError && e.status === 409) return false; // fall back to manual
              setError(e instanceof ApiRequestError ? e.message : 'Could not start the checkout');
              return false;
            }
          }}
        />
      )}

      {qris && (
        <QrisModal
          qris={qris}
          onCancel={async () => {
            // Cashier abandons the checkout before payment — void the parked sale.
            await api.post(`/sales/${qris.saleId}/discard`, { reason: 'checkout_cancelled' }).catch(() => {});
            setQris(null);
          }}
          onPaid={async () => {
            try {
              const res = await api.get<{ sale: Sale }>(`/sales/${qris.saleId}`);
              setReceipt(res.data.sale);
            } catch {
              /* the sale settled server-side; the receipt fetch is cosmetic */
            }
            // Delivery quick sale paid via QRIS/VA → dispatch the courier now.
            if (delivery && !table) {
              await createDeliveryShipment(qris.saleId, delivery);
              setDelivery(null);
            }
            setCart([]);
            setCustomer(null);
            setQris(null);
            if (table) {
              setTable(null);
              setParkedTxnId(null);
              setParkedPaid(0);
              loadFloor(outletId);
            }
          }}
        />
      )}

      {split && (
        <SplitModal
          txnId={split.txnId}
          total={split.total}
          initialPaid={split.initialPaid}
          lines={split.lines}
          transferAccount={transferAccount}
          onClose={() => setSplit(null)}
          onComplete={finishSplit}
          onError={(m) => setError(m)}
        />
      )}

      {deliveryModal && delivery && (
        <DeliveryModal
          initial={delivery}
          onClose={() => {
            // Cancelling before a courier is picked leaves delivery un-charged;
            // if they never picked one, drop back out of delivery mode.
            if (!delivery.rate) setDelivery(null);
            setDeliveryModal(false);
          }}
          onSave={(draft) => {
            setDelivery(draft);
            setDeliveryModal(false);
          }}
        />
      )}

      {receipt && (
        <ReceiptModal
          sale={receipt}
          onClose={() => (isFnb ? backToFloor() : setReceipt(null))}
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

// Tax is computed server-side authoritatively; the preview here is best-effort.
const taxInclusiveUnknown = false;

// Relative "opened N min ago" for an occupied table's bill.
function sinceLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

/**
 * F&B floor — a grid of the outlet's tables. Available tables are outlined;
 * occupied tables (a table carrying an open bill) are filled with the bill
 * total, item count and how long it's been open. Tapping a table binds the
 * register to it; "Quick sale" starts a no-table counter sale.
 */
function FloorView({
  floor,
  busy,
  outlets,
  outletId,
  floors,
  floorId,
  onChangeFloor,
  onChangeOutlet,
  onRefresh,
  onPick,
  onQuickSale,
}: {
  floor: FloorEntry[];
  busy: boolean;
  outlets: Outlet[];
  outletId: string;
  floors: Floor[];
  floorId: string;
  onChangeFloor: (id: string) => void;
  onChangeOutlet: (id: string) => void;
  onRefresh: () => void;
  onPick: (entry: FloorEntry) => void;
  onQuickSale: () => void;
}) {
  const occupied = floor.filter((f) => f.openBill).length;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied'>('all');
  const q = search.trim().toLowerCase();
  const filtered = floor.filter((f) => {
    const okQ =
      !q ||
      f.table.label.toLowerCase().includes(q) ||
      (f.table.zone ?? '').toLowerCase().includes(q);
    const okStatus =
      statusFilter === 'all' || (statusFilter === 'available' ? !f.openBill : !!f.openBill);
    return okQ && okStatus;
  });
  const isFiltered = q !== '' || statusFilter !== 'all';
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Utensils className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Floor</h1>
            <p className="text-sm text-muted-foreground">
              {isFiltered ? `${filtered.length} of ${floor.length}` : floor.length} table{floor.length === 1 ? '' : 's'} · {occupied} occupied
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {outlets.length > 1 && (
            <select
              value={outletId}
              onChange={(e) => onChangeOutlet(e.target.value)}
              className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <Button variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
          <Button onClick={onQuickSale} className="font-semibold">
            Quick sale
          </Button>
        </div>
      </div>

      {floors.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border pb-2">
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => onChangeFloor(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                f.id === floorId
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {floor.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table or zone…"
              className="bg-card pl-9"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            {(['all', 'available', 'occupied'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded px-3 py-1 text-xs font-medium capitalize ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {busy && !floor.length ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !floor.length ? (
        <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
          <Utensils className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">No tables yet</p>
          <p className="text-sm">
            Add tables under{' '}
            <a href="/dashboard/tables" className="text-primary underline">Tables</a>, or start a quick sale.
          </p>
        </div>
      ) : !filtered.length ? (
        <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
          <Search className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm">No tables match.</p>
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); }}
            className="mt-2 text-sm text-primary underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <FloorBody floor={filtered} onPick={onPick} />
      )}
    </div>
  );
}

// Floor-map geometry — must match the editor (tables/page.tsx).
const FLOOR_CELL = 56;
const FLOOR_COLS = 20;
const FLOOR_ROWS = 14;

function floorShapeRadius(shape: TableShape): string {
  return shape === 'ROUND' ? '9999px' : '0.5rem';
}

/**
 * The floor body: tables that have a saved position (posX/posY) render on a
 * to-scale map at those coordinates; tables with no position fall back to the
 * familiar grid below (so the screen works before anyone arranges the floor —
 * the seeded demo tables start unplaced). Both call the same onPick handler.
 */
function FloorBody({ floor, onPick }: { floor: FloorEntry[]; onPick: (entry: FloorEntry) => void }) {
  const placed = floor.filter((e) => e.table.posX != null && e.table.posY != null);
  const unplaced = floor.filter((e) => e.table.posX == null || e.table.posY == null);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto">
      {placed.length > 0 && (
        <div className="overflow-auto rounded-lg border border-border bg-muted/30">
          <div
            className="relative"
            style={{
              width: FLOOR_COLS * FLOOR_CELL,
              height: FLOOR_ROWS * FLOOR_CELL,
              backgroundSize: `${FLOOR_CELL}px ${FLOOR_CELL}px`,
              backgroundImage:
                'linear-gradient(to right, hsl(var(--border)/0.4) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)/0.4) 1px, transparent 1px)',
            }}
          >
            {placed.map((entry) => {
              const t = entry.table;
              const bill = entry.openBill;
              return (
                <button
                  key={t.id}
                  onClick={() => onPick(entry)}
                  style={{
                    position: 'absolute',
                    left: t.posX! * FLOOR_CELL + 3,
                    top: t.posY! * FLOOR_CELL + 3,
                    width: t.width * FLOOR_CELL - 6,
                    height: t.height * FLOOR_CELL - 6,
                    borderRadius: floorShapeRadius(t.shape),
                  }}
                  className={`flex flex-col items-center justify-center border-2 p-1 text-center shadow-sm transition-colors ${
                    bill
                      ? 'border-primary bg-primary/15 hover:bg-primary/25'
                      : 'border-border bg-card hover:border-primary hover:bg-accent'
                  }`}
                >
                  <span className="text-xs font-semibold leading-tight">{t.label}</span>
                  {bill ? (
                    <span className="text-[10px] font-semibold leading-tight text-primary">{rupiah(bill.total)}</span>
                  ) : (
                    t.seats != null && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Users className="h-2.5 w-2.5" /> {t.seats}
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {unplaced.length > 0 && (
        <div>
          {placed.length > 0 && (
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Not on the map · arrange them under{' '}
              <a href="/dashboard/tables" className="text-primary underline">Tables → Floor layout</a>
            </p>
          )}
          <div className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {unplaced.map((entry) => {
              const bill = entry.openBill;
              return (
                <button
                  key={entry.table.id}
                  onClick={() => onPick(entry)}
                  className={`flex aspect-square flex-col rounded-lg border p-3 text-left transition-colors ${
                    bill
                      ? 'border-primary bg-primary/10 hover:bg-primary/15'
                      : 'border-border bg-card hover:border-primary hover:bg-accent'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-semibold">{entry.table.label}</span>
                    {entry.table.seats != null && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" /> {entry.table.seats}
                      </span>
                    )}
                  </div>
                  {entry.table.zone && <span className="text-xs text-muted-foreground">{entry.table.zone}</span>}
                  <div className="mt-auto">
                    {bill ? (
                      <>
                        <p className="text-sm font-semibold text-primary">{rupiah(bill.total)}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> {sinceLabel(bill.openedAt)} · {bill.itemCount} item
                          {bill.itemCount === 1 ? '' : 's'}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs font-medium text-muted-foreground">Available</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

// A keyboard-cap chip for the hotkey legend.
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] font-medium text-foreground">
      {children}
    </kbd>
  );
}

// Product thumbnail with a graceful fallback: when there's no imageUrl or the
// image fails to load, show the product's initial on a muted tile.
function ProductThumb({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={`object-cover ${className ?? ''}`}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-muted font-semibold text-muted-foreground ${className ?? ''}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CustomerPicker({ customer, onChange }: { customer: Customer | null; onChange: (c: Customer | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || q.trim().length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ items: Customer[] }>(`/customers?q=${encodeURIComponent(q.trim())}`);
        setResults((res.data as { items?: Customer[] }).items ?? []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (customer) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{customer.name}</p>
          {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Attach customer (optional)"
        className="bg-background"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => { onChange(c); setQ(''); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {c.name} {c.phone && <span className="text-muted-foreground">· {c.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentModal({
  total,
  transferAccount,
  onClose,
  onConfirm,
  onCheckout,
}: {
  total: number;
  /** The store bank-transfer account (PosSettings). Null/blank when the
   *  merchant hasn't configured it yet → the Transfer tab shows a notice
   *  linking to Settings instead of a "Confirm received" action. */
  transferAccount: TransferAccount | null;
  onClose: () => void;
  onConfirm: (p: unknown[]) => void;
  /** Dynamic checkout (Payment module ON) for QRIS or VA. Returns true when a
   *  checkout session was minted (this modal then closes); false when the
   *  module is off / unavailable, in which case we fall back to a manual-
   *  reference payment of the same method. */
  onCheckout: (channel: 'qris' | 'va') => Promise<boolean>;
}) {
  const [method, setMethod] = useState<'CASH' | 'QRIS' | 'VA' | 'CARD' | 'TRANSFER' | 'GIFT_CARD'>('CASH');
  const [tendered, setTendered] = useState<number>(total);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const change = Math.max(0, tendered - total);
  const quick = [total, 50000, 100000, 150000, 200000].filter((v, i, a) => a.indexOf(v) === i);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // The Transfer tender needs a configured store account (bank + number) before
  // the cashier can confirm; account holder is optional.
  const transferConfigured = Boolean(
    transferAccount?.transferBankName?.trim() && transferAccount?.transferBankAccountNumber?.trim(),
  );

  const canConfirm =
    !busy &&
    !(method === 'CASH' && tendered < total) &&
    !(method === 'GIFT_CARD' && !reference.trim()) &&
    !(method === 'TRANSFER' && !transferConfigured);

  // Autofocus the first field on open + Enter charges / Esc closes. The page's
  // global hotkeys stand down while this modal is open, so it owns the keyboard.
  useEffect(() => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, [method]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (canConfirm) void confirm();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canConfirm, busy, method, tendered, reference]);

  async function confirm() {
    setBusy(true);
    // QRIS or VA with no manual reference → try a dynamic Plugipay checkout
    // first (module ON); if it succeeds the checkout modal takes over. If it
    // returns false (module OFF / hiccup) OR the cashier typed a manual ref,
    // take the manual-reference path (PAID immediately) — no regression.
    if ((method === 'QRIS' || method === 'VA') && !reference.trim()) {
      const minted = await onCheckout(method === 'VA' ? 'va' : 'qris');
      if (minted) {
        setBusy(false);
        return;
      }
    }
    const payment =
      method === 'CASH'
        ? { method, amount: total, tendered }
        : method === 'GIFT_CARD'
        ? { method, amount: total, reference: reference.trim(), status: 'PAID' }
        : { method, amount: total, reference: reference || undefined, status: 'PAID' };
    await onConfirm([payment]);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payment</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <p className="mt-1 text-2xl font-bold text-primary">{rupiah(total)}</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {(['CASH', 'QRIS', 'VA', 'CARD', 'TRANSFER', 'GIFT_CARD'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-md border py-2 text-xs font-medium ${method === m ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
            >
              {m === 'CASH'
                ? 'Cash'
                : m === 'QRIS'
                ? 'QRIS'
                : m === 'VA'
                ? 'VA'
                : m === 'CARD'
                ? 'Card'
                : m === 'TRANSFER'
                ? 'Transfer'
                : 'Gift card'}
            </button>
          ))}
        </div>

        {method === 'CASH' && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {quick.map((v) => (
                <Button key={v} variant="outline" size="sm" onClick={() => setTendered(v)} className="h-auto px-3 py-1.5 text-sm">
                  {rupiah(v)}
                </Button>
              ))}
            </div>
            <label className="block text-sm">
              <Label className="text-muted-foreground">Cash received</Label>
              <Input
                ref={firstFieldRef}
                type="number"
                value={tendered}
                onChange={(e) => setTendered(Number(e.target.value))}
                className="mt-1 h-auto bg-background py-2"
              />
            </label>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Change</span>
              <span className="font-semibold">{rupiah(change)}</span>
            </div>
          </div>
        )}

        {method === 'TRANSFER' && (
          <div className="mt-4 space-y-3">
            {transferConfigured ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Landmark className="h-4 w-4" /> Transfer to this account
                </div>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Bank</dt>
                    <dd className="font-medium">{transferAccount?.transferBankName}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Account no.</dt>
                    <dd className="flex items-center gap-2 font-mono font-semibold">
                      {transferAccount?.transferBankAccountNumber}
                      <button
                        type="button"
                        title="Copy account number"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              transferAccount?.transferBankAccountNumber ?? '',
                            );
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          } catch {
                            /* clipboard blocked — cashier can read it out */
                          }
                        }}
                        className="text-muted-foreground hover:text-primary"
                      >
                        {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </dd>
                  </div>
                  {transferAccount?.transferBankAccountHolder?.trim() && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Holder</dt>
                      <dd className="font-medium">{transferAccount.transferBankAccountHolder}</dd>
                    </div>
                  )}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  Have the customer transfer {rupiah(total)}, then tap Confirm received once the
                  funds arrive.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">No transfer account set up yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add your store bank-transfer account in{' '}
                  <Link href="/dashboard/settings" className="font-medium text-primary underline">
                    Settings → Business profile
                  </Link>{' '}
                  before accepting bank transfers.
                </p>
              </div>
            )}
          </div>
        )}

        {method !== 'CASH' && method !== 'TRANSFER' && (
          <label className="mt-4 block text-sm">
            <Label className="text-muted-foreground">
              {method === 'QRIS'
                ? 'QRIS reference (optional)'
                : method === 'VA'
                ? 'Virtual-account reference (optional)'
                : method === 'GIFT_CARD'
                ? 'Gift-card code'
                : 'Card / EDC reference (optional)'}
            </Label>
            <Input
              ref={firstFieldRef}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === 'QRIS' ? 'Plugipay QRIS ref' : method === 'VA' ? 'Plugipay VA ref' : method === 'GIFT_CARD' ? 'GC-XXXXXXXXXX' : 'Approval code'}
              className="mt-1 h-auto bg-background py-2"
            />
            {method === 'GIFT_CARD' && (
              <span className="mt-1 block text-xs text-muted-foreground">
                The card balance must cover {rupiah(total)}. Insufficient balance cancels the sale.
              </span>
            )}
            {method === 'QRIS' && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Leave blank to generate a live QR (Payments module) — the customer scans and the
                sale settles automatically. Enter a reference to record a manual QRIS payment.
              </span>
            )}
            {method === 'VA' && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Leave blank to open a virtual-account checkout (Payments module) — the customer
                pays the VA number and the sale settles automatically. Enter a reference to record
                a manual VA payment.
              </span>
            )}
          </label>
        )}

        <Button
          disabled={
            busy ||
            (method === 'CASH' && tendered < total) ||
            (method === 'GIFT_CARD' && !reference.trim()) ||
            (method === 'TRANSFER' && !transferConfigured)
          }
          onClick={confirm}
          className="mt-5 h-auto w-full py-3 font-semibold"
        >
          {busy
            ? 'Processing…'
            : method === 'QRIS' && !reference.trim()
            ? 'Generate QR'
            : method === 'VA' && !reference.trim()
            ? 'Generate VA'
            : method === 'TRANSFER'
            ? 'Confirm received'
            : 'Complete sale'}
        </Button>
      </div>
    </div>
  );
}

// ── Split-bill math ──────────────────────────────────────────────────────
// Every split method returns check amounts that sum to `total` EXACTLY (the
// server validates each payment against the remaining balance, so any drift
// would strand the bill un-completable). The remainder from integer division
// lands on the LAST check.

/** N equal checks; the rounding remainder goes on the last check. */
function equalSplit(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const amounts = Array.from({ length: n }, () => base);
  amounts[n - 1] += total - base * n;
  return amounts;
}

/** By-item: each check = Σ its assigned lines, scaled to the bill total so
 *  order-level tax/discount distribute proportionally. Last check absorbs the
 *  remainder so the checks sum to `total` exactly. */
function itemSplit(total: number, lines: CartLine[], assign: number[], n: number): number[] {
  const raws = Array.from({ length: n }, () => 0);
  lines.forEach((l, i) => {
    raws[assign[i] ?? 0] += l.unitPrice * l.qty;
  });
  const rawSum = raws.reduce((s, r) => s + r, 0) || 1;
  let acc = 0;
  return raws.map((r, i) => {
    if (i === n - 1) return total - acc;
    const a = Math.round((total * r) / rawSum);
    acc += a;
    return a;
  });
}

type SplitCheck = { amount: number; paid: boolean };

/**
 * Split-bill flow for an open table bill. Pick a method (Equal / By item /
 * Custom) + number of checks, review the per-check amounts (which always sum
 * to the bill total), then settle each check with its own PaymentModal. Each
 * paid check POSTs /sales/:id/payments; the bill stays PARKED (partially
 * paid) until the server reports it COMPLETED — then it returns to the floor.
 */
function SplitModal({
  txnId,
  total,
  initialPaid,
  lines,
  transferAccount,
  onClose,
  onComplete,
  onError,
}: {
  txnId: string;
  total: number;
  initialPaid: number;
  lines: CartLine[];
  transferAccount: TransferAccount | null;
  onClose: () => void;
  onComplete: () => void;
  onError: (msg: string) => void;
}) {
  const [phase, setPhase] = useState<'config' | 'pay'>('config');
  const [method, setMethod] = useState<'equal' | 'item' | 'custom'>('equal');
  const [n, setN] = useState(2);
  const [assign, setAssign] = useState<number[]>(() => lines.map(() => 0));
  const [custom, setCustom] = useState<number[]>(() => equalSplit(total, 2));
  const [checks, setChecks] = useState<SplitCheck[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [serverPaid, setServerPaid] = useState(initialPaid);
  const [completed, setCompleted] = useState(false);

  // Keep per-check inputs sized to N as the cashier changes the count.
  function changeN(next: number) {
    const clamped = Math.max(2, Math.min(8, next));
    setN(clamped);
    setCustom((c) => {
      const eq = equalSplit(total, clamped);
      return Array.from({ length: clamped }, (_, i) => c[i] ?? eq[i]);
    });
    setAssign((a) => a.map((v) => (v >= clamped ? 0 : v)));
  }

  // Seed Custom inputs with an equal split (a valid sum) whenever the method
  // is selected or the check count changes, so they start matching the total.
  useEffect(() => {
    if (method !== 'custom') return;
    setCustom((c) => {
      const eq = equalSplit(total, n);
      return Array.from({ length: n }, (_, i) => c[i] ?? eq[i]);
    });
  }, [method, n, total]);

  // Preview amounts for the chosen method (config phase).
  const preview = useMemo<number[]>(() => {
    if (method === 'equal') return equalSplit(total, n);
    if (method === 'item') return itemSplit(total, lines, assign, n);
    return Array.from({ length: n }, (_, i) => Math.max(0, Math.round(custom[i] ?? 0)));
  }, [method, n, assign, custom, lines, total]);

  const previewSum = preview.reduce((s, a) => s + a, 0);
  const customValid = method !== 'custom' || previewSum === total;

  function startPaying() {
    // Lock the amounts; drop any zero-amount checks (nothing to collect).
    setChecks(preview.filter((a) => a > 0).map((a) => ({ amount: a, paid: false })));
    setPhase('pay');
  }

  const remaining = Math.max(0, total - serverPaid);

  async function payCheck(idx: number, payment: Record<string, unknown>) {
    try {
      const res = await api.post<{
        payment: { status: 'PARKED' | 'COMPLETED'; paidTotal: number; total: number; remaining: number };
      }>(`/sales/${txnId}/payments`, payment);
      const r = res.data.payment;
      setServerPaid(r.paidTotal);
      setChecks((cs) => cs.map((c, i) => (i === idx ? { ...c, paid: true } : c)));
      setActiveIdx(null);
      if (r.status === 'COMPLETED') {
        setCompleted(true);
        setTimeout(onComplete, 1100);
      }
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Payment failed');
      setActiveIdx(null);
    }
  }

  // ── Config phase ──────────────────────────────────────────────────────
  if (phase === 'config') {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Split bill</h2>
            <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Total <span className="font-semibold text-foreground">{rupiah(total)}</span>
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {(['equal', 'item', 'custom'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-md border py-2 text-xs font-medium ${method === m ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
              >
                {m === 'equal' ? 'Equal' : m === 'item' ? 'By item' : 'Custom'}
              </button>
            ))}
          </div>

          {(method === 'equal' || method === 'custom' || method === 'item') && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Checks</span>
              <div className="flex items-center gap-1">
                <button onClick={() => changeN(n - 1)} className="rounded border border-border p-1 hover:bg-accent"><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center text-sm font-semibold">{n}</span>
                <button onClick={() => changeN(n + 1)} className="rounded border border-border p-1 hover:bg-accent"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          )}

          {method === 'item' && (
            <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto">
              {lines.map((l, i) => (
                <div key={l.variantId} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.qty}× {l.name}</p>
                    <p className="text-xs text-muted-foreground">{rupiah(l.unitPrice * l.qty)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {Array.from({ length: n }, (_, c) => (
                      <button
                        key={c}
                        onClick={() => setAssign((a) => a.map((v, j) => (j === i ? c : v)))}
                        className={`h-7 w-7 rounded text-xs font-semibold ${assign[i] === c ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
                      >
                        {c + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {method === 'custom' && (
            <div className="mt-4 space-y-2">
              {Array.from({ length: n }, (_, i) => (
                <label key={i} className="flex items-center gap-3">
                  <span className="w-16 text-sm text-muted-foreground">Check {i + 1}</span>
                  <Input
                    type="number"
                    value={custom[i] ?? 0}
                    onChange={(e) =>
                      setCustom((c) => c.map((v, j) => (j === i ? Math.max(0, Number(e.target.value)) : v)))
                    }
                    className="h-auto flex-1 bg-background py-2"
                  />
                </label>
              ))}
              <div className={`flex justify-between text-sm ${customValid ? 'text-muted-foreground' : 'text-destructive'}`}>
                <span>Sum {rupiah(previewSum)}</span>
                <span>{customValid ? 'matches total' : `must equal ${rupiah(total)}`}</span>
              </div>
            </div>
          )}

          {/* Computed check preview (equal / by item) */}
          {method !== 'custom' && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {preview.map((a, i) => (
                <div key={i} className="rounded-md border border-border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Check {i + 1}</span>
                  <p className="font-semibold">{rupiah(a)}</p>
                </div>
              ))}
            </div>
          )}

          <Button
            disabled={!customValid}
            onClick={startPaying}
            className="mt-5 h-auto w-full py-3 font-semibold"
          >
            Start split · {n} check{n === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    );
  }

  // ── Pay phase ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={completed ? undefined : onClose}>
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Split payment</h2>
            {!completed && <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>}
          </div>

          {/* Running progress */}
          <div className="mt-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paid {rupiah(serverPaid)} of {rupiah(total)}</span>
              <span className="font-semibold">{remaining > 0 ? `${rupiah(remaining)} left` : 'Settled'}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.round((serverPaid / total) * 100))}%` }}
              />
            </div>
          </div>

          {completed ? (
            <div className="my-8 flex flex-col items-center gap-2">
              <CheckCircle2 className="h-14 w-14 text-green-600" />
              <p className="font-medium">Bill fully paid</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {checks.map((c, i) => (
                <button
                  key={i}
                  disabled={c.paid}
                  onClick={() => setActiveIdx(i)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left ${
                    c.paid ? 'border-border bg-muted/40' : 'border-primary hover:bg-accent'
                  } disabled:cursor-default`}
                >
                  <span className="text-sm font-medium">
                    Check {i + 1} of {checks.length}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{rupiah(c.amount)}</span>
                    {c.paid ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                        <CheckCircle2 className="h-4 w-4" /> Paid
                      </span>
                    ) : (
                      <span className="rounded bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Pay</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeIdx !== null && (
        <PaymentModal
          total={checks[activeIdx].amount}
          transferAccount={transferAccount}
          onClose={() => setActiveIdx(null)}
          onConfirm={(payments) => payCheck(activeIdx, payments[0] as Record<string, unknown>)}
          // Split checks settle with manual tenders only — a dynamic checkout
          // would need its own parked sale, so fall back to a manual reference.
          onCheckout={async () => false}
        />
      )}
    </>
  );
}

/**
 * Dynamic-QRIS modal — shows the live QR for the customer to scan and
 * polls the checkout-session status until it completes (the merchant
 * webhook settles the sale server-side). The hostedUrl is Plugipay's
 * hosted checkout, which renders the real QRIS; we surface it as a
 * scannable link + a big "Open QR" button (and embed it for the
 * customer-facing screen). On `completed` → onPaid (fetch the receipt).
 */
function QrisModal({
  qris,
  onCancel,
  onPaid,
}: {
  qris: { saleId: string; sessionId: string; qrUrl: string; amount: number; method: 'qris' | 'va' };
  onCancel: () => void;
  onPaid: () => void;
}) {
  const [status, setStatus] = useState<'waiting' | 'paid' | 'error'>('waiting');
  const paidRef = useRef(false);
  const isVa = qris.method === 'va';

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      while (!cancelled && !paidRef.current) {
        try {
          const res = await api.get<{ status: string }>(`/payments/qris/${qris.sessionId}`);
          const s = res.data.status;
          if (s === 'completed') {
            paidRef.current = true;
            setStatus('paid');
            // Brief "paid" flash, then close into the receipt.
            setTimeout(() => !cancelled && onPaid(), 1200);
            return;
          }
          if (s === 'expired' || s === 'canceled') {
            setStatus('error');
            return;
          }
        } catch {
          /* transient — keep polling */
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [qris.sessionId, onPaid]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isVa ? 'Pay via Virtual Account' : 'Scan to pay'}</h2>
          <button onClick={onCancel} aria-label="Cancel">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <p className="mt-1 text-2xl font-bold text-primary">{rupiah(qris.amount)}</p>

        {status === 'paid' ? (
          <div className="my-8 flex flex-col items-center gap-2">
            <CheckCircle2 className="h-14 w-14 text-green-600" />
            <p className="font-medium">Payment received</p>
          </div>
        ) : status === 'error' ? (
          <div className="my-8 flex flex-col items-center gap-2">
            <X className="h-12 w-12 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {isVa
                ? 'The virtual account expired or was canceled. Close and try again, or take cash.'
                : 'The QR expired or was canceled. Close and try again, or take cash.'}
            </p>
          </div>
        ) : (
          <>
            <div className="my-5 flex flex-col items-center gap-3">
              <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
                <QrCode className="h-16 w-16 text-primary" />
              </div>
              <a
                href={qris.qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <QrCode className="h-4 w-4" /> {isVa ? 'Open VA details for customer' : 'Open QR for customer'}
              </a>
            </div>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the customer to pay…
            </p>
          </>
        )}

        {status !== 'paid' && (
          <Button
            variant="outline"
            onClick={onCancel}
            className="mt-5 h-auto w-full py-2.5"
          >
            Cancel sale
          </Button>
        )}
      </div>
    </div>
  );
}

function ReceiptModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center sm:text-center">
          <Receipt className="h-10 w-10 text-primary" />
          <DialogTitle>Sale complete</DialogTitle>
          <p className="text-sm text-muted-foreground">{sale.number}</p>
        </DialogHeader>
        <div className="space-y-1 border-y border-border py-3 text-left text-sm">
          {sale.items.map((it, i) => (
            <div key={i} className="flex justify-between">
              <span>{it.quantity}× {it.productName}</span>
              <span>{rupiah(it.lineTotal)}</span>
            </div>
          ))}
        </div>
        {(sale.deliveryFee ?? 0) > 0 && (
          <div className="mb-1 flex justify-between text-sm text-muted-foreground">
            <span>Delivery</span>
            <span>{rupiah(sale.deliveryFee ?? 0)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="text-primary">{rupiah(sale.total)}</span>
        </div>
        {sale.changeTotal > 0 && (
          <div className="mt-1 flex justify-between text-sm text-muted-foreground">
            <span>Change</span>
            <span>{rupiah(sale.changeTotal)}</span>
          </div>
        )}
        <Button onClick={onClose} className="h-auto w-full py-2.5 font-semibold">
          New sale
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Delivery sheet for the quick sale — capture the recipient + address, quote
 * couriers (/delivery/rates) for a single weighted parcel, and pick one. The
 * chosen rate's price becomes the order's delivery fee. Inlines the
 * create-delivery-from-sale pattern from the Fulfillment page, but the
 * shipment itself is created later, once the sale is paid.
 *
 * Weight: products carry no per-item weight in this catalog, so we quote one
 * parcel at a sane 1000 g default (matching the Fulfillment page) and let the
 * cashier override it.
 */
// A delivery parcel row in edit form (string inputs, like the Fulfillment
// create-shipment modal's ItemRow). Converted to/from DeliveryItem on the draft.
type ParcelRow = { name: string; qty: string; weight: string; value: string };

function rowsFromItems(items: DeliveryItem[]): ParcelRow[] {
  if (!items.length) return [{ name: '', qty: '1', weight: '500', value: '0' }];
  return items.map((it) => ({
    name: it.name,
    qty: String(it.qty),
    weight: String(it.weight),
    value: String(it.value),
  }));
}

function itemsFromRows(rows: ParcelRow[]): DeliveryItem[] {
  return rows.map((r) => ({
    name: r.name.trim() || 'Item',
    qty: Number(r.qty) || 1,
    weight: Number(r.weight) || 0,
    value: Number(r.value) || 0,
  }));
}

/**
 * Delivery input for a quick sale — brought up to parity with the Fulfillment
 * create-shipment modal: an origin guard, a "pick customer" recipient pre-fill
 * with an optional email, and an itemized parcel (pre-seeded from the cart).
 * The chosen courier's price becomes the order's delivery fee.
 */
function DeliveryModal({
  initial,
  onClose,
  onSave,
}: {
  initial: DeliveryDraft;
  onClose: () => void;
  onSave: (draft: DeliveryDraft) => void;
}) {
  const [dest, setDest] = useState<DeliveryDest>(initial.dest);
  const [customerId, setCustomerId] = useState<string | null>(initial.customerId);
  const [rows, setRows] = useState<ParcelRow[]>(rowsFromItems(initial.items));
  const [rates, setRates] = useState<Rate[]>([]);
  const [picked, setPicked] = useState<Rate | null>(initial.rate);
  const [loadingRates, setLoadingRates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originLoading, setOriginLoading] = useState(true);
  const [originMissing, setOriginMissing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    // Origin must be configured or Fulkruma can't quote/create. Mirror the
    // create-shipment modal's "has origin" check (over the /delivery proxy).
    api
      .get<Record<string, unknown>>('/delivery/origin')
      .then((res) => {
        const o = (res.data ?? {}) as Record<string, unknown>;
        const has = Boolean(o.address || o.areaId || o.postal || o.contactName);
        setOriginMissing(!has);
      })
      .catch(() => setOriginMissing(false)) // don't block on a transient origin error
      .finally(() => setOriginLoading(false));
  }, []);

  const totalWeight = rows.reduce(
    (sum, r) => sum + (Number(r.weight) || 0) * (Number(r.qty) || 0),
    0,
  );

  function updateRow(i: number, patch: Partial<ParcelRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setRates([]);
    setPicked(null);
  }

  function patchDest(patch: Partial<DeliveryDest>) {
    setDest((prev) => ({ ...prev, ...patch }));
    setRates([]);
    setPicked(null);
  }

  function applyCustomer(c: CustomerLite) {
    setCustomerId(c.id);
    setDest((prev) => ({
      ...prev,
      contactName: c.name ?? prev.contactName,
      contactPhone: c.phone ?? prev.contactPhone,
      email: c.email ?? prev.email,
    }));
    setRates([]);
    setPicked(null);
    setPickerOpen(false);
  }

  function validRecipient(): string | null {
    if (!dest.contactName.trim()) return 'Recipient name is required.';
    if (!dest.contactPhone.trim()) return 'Recipient phone is required.';
    if (!dest.address.trim()) return 'Recipient address is required.';
    if (!dest.postalCode.trim()) return 'Recipient postal code is required.';
    if (rows.length === 0) return 'Add at least one parcel item.';
    return null;
  }

  async function quote() {
    const v = validRecipient();
    if (v) {
      setError(v);
      return;
    }
    setLoadingRates(true);
    setError(null);
    setRates([]);
    setPicked(null);
    try {
      const { data } = await api.post<{ pricing?: Rate[] } | Rate[]>('/delivery/rates', {
        destination: deliveryDestinationPayload(dest),
        items: deliveryItemsPayload(itemsFromRows(rows)),
      });
      // Fulkruma returns either an array of rates or an object wrapping
      // `pricing` — accept both shapes (mirrors the Fulfillment page).
      const list = Array.isArray(data) ? data : ((data?.pricing as Rate[]) ?? []);
      setRates(list);
      if (list.length === 0) setError('No courier rates available for this destination.');
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setError('The Fulfillment module is off. Enable it under Settings → Modules.');
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to fetch rates');
      }
    } finally {
      setLoadingRates(false);
    }
  }

  function save() {
    if (!picked) return;
    onSave({ dest, customerId, items: itemsFromRows(rows), rate: picked });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> Delivery</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {originLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : originMissing ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
              <p className="font-medium">No pickup origin set</p>
              <p className="mt-1 text-muted-foreground">
                Set your shipping origin before quoting couriers — Fulkruma needs it to calculate rates.
              </p>
              <Link
                href="/dashboard/fulfillment/shipping"
                className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
              >
                Set pickup origin <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <>
              {/* Recipient */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Recipient</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    className="h-auto gap-1 px-2 py-1 text-xs"
                  >
                    <UserSearch className="h-3.5 w-3.5" /> Pick customer
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DeliveryField label="Recipient name" value={dest.contactName} onChange={(v) => patchDest({ contactName: v })} />
                  <DeliveryField label="Recipient phone" value={dest.contactPhone} onChange={(v) => patchDest({ contactPhone: v })} />
                </div>
                <DeliveryField label="Email (optional)" value={dest.email} onChange={(v) => patchDest({ email: v })} />
                <DeliveryField label="Destination address" value={dest.address} onChange={(v) => patchDest({ address: v })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <DeliveryField label="Area / city" value={dest.area} onChange={(v) => patchDest({ area: v })} />
                  <DeliveryField label="Postal code" value={dest.postalCode} onChange={(v) => patchDest({ postalCode: v })} />
                </div>
              </section>

              {/* Parcel items — pre-filled from the cart */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Parcel items</h3>
                  <span className="text-xs text-muted-foreground">Total weight: {totalWeight} g</span>
                </div>
                <div className="space-y-2">
                  {rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_3rem_4rem_4.5rem_auto] items-end gap-2">
                      <DeliveryMiniField label="Name" value={r.name} onChange={(v) => updateRow(i, { name: v })} />
                      <DeliveryMiniField label="Qty" value={r.qty} onChange={(v) => updateRow(i, { qty: v })} type="number" />
                      <DeliveryMiniField label="Wt (g)" value={r.weight} onChange={(v) => updateRow(i, { weight: v })} type="number" />
                      <DeliveryMiniField label="Value" value={r.value} onChange={(v) => updateRow(i, { value: v })} type="number" />
                      <button
                        type="button"
                        disabled={rows.length === 1}
                        onClick={() => { setRows((prev) => prev.filter((_, idx) => idx !== i)); setRates([]); setPicked(null); }}
                        className="mb-1.5 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        title="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setRows((prev) => [...prev, { name: '', qty: '1', weight: '500', value: '0' }])}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add item
                </button>
              </section>

              {/* Rates */}
              <Button
                type="button"
                variant="outline"
                disabled={loadingRates}
                onClick={() => void quote()}
                className="w-full gap-1.5"
              >
                {loadingRates ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Get courier rates
              </Button>

              {rates.length > 0 && (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {rates.map((r, i) => {
                    const isPicked =
                      picked?.courierCode === r.courierCode &&
                      picked?.courierServiceCode === r.courierServiceCode;
                    return (
                      <button
                        key={`${r.courierCode}-${r.courierServiceCode}-${i}`}
                        type="button"
                        onClick={() => setPicked(r)}
                        className={
                          'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ' +
                          (isPicked ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')
                        }
                      >
                        <div>
                          <div className="font-medium">
                            {(r.courierName ?? r.courierCode).toUpperCase()} · {r.serviceName ?? r.courierServiceCode}
                          </div>
                          {r.duration && <div className="text-xs text-muted-foreground">{r.duration}</div>}
                        </div>
                        <span className="font-medium">{rupiah(r.price)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!picked || originMissing || originLoading}
            onClick={save}
            className="gap-1.5"
          >
            Use this courier{picked ? ` · ${rupiah(picked.price)}` : ''}
          </Button>
        </DialogFooter>

        {pickerOpen && <DeliveryCustomerPicker onPick={applyCustomer} onClose={() => setPickerOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

// Customer search → pre-fill the delivery recipient (name/phone/email).
// Mirrors the Fulfillment create-shipment modal's picker; fetches the same
// /customers list (which carries email, unlike the sell page's Customer type).
function DeliveryCustomerPicker({
  onPick,
  onClose,
}: {
  onPick: (c: CustomerLite) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const q = query.trim();
      api
        .get<{ items: CustomerLite[] }>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then((res) => setCustomers(res.data.items ?? []))
        .catch(() => setCustomers([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle className="text-sm">Pick customer</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone or email…"
          className="bg-background"
        />
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : customers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No customers found.</p>
          ) : (
            <ul className="divide-y divide-border">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.phone ?? c.email ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background"
      />
    </label>
  );
}

function DeliveryMiniField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <Label className="mb-1 block text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background px-2"
      />
    </label>
  );
}
