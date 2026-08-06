import type { ChatAction } from '@forjio/agent-ui';
import { api } from '@/lib/api';

/**
 * The docked chat's Apply path (review mode) — executes a BFF-sanitized
 * ChatAction with the USER's own session via the same api-client calls
 * the dashboard pages use (the agent only ever proposed it).
 *
 * `$n` categoryId refs: the BFF re-based them onto the action list it
 * returned (1-based); `earlier` is that same list, index-addressed, so
 * `$2` resolves to `earlier[1]`'s applied result.
 */

const ACTION_REF_RE = /^\$([1-9])$/;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const bool = (v: unknown): boolean | undefined =>
  typeof v === 'boolean' ? v : undefined;
/** Nullable pass-through: null clears, string sets, absent stays. */
const strOrNull = (v: unknown): string | null | undefined =>
  v === null ? null : typeof v === 'string' ? v : undefined;

function resolveCategoryRef(
  categoryId: string | null | undefined,
  earlier: { action: ChatAction; result?: unknown }[],
): string | null | undefined {
  if (categoryId === null || categoryId === undefined) return categoryId;
  const m = ACTION_REF_RE.exec(categoryId);
  if (!m) return categoryId;
  const prior = earlier[Number(m[1]) - 1];
  if (!prior || prior.action.resource !== 'categories') {
    throw new Error('This product references a category action that does not exist');
  }
  const created = prior.result as { id?: unknown } | undefined;
  const id = typeof created?.id === 'string' ? created.id : undefined;
  if (!id) {
    throw new Error('Apply the category action first — this product goes into it');
  }
  return id;
}

/** Build a payload of only the fields the action actually set —
 *  omitted keys stay untouched on PATCH. */
function defined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export async function applyChatAction(
  action: ChatAction,
  earlier: { action: ChatAction; result?: unknown }[],
): Promise<unknown> {
  const f = action.fields ?? {};

  if (action.resource === 'categories') {
    const payload = defined({
      name: str(f.name),
      sortOrder: num(f.sortOrder),
      isActive: bool(f.isActive),
    });
    if (action.mode === 'edit') {
      const id = str(action.id);
      if (!id) throw new Error('Missing category id');
      return (await api.patch(`/categories/${encodeURIComponent(id)}`, payload)).data;
    }
    if (!payload.name) throw new Error('A category needs a name');
    return (await api.post('/categories', payload)).data;
  }

  if (action.resource === 'products') {
    const categoryId =
      f.categoryId !== undefined ? resolveCategoryRef(strOrNull(f.categoryId), earlier) : undefined;
    const base = defined({
      name: str(f.name),
      description: strOrNull(f.description),
      categoryId,
      kind: str(f.kind),
      isActive: bool(f.isActive),
    });
    // Malapos keeps price/sku/barcode on the VARIANT, not the product
    // row, and a simple product is exactly one variant. The action model
    // is flat, so fold the money back into the shape the API wants.
    const price = num(f.price);
    const variant = defined({
      name: 'Default',
      price,
      sku: strOrNull(f.sku),
      barcode: strOrNull(f.barcode),
    });

    if (action.mode === 'edit') {
      const id = str(action.id);
      if (!id) throw new Error('Missing product id');
      // PATCH replaces the variant list, so only send it when the action
      // actually carried variant-level fields — otherwise an edit that
      // only renames a product would wipe its SKUs and prices.
      const touchesVariant =
        f.price !== undefined || f.sku !== undefined || f.barcode !== undefined;
      const payload = touchesVariant ? { ...base, variants: [variant] } : base;
      return (await api.patch(`/products/${encodeURIComponent(id)}`, payload)).data;
    }
    if (!base.name) throw new Error('A product needs a name');
    if (price === undefined) throw new Error('A product needs a price');
    return (await api.post('/products', { ...base, variants: [variant] })).data;
  }

  throw new Error('This action type is not supported');
}
