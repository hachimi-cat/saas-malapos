import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { newId } from './ids.js';
import { ApiError } from './http.js';

/*
 * Gift cards / store credit. One model serves both: an anonymous gift card
 * (no customerId) and a customer-linked store-credit balance. `balance` is
 * the denormalized fast read; GiftCardEntry is the append-only ledger so the
 * two can never drift (same discipline as the stock ledger).
 *
 * Redemption is wired into the sell flow (lib/sell.ts): a GIFT_CARD payment
 * whose `reference` is the code validates + decrements the balance inside the
 * sale transaction.
 */

/** Human-friendly code: GC-XXXXXXXX (Crockford-ish, no ambiguous chars). */
function generateCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `GC-${out}`;
}

export interface IssueGiftCardInput {
  accountId: string;
  amount: number; // IDR initial balance
  customerId?: string | null;
  code?: string | null; // supplied code (e.g. printed card); generated when absent
  note?: string | null;
}

/** Issue a new gift card / store credit and seed its ledger. */
export async function issueGiftCard(input: IssueGiftCardInput): Promise<string> {
  const { accountId } = input;
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Amount must be a positive integer (IDR)');
  }

  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, accountId } });
    if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
  }

  // Generate a unique code, retrying on the rare collision; respect a
  // caller-supplied code (which must be free).
  let code = (input.code ?? '').trim().toUpperCase();
  if (code) {
    const clash = await prisma.giftCard.findUnique({
      where: { accountId_code: { accountId, code } },
    });
    if (clash) throw new ApiError(409, 'CONFLICT', 'A gift card with that code already exists');
  } else {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      const clash = await prisma.giftCard.findUnique({
        where: { accountId_code: { accountId, code: candidate } },
      });
      if (!clash) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not allocate a gift-card code');
  }

  const id = newId('gft');
  await prisma.$transaction(async (tx) => {
    await tx.giftCard.create({
      data: {
        id,
        accountId,
        code,
        initialBalance: input.amount,
        balance: input.amount,
        customerId: input.customerId ?? null,
        note: input.note ?? null,
      },
    });
    await tx.giftCardEntry.create({
      data: {
        id: newId('gce'),
        accountId,
        giftCardId: id,
        delta: input.amount,
        reason: 'issue',
      },
    });
  });

  return id;
}

/** Look up a gift card by its code (case-insensitive on the stored upper). */
export async function giftCardByCode(accountId: string, code: string) {
  return prisma.giftCard.findUnique({
    where: { accountId_code: { accountId, code: code.trim().toUpperCase() } },
  });
}

/**
 * Redeem `amount` from a gift card INSIDE an existing transaction (the sale).
 * Validates ACTIVE + sufficient balance, decrements, writes a ledger entry,
 * links the redeeming transaction, and flips status to REDEEMED at 0.
 */
export async function redeemGiftCard(
  tx: Prisma.TransactionClient,
  opts: { accountId: string; code: string; amount: number; transactionId: string },
): Promise<void> {
  const { accountId } = opts;
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Gift-card redemption amount must be positive');
  }
  const code = opts.code.trim().toUpperCase();
  const card = await tx.giftCard.findUnique({
    where: { accountId_code: { accountId, code } },
  });
  if (!card) throw new ApiError(404, 'NOT_FOUND', `Gift card ${code} not found`);
  if (card.status === 'VOID') throw new ApiError(409, 'CONFLICT', 'Gift card is void');
  if (card.status === 'REDEEMED' || card.balance <= 0) {
    throw new ApiError(409, 'CONFLICT', 'Gift card has no remaining balance');
  }
  if (opts.amount > card.balance) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      `Gift card balance is ${card.balance}; cannot redeem ${opts.amount}`,
    );
  }

  const newBalance = card.balance - opts.amount;
  await tx.giftCard.update({
    where: { id: card.id },
    data: {
      balance: newBalance,
      ...(newBalance === 0 ? { status: 'REDEEMED' } : {}),
    },
  });
  await tx.giftCardEntry.create({
    data: {
      id: newId('gce'),
      accountId,
      giftCardId: card.id,
      delta: -opts.amount,
      transactionId: opts.transactionId,
      reason: 'redeem',
    },
  });
}
