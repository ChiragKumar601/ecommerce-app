import type { z } from 'zod';
import type { cardSchema, profileSchema, supportRequestSchema } from '@app/shared';
import { SUPPORT_TYPE_LABELS } from '@app/shared';
import type { AppContext } from '../api/context.js';
import { AppError } from '../domain/errors.js';
import { newId, randomUpperAlnum } from '../domain/ids.js';
import { money } from '../domain/money.js';
import { addMs, formatIstDate, formatIstDateTime, istDate, MS } from '../domain/time.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { hashSecret, sha256, verifySecret } from '../lib/crypto.js';
import { getAccount } from './auth.js';

// Account sections (spec §6.9; plan S12.1–S12.4): profile, credits, gift cards, saved cards, support.

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
export type { Tx };

// ── Profile (PRF-001, PRF-002) ───────────────────────────────────────────────

export async function getProfile(ctx: AppContext, accountId: string) {
  const a = await getAccount(ctx, accountId);
  const q = await ctx.db.securityQuestion.findUnique({ where: { id: a.securityQuestionId } });
  return {
    id: a.id, name: a.name, email: a.email, phone: a.phone, gender: a.gender, dateOfBirth: a.dateOfBirth,
    securityQuestion: q ? { id: q.id, text: q.text } : null,
  };
}

