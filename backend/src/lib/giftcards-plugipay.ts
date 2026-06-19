import type { PlugipayClient } from '@forjio/plugipay-node';
import { prisma } from './db.js';
import { ApiError } from './http.js';
import { encodeCursor } from './cursor.js';
import { newId } from './ids.js';
import { paymentClientIfEnabled } from '../services/plugipay-module-service.js';
import {
  issueGiftCard as issueGiftCardLocal,
  giftCardByCode as giftCardByCodeLocal,
  type IssueGiftCardInput,
} from './giftcards.js';

/*
 * Gift-card / store-credit FACADE.
 *
 * Plugipay now owns gift cards as stored monetary value. When a merchant
 * has the Payments module ON, the card lives in their provisioned Plugipay
 * workspace and issue/redeem/topup/balance/list route to
 * `plugipayForMerchant(...).giftCards` (stamped externalSource:'malapos',
 * externalRef:<saleId|refundId>). When the module is OFF, every operation
 * falls back to the existing LOCAL Prisma implementation UNCHANGED — so
 * merchants who never enabled Payments are non-regressively served.
 *
 * The switch is a single non-throwing probe (`paymentClientIfEnabled`):
 *   - module on + PLUGIPAY_* env set + merchant workspace minted → client
 *   - otherwise (module off, no env, no workspace, any error)        → null
 * The routes + sell/refund flows call THIS facade and never branch on the
 * module flag themselves.
 *
 * Wire shape: the facade returns rows in the SHAPE the frontend + routes
 * already expect (id, code, initialBalance, balance, status ACTIVE/REDEEMED/
 * VOID, customerId, note, createdAt) regardless of source — Plugipay rows
 * are normalized to that shape so `/dashboard/gift-cards` is source-blind.
 */

/** The unified row shape the routes + frontend consume. */
export interface GiftCardView {
  id: string;
  code: string;
  initialBalance: number;
  balance: number;
  status: 'ACTIVE' | 'REDEEMED' | 'VOID';
  customerId: string | null;
  note: string | null;
  createdAt: string;
  /** 'plugipay' when served from the merchant workspace, 'local' otherwise. */
  source: 'plugipay' | 'local';
}

const STATUS_MAP: Record<string, GiftCardView['status']> = {
  active: 'ACTIVE',
  redeemed: 'REDEEMED',
  void: 'VOID',
  // Plugipay 'expired' has no local analogue; surface it as REDEEMED (spent
  // / no longer usable) so the existing 3-state badge keeps working.
  expired: 'REDEEMED',
};

function viewFromPlugipay(card: {
  id: string;
  code: string;
  initialBalance: number;
  balance: number;
  status: string;
  customerId: string | null;
  note: string | null;
  createdAt: string;
}): GiftCardView {
  return {
    id: card.id,
    code: card.code,
    initialBalance: card.initialBalance,
    balance: card.balance,
    status: STATUS_MAP[card.status] ?? 'ACTIVE',
    customerId: card.customerId,
    note: card.note,
    createdAt: card.createdAt,
    source: 'plugipay',
  };
}

function viewFromLocal(card: {
  id: string;
  code: string;
  initialBalance: number;
  balance: number;
  status: string;
  customerId: string | null;
  note: string | null;
  createdAt: Date;
}): GiftCardView {
  return {
    id: card.id,
    code: card.code,
    initialBalance: card.initialBalance,
    balance: card.balance,
    status: (card.status as GiftCardView['status']) ?? 'ACTIVE',
    customerId: card.customerId,
    note: card.note,
    createdAt: card.createdAt.toISOString(),
    source: 'local',
  };
}

/** Resolve the merchant Plugipay client (or null → local path). */
export async function giftCardClientIfEnabled(
  accountId: string,
): Promise<PlugipayClient | null> {
  return paymentClientIfEnabled(accountId);
}

// ── Issue ───────────────────────────────────────────────────────────────