export async function updateProfile(ctx: AppContext, accountId: string, d: z.output<ReturnType<typeof profileSchema>>) {
  const a = await getAccount(ctx, accountId);
  const email = d.email ?? null;
  const phone = d.phone ?? null;
  const sensitive = email !== a.email || phone !== a.phone || !!d.newPassword || (!!d.securityQuestionId && (d.securityQuestionId !== a.securityQuestionId || !!d.securityAnswer));
  // Changing email, phone, password or security question needs the current password (PRF-002).
  if (sensitive) {
    if (!d.currentPassword) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'currentPassword', code: 'required', message: 'Enter your current password to save these changes' }] });
    if (!(await verifySecret(a.passwordHash, d.currentPassword))) throw new AppError('INVALID_CURRENT_PASSWORD', { fieldErrors: [{ field: 'currentPassword', code: 'invalid', message: 'Your current password is incorrect.' }] });
  }
  if (d.securityQuestionId && !(await ctx.db.securityQuestion.findFirst({ where: { id: d.securityQuestionId, active: true } }))) {
    throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'securityQuestionId', code: 'invalid', message: 'Choose a security question' }] });
  }
  for (const [field, value] of [['email', email], ['phone', phone]] as const) {
    if (!value || value === a[field]) continue;
    const taken = await ctx.db.account.findFirst({ where: { [field]: value, NOT: { id: accountId } }, select: { id: true } });
    if (taken) throw new AppError('IDENTIFIER_TAKEN', { context: 'profile', fieldErrors: [{ field, code: 'taken', message: 'This email/phone is already linked to another account.' }] });
  }
  const now = ctx.clock.now();
  const [passwordHash, securityAnswerHash] = await Promise.all([
    d.newPassword ? hashSecret(d.newPassword) : null,
    d.securityQuestionId && d.securityAnswer ? hashSecret(d.securityAnswer) : null,
  ]);
  try {
    await ctx.db.account.update({
      where: { id: accountId },
      data: {
        name: d.name, email, phone, gender: d.gender ?? null, dateOfBirth: d.dateOfBirth ?? null,
        ...(passwordHash ? { passwordHash, passwordChangedAt: now } : {}),
        ...(securityAnswerHash ? { securityQuestionId: d.securityQuestionId!, securityAnswerHash } : {}),
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new AppError('IDENTIFIER_TAKEN', { context: 'profile' });
    throw e;
  }
  return getProfile(ctx, accountId);
}

// ── Credits (PRF-003) ────────────────────────────────────────────────────────

const CREDITS_PAGE = 20;
const LEDGER_LABELS: Record<string, string> = {
  signup_grant: 'Welcome credits', order_debit: 'Used on an order', order_debit_reversal: 'Returned from an unpaid order', refund_credit: 'Refund',
};

export async function creditBalance(db: AppContext['db'] | Tx, accountId: string): Promise<number> {
  const r = await db.creditLedgerEntry.aggregate({ where: { accountId }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

export async function getCredits(ctx: AppContext, accountId: string, page: number) {
  const [balance, totalCount, rows] = await Promise.all([
    creditBalance(ctx.db, accountId),
    ctx.db.creditLedgerEntry.count({ where: { accountId } }),
    ctx.db.creditLedgerEntry.findMany({ where: { accountId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * CREDITS_PAGE, take: CREDITS_PAGE }),
  ]);
  const orderIds = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x))];
  const orders = orderIds.length ? await orderNumbers(ctx, orderIds) : new Map<string, string>();
  return {
    balance: money(balance),
    entries: rows.map((r) => ({
      id: r.id, date: formatIstDateTime(r.createdAt), description: r.note || LEDGER_LABELS[r.type] || r.type, type: r.type,
      amount: money(r.amount), order: r.orderId ? { id: r.orderId, number: orders.get(r.orderId) ?? null } : null,
    })),
    totalCount, page, pageCount: Math.max(1, Math.ceil(totalCount / CREDITS_PAGE)),
  };
}

/** Order numbers for links in the ledgers. */
async function orderNumbers(ctx: AppContext, ids: string[]): Promise<Map<string, string>> {
  const rows = await ctx.db.order.findMany({ where: { id: { in: ids } }, select: { id: true, orderNumber: true } });
  return new Map(rows.map((r) => [r.id, r.orderNumber]));
}

// ── Gift cards (PRF-004, §7.6) ───────────────────────────────────────────────

/** Applies expiry lazily: ACTIVE/EXHAUSTED → EXPIRED once now ≥ expiresAt (final). */
export function giftCardStatus(g: { status: string; balance: number; expiresAt: Date }, now: Date): 'active' | 'exhausted' | 'expired' {
  if (g.status === 'expired' || now >= g.expiresAt) return 'expired';
  return g.balance > 0 ? 'active' : 'exhausted';
}

export async function redeemGiftCard(ctx: AppContext, accountId: string, code: string) {
  const def = await ctx.db.giftCardCode.findUnique({ where: { code } });
  if (!def) throw new AppError('GIFT_CARD_INVALID');
  if (!def.active) throw new AppError('GIFT_CARD_INACTIVE');
  const now = ctx.clock.now();
  const id = newId();
  try {
    await ctx.db.accountGiftCard.create({
      data: {
        id, accountId, code, initialBalance: def.faceValue, balance: def.faceValue, redeemedAt: now, expiresAt: addMs(now, def.validityDays * MS.day), status: 'active',
        transactions: { create: { id: newId(), amount: def.faceValue, type: 'redeem', createdAt: now } },
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new AppError('GIFT_CARD_ALREADY_REDEEMED');
    throw e;
  }
  return (await listGiftCards(ctx, accountId)).items.find((g) => g.id === id)!;
}

const TXN_LABELS: Record<string, string> = { redeem: 'Redeemed', order_debit: 'Used on an order', order_debit_reversal: 'Returned from an unpaid order', refund_credit: 'Refund' };

export async function listGiftCards(ctx: AppContext, accountId: string) {
  const now = ctx.clock.now();
  const rows = await ctx.db.accountGiftCard.findMany({ where: { accountId }, orderBy: { redeemedAt: 'desc' }, include: { transactions: { orderBy: { createdAt: 'desc' } } } });
  const orderIds = [...new Set(rows.flatMap((g) => g.transactions.map((t) => t.orderId)).filter((x): x is string => !!x))];
  const orders = orderIds.length ? await orderNumbers(ctx, orderIds) : new Map<string, string>();
  return {
    items: rows.map((g) => {
      const status = giftCardStatus(g, now);
      return {
        id: g.id, maskedCode: `•••• ${g.code.slice(-4)}`, balance: money(g.balance), initialBalance: money(g.initialBalance), status,
        expiresOn: formatIstDate(istDate(g.expiresAt)), expiresAt: g.expiresAt.toISOString(), usable: status === 'active',
        transactions: g.transactions.map((t) => ({
          id: t.id, date: formatIstDateTime(t.createdAt), description: TXN_LABELS[t.type] ?? t.type, amount: money(t.amount),
          order: t.orderId ? { id: t.orderId, number: orders.get(t.orderId) ?? null } : null,
        })),
      };
    }),
  };
}

// ── Saved cards (PRF-005, SEC-003) ───────────────────────────────────────────

const cardLabel = (c: { network: string; last4: string }) => `${c.network} •••• ${c.last4}`;

function cardExpired(c: { expiryMonth: number; expiryYear: number }, now: Date): boolean {
  const [y, m] = istDate(now).split('-').map(Number) as [number, number];
  return c.expiryYear < y || (c.expiryYear === y && c.expiryMonth < m);
}

export function cardView(c: { id: string; nameOnCard: string; last4: string; network: string; issuingBank: string; cardType: string; expiryMonth: number; expiryYear: number; isDefault: boolean }, now: Date) {
  return {
    id: c.id, nameOnCard: c.nameOnCard, last4: c.last4, network: c.network, issuingBank: c.issuingBank, cardType: c.cardType, label: cardLabel(c),
    expiry: `${String(c.expiryMonth).padStart(2, '0')}/${String(c.expiryYear % 100).padStart(2, '0')}`, isDefault: c.isDefault, expired: cardExpired(c, now),
  };
}

export async function listCards(ctx: AppContext, accountId: string) {
  const rows = await ctx.db.savedCard.findMany({ where: { accountId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  const now = ctx.clock.now();
  return { items: rows.map((c) => cardView(c, now)) };
}

/** Recognises a designated test card (PAY-003); anything else that passes format checks is refused. */
export async function findTestCard(ctx: AppContext, number: string) {
  const c = await ctx.db.testCard.findUnique({ where: { number } });
  if (!c) throw new AppError('NOT_TEST_CARD', { fieldErrors: [{ field: 'number', code: 'not_test_card', message: "Use a demo test card. Real cards aren't accepted. See Demo help." }] });
  return c;
}

export async function saveCard(ctx: AppContext, accountId: string, d: Pick<z.output<ReturnType<typeof cardSchema>>, 'nameOnCard' | 'number' | 'expiry'>) {
  const test = await ctx.db.testCard.findUnique({ where: { number: d.number } });
  if (!test) throw new AppError('NOT_TEST_CARD', { fieldErrors: [{ field: 'number', code: 'not_test_card', message: "Use a demo test card. Real cards aren't accepted. See Demo help." }] });
  const [mm, yy] = d.expiry.split('/').map(Number) as [number, number];
  const max = await ctx.settings.get<number>('cards.max', 5);
  const db = ctx.db;
  const existing = await db.savedCard.findMany({ where: { accountId } });
  const ref = sha256(d.number);
  const same = existing.find((c) => c.testCardRef === ref && c.expiryMonth === mm && c.expiryYear === 2000 + yy);
  if (same) return same;
  if (existing.length >= max) throw new AppError('LIMIT_REACHED', { context: 'cards' });
  return db.savedCard.create({
    data: {
      id: newId(), accountId, nameOnCard: d.nameOnCard, last4: test.last4, network: test.network, issuingBank: test.issuingBank, cardType: test.cardType,
      expiryMonth: mm, expiryYear: 2000 + yy, isDefault: existing.length === 0, testCardRef: ref, createdAt: ctx.clock.now(),
    },
  });
}

async function ownCard(ctx: AppContext, accountId: string, id: string) {
  const c = await ctx.db.savedCard.findFirst({ where: { id, accountId } });
  if (!c) throw new AppError('NOT_FOUND'); // AUTHZ-002
  return c;
}

/** Removing the default card makes the most recently added remaining card the default (SD-10). */
export async function removeCard(ctx: AppContext, accountId: string, id: string) {
  const c = await ownCard(ctx, accountId, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.savedCard.delete({ where: { id: c.id } });
    if (c.isDefault) {
      const next = await tx.savedCard.findFirst({ where: { accountId }, orderBy: { createdAt: 'desc' } });
      if (next) await tx.savedCard.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  return listCards(ctx, accountId);
}

export async function setDefaultCard(ctx: AppContext, accountId: string, id: string) {
  await ownCard(ctx, accountId, id);
  await ctx.db.$transaction([
    ctx.db.savedCard.updateMany({ where: { accountId, isDefault: true }, data: { isDefault: false } }),
    ctx.db.savedCard.update({ where: { id }, data: { isDefault: true } }),
  ]);
  return listCards(ctx, accountId);
}

// ── Support requests (PRF-006, PRV-002) ──────────────────────────────────────

/** Whether an order referenced by a support request belongs to the customer (AUTHZ-001). */
async function ownsOrder(ctx: AppContext, accountId: string, orderId: string): Promise<boolean> {
  return !!(await ctx.db.order.findFirst({ where: { id: orderId, accountId }, select: { id: true } }));
}

export async function createSupportRequest(ctx: AppContext, accountId: string, d: z.output<typeof supportRequestSchema>) {
  if (d.orderId && !(await ownsOrder(ctx, accountId, d.orderId))) throw new AppError('NOT_FOUND');
  const now = ctx.clock.now();
  const requestNumber = `SR-${istDate(now).slice(2).replace(/-/g, '')}-${randomUpperAlnum(5)}`;
  const row = await ctx.db.supportRequest.create({ data: { id: newId(), requestNumber, accountId, type: d.type, orderId: d.orderId ?? null, message: d.message, createdAt: now } });
  if (d.type === 'account_deletion') await ctx.db.account.update({ where: { id: accountId }, data: { deletionRequestedAt: now } });
  return {
    request: supportView(row),
    message: d.type === 'account_deletion'
      ? "We've recorded your request. Your account and personal data will be deleted within 30 days."
      : `Request ${requestNumber} submitted`,
  };
}

const supportView = (r: { id: string; requestNumber: string; type: string; orderId: string | null; message: string; status: string; createdAt: Date }) => ({
  id: r.id, requestNumber: r.requestNumber, type: r.type, typeLabel: SUPPORT_TYPE_LABELS[r.type as keyof typeof SUPPORT_TYPE_LABELS] ?? r.type,
  orderId: r.orderId, message: r.message, status: 'Submitted', date: formatIstDateTime(r.createdAt),
});

export async function listSupportRequests(ctx: AppContext, accountId: string) {
  const rows = await ctx.db.supportRequest.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' } });
  return { items: rows.map(supportView) };
}

// ── Demo help (DAT-006, DAT-007, RET-006, D-22) ──────────────────────────────

export async function getDemoHelp(ctx: AppContext) {
  const [cards, upi, gifts, images] = await Promise.all([
    ctx.db.testCard.findMany({ orderBy: [{ issuingBank: 'asc' }, { cardType: 'asc' }, { label: 'asc' }] }),
    ctx.db.testUpi.findMany({ orderBy: { upiId: 'asc' } }),
    ctx.db.giftCardCode.findMany({ where: { active: true }, orderBy: { faceValue: 'asc' } }),
    ctx.db.productImage.findMany({ select: { url: true, photographer: true, photographerUrl: true, licence: true, sourcePageUrl: true, source: true }, distinct: ['url'], orderBy: { url: 'asc' } }),
  ]);
  const outcome = (o: string | null) => (o === null ? 'Random outcome' : { success: 'Always succeeds', failure: 'Always fails', cancelled: 'Always cancelled', timed_out: 'Always times out' }[o] ?? o);
  return {
    cards: cards.map((c) => ({ number: c.number.replace(/(\d{4})(?=\d)/g, '$1 '), network: c.network, bank: c.issuingBank, type: c.cardType, outcome: outcome(c.forcedOutcome) })),
    cardNote: 'Use any future expiry date (for example 12/30) and any 3-digit CVV.',
    upi: upi.map((u) => ({ upiId: u.upiId, outcome: outcome(u.forcedOutcome) })),
    upiNote: 'Any other valid UPI ID, such as name@okbank, gets a random outcome.',
    giftCards: gifts.map((g) => ({ code: g.code, value: money(g.faceValue), validity: g.validityDays === 1 ? '1 day' : `${g.validityDays} days` })),
    returnTags: [
      { tag: '#approve', effect: 'The return is approved, then picked up.' },
      { tag: '#reject', effect: 'The return is rejected, with a reason.' },
      { tag: '#pickupfail', effect: 'Pickup fails twice and the return is closed.' },
    ],
    imageCredits: images.map((i) => ({ url: i.url, author: i.photographer, authorUrl: i.photographerUrl, licence: i.licence, source: i.sourcePageUrl, provider: i.source })),
  };
}