export async function issueGiftCardFacade(input: IssueGiftCardInput): Promise<GiftCardView> {
  const client = await giftCardClientIfEnabled(input.accountId);
  if (!client) {
    const id = await issueGiftCardLocal(input);
    const card = await prisma.giftCard.findUniqueOrThrow({ where: { id } });
    return viewFromLocal(card);
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Amount must be a positive integer (IDR)');
  }
  try {
    const card = await client.giftCards.issue({
      amount: input.amount,
      currency: 'IDR',
      customerId: input.customerId ?? null,
      code: input.code ? input.code.trim().toUpperCase() : null,
      note: input.note ?? null,
      issuedSource: 'malapos',
      issuedRef: input.accountId,
    });
    return viewFromPlugipay(card);
  } catch (err) {
    throw mapPlugipayError(err, 'issue gift card');
  }
}

// ── List ────────────────────────────────────────────────────────────────

export async function listGiftCardsFacade(opts: {
  accountId: string;
  customerId?: string | null;
  status?: string | null;
  limit: number;
  cursor?: { createdAt: string; id: string } | null;
}): Promise<{ rows: GiftCardView[]; next: string | null; hasMore: boolean; source: 'plugipay' | 'local' }> {
  const client = await giftCardClientIfEnabled(opts.accountId);
  if (!client) {
    const rows = await prisma.giftCard.findMany({
      where: {
        accountId: opts.accountId,
        ...(opts.customerId ? { customerId: opts.customerId } : {}),
        ...(opts.status ? { status: opts.status as never } : {}),
        ...(opts.cursor
          ? {
              OR: [
                { createdAt: { lt: opts.cursor.createdAt } },
                { createdAt: opts.cursor.createdAt, id: { lt: opts.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
    });
    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    const last = page[page.length - 1];
    const next =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return { rows: page.map(viewFromLocal), next, hasMore, source: 'local' };
  }

  // Plugipay-backed: its list paginates on its own cursor. We map the
  // local `status` (ACTIVE/REDEEMED/VOID) onto Plugipay's lowercase enum.
  const statusParam = opts.status ? opts.status.toLowerCase() : undefined;
  try {
    const res = await client.giftCards.list({
      limit: opts.limit,
      ...(opts.customerId ? { customerId: opts.customerId } : {}),
      ...(statusParam ? { status: statusParam as never } : {}),
      order: 'desc',
    });
    return {
      rows: res.data.map(viewFromPlugipay),
      next: res.cursor,
      hasMore: res.hasMore,
      source: 'plugipay',
    };
  } catch (err) {
    throw mapPlugipayError(err, 'list gift cards');
  }
}

// ── Lookup by code (balance + status) ─────────────────────────────────────

export async function giftCardByCodeFacade(
  accountId: string,
  code: string,
): Promise<GiftCardView | null> {
  const client = await giftCardClientIfEnabled(accountId);
  if (!client) {
    const card = await giftCardByCodeLocal(accountId, code);
    return card ? viewFromLocal(card) : null;
  }
  try {
    const card = await client.giftCards.getByCode(code.trim().toUpperCase());
    return viewFromPlugipay(card);
  } catch (err) {
    // A not-found code surfaces as null (the local path returns null too).
    if ((err as { status?: number }).status === 404) return null;
    throw mapPlugipayError(err, 'look up gift card');
  }
}

// ── Void ──────────────────────────────────────────────────────────────────

export async function voidGiftCardFacade(
  accountId: string,
  id: string,
): Promise<GiftCardView> {
  const client = await giftCardClientIfEnabled(accountId);
  if (!client) {
    const card = await prisma.giftCard.findFirst({ where: { id, accountId } });
    if (!card) throw new ApiError(404, 'NOT_FOUND', 'Gift card not found');
    if (card.status === 'VOID') return viewFromLocal(card);
    const updated = await prisma.$transaction(async (tx) => {
      if (card.balance !== 0) {
        await tx.giftCardEntry.create({
          data: {
            id: newId('gce'),
            accountId,
            giftCardId: card.id,
            delta: -card.balance,
            reason: 'void',
          },
        });
      }
      return tx.giftCard.update({ where: { id: card.id }, data: { balance: 0, status: 'VOID' } });
    });
    return viewFromLocal(updated);
  }
  try {
    const card = await client.giftCards.void(id);
    return viewFromPlugipay(card);
  } catch (err) {
    throw mapPlugipayError(err, 'void gift card');
  }
}

// ── Redeem (sell-screen GIFT_CARD tender) ─────────────────────────────────

/**
 * Redeem a gift card via the merchant's Plugipay workspace. Used by the
 * sell flow when the Payments module is ON — the card lives in Plugipay,
 * so it can't be redeemed inside the local sale transaction. The caller
 * redeems BEFORE opening the local sale txn (so an insufficient-balance /
 * void / unknown-card failure aborts the sale cleanly, mirroring the local
 * roll-back semantics). Idempotent upstream on (externalSource, externalRef).
 */
export async function redeemGiftCardPlugipay(
  client: PlugipayClient,
  opts: { code: string; amount: number; transactionId: string },
): Promise<void> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card redemption amount must be positive');
  }
  const code = opts.code.trim().toUpperCase();
  let card;
  try {
    card = await client.giftCards.getByCode(code);
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      throw new ApiError(404, 'NOT_FOUND', `Gift card ${code} not found`);
    }
    throw mapPlugipayError(err, 'redeem gift card');
  }
  if (card.status === 'void') throw new ApiError(409, 'CONFLICT', 'Gift card is void');
  if (card.status === 'redeemed' || card.balance <= 0) {
    throw new ApiError(409, 'CONFLICT', 'Gift card has no remaining balance');
  }
  if (opts.amount > card.balance) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      `Gift card balance is ${card.balance}; cannot redeem ${opts.amount}`,
    );
  }
  try {
    await client.giftCards.redeem(card.id, {
      amount: opts.amount,
      externalSource: 'malapos',
      externalRef: opts.transactionId,
    });
  } catch (err) {
    throw mapPlugipayError(err, 'redeem gift card');
  }
}

/**
 * Issue or top up customer store credit on refund-to-store-credit, via the
 * merchant Plugipay workspace. Best-effort: the caller treats any failure
 * as non-fatal (the monetary refund already landed locally). When the
 * customer already has a store-credit card we top it up; otherwise we issue
 * a fresh one. externalRef = refundId for idempotency.
 */
export async function refundToStoreCreditPlugipay(
  client: PlugipayClient,
  opts: { customerId: string; amount: number; refundId: string; note?: string | null },
): Promise<void> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) return;
  const existing = await client.giftCards.list({
    customerId: opts.customerId,
    status: 'active' as never,
    limit: 1,
  });
  const card = existing.data[0];
  if (card) {
    await client.giftCards.topup(card.id, {
      amount: opts.amount,
      externalSource: 'malapos',
      externalRef: opts.refundId,
      note: opts.note ?? 'Store credit from refund',
    });
  } else {
    await client.giftCards.issue({
      amount: opts.amount,
      currency: 'IDR',
      customerId: opts.customerId,
      note: opts.note ?? 'Store credit from refund',
      issuedSource: 'malapos',
      issuedRef: opts.refundId,
    });
  }
}

/** Normalize a Plugipay SDK error into our ApiError envelope. */
function mapPlugipayError(err: unknown, action: string): ApiError {
  const status = (err as { status?: number }).status ?? 502;
  const message = (err as Error).message ?? `Failed to ${action} via Plugipay`;
  if (status === 404) return new ApiError(404, 'NOT_FOUND', message);
  if (status === 409) return new ApiError(409, 'CONFLICT', message);
  if (status === 422) return new ApiError(422, 'VALIDATION_ERROR', message);
  return new ApiError(502, 'INTERNAL_ERROR', `Could not ${action}: ${message}`);
}
