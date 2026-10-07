import type { QuoteChange } from '@app/shared';
import type { z } from 'zod';
import type { payPaymentSchema, paymentQuoteSelectionSchema } from '@app/shared';
import type { AppContext } from '../api/context.js';
import { AppError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { money } from '../domain/money.js';
import { computeQuote } from '../domain/pricing/quote.js';
import { diffQuotes } from '../domain/pricing/quoteDiff.js';
import type { CardType, PaymentSelectionInput, Quote } from '../domain/pricing/types.js';
import { randomIntBetween, weightedPick } from '../domain/random.js';
import { addMs, istDate } from '../domain/time.js';
import type { Order } from '../generated/prisma/client.js';
import { sha256 } from '../lib/crypto.js';
import { creditBalance, giftCardStatus } from './account.js';
import { addressView } from './address.js';
import { getAccount } from './auth.js';
import { getCheckout, ownCheckout, pendingOrderSummary, priceLines, sessionLines, storeQuote, type PaymentSelection } from './checkout.js';
import { activeBankOffer, deliveryConfig, findCoupon, loadLineData, quoteLineInput, quoteView } from './pricing.js';
import { newOrderNumber, placeOrder, releaseOrder, reverseReservations, simSettings, withOrder, writeTx, type SimSettings, type Tx } from './orders/core.js';

// Payment and order creation (spec §6.15; plan S15). Pay is one atomic operation (INT-002, PAY-006).

type PayInput = z.output<ReturnType<typeof payPaymentSchema>>;
type QuoteSelection = z.output<typeof paymentQuoteSelectionSchema>;
type Outcome = 'success' | 'failure' | 'cancelled' | 'timed_out';

const OUTCOME_MESSAGES: Record<Outcome | 'pending', string> = {
  pending: 'Processing payment…',
  success: 'Payment successful',
  failure: 'Payment failed. No money was taken.',
  cancelled: 'Payment cancelled.',
  timed_out: 'Payment timed out. No money was taken.',
};

// ── Instruments ──────────────────────────────────────────────────────────────

interface Instrument {
  selection: PaymentSelection;
  method: 'card' | 'upi' | 'cod' | null;
  label: string | null;
  testCardRef: string | null;
  upiId: string | null;
  forced: Outcome | null;
  saveCard: Record<string, unknown> | null;
}

async function testCardsByRef(ctx: AppContext) {
  const cards = await ctx.db.testCard.findMany();
  return new Map(cards.map((c) => [sha256(c.number), c]));
}

function cardExpired(month: number, year: number, now: Date) {
  const [y, m] = istDate(now).split('-').map(Number) as [number, number];
  return year < y || (year === y && month < m);
}

/** Recognises the instrument (PAY-003, PAY-004): saved or new test card, UPI ID, COD, or nothing. */
async function resolveInstrument(ctx: AppContext, accountId: string, p: PayInput): Promise<Instrument> {
  const base: Instrument = { selection: { giftCardId: p.giftCardId, useCredits: p.useCredits, method: p.method, card: null }, method: p.method, label: null, testCardRef: null, upiId: null, forced: null, saveCard: null };
  if (p.method === 'card' && p.newCard) {
    const t = await ctx.db.testCard.findUnique({ where: { number: p.newCard.number } });
    if (!t) throw new AppError('NOT_TEST_CARD', { fieldErrors: [{ field: 'newCard.number', code: 'not_test_card', message: "Use a demo test card. Real cards aren't accepted. See Demo help." }] });
    const [mm, yy] = p.newCard.expiry.split('/').map(Number) as [number, number];
    const ref = sha256(t.number);
    return {
      ...base, selection: { ...base.selection, card: { issuingBank: t.issuingBank, cardType: t.cardType as CardType } },
      label: `${t.network} •••• ${t.last4}`, testCardRef: ref, forced: (t.forcedOutcome as Outcome | null) ?? null,
      saveCard: p.newCard.save ? { nameOnCard: p.newCard.nameOnCard, last4: t.last4, network: t.network, issuingBank: t.issuingBank, cardType: t.cardType, expiryMonth: mm, expiryYear: 2000 + yy, testCardRef: ref } : null,
    };
  }
  if (p.method === 'card' && p.savedCardId) {
    const c = await ctx.db.savedCard.findFirst({ where: { id: p.savedCardId, accountId } });
    if (!c) throw new AppError('NOT_FOUND');
    if (cardExpired(c.expiryMonth, c.expiryYear, ctx.clock.now())) throw new AppError('CARD_EXPIRED');
    const t = (await testCardsByRef(ctx)).get(c.testCardRef);
    return {
      ...base, selection: { ...base.selection, card: { savedCardId: c.id } },
      label: `${c.network} •••• ${c.last4}`, testCardRef: c.testCardRef, forced: (t?.forcedOutcome as Outcome | null) ?? null,
    };
  }
  if (p.method === 'upi' && p.upiId) {
    const u = await ctx.db.testUpi.findUnique({ where: { upiId: p.upiId.toLowerCase() } });
    return { ...base, label: p.upiId, upiId: p.upiId, forced: (u?.forcedOutcome as Outcome | undefined) ?? null };
  }
  return base;
}

/** Quote-only selection (no secrets): saved card id, or a new card's first 8 digits for the bank offer. */
export async function selectionFromQuoteInput(ctx: AppContext, accountId: string, s: QuoteSelection): Promise<PaymentSelection> {
  let card: PaymentSelection['card'] = null;
  if (s.method === 'card' && s.savedCardId) {
    if (await ctx.db.savedCard.findFirst({ where: { id: s.savedCardId, accountId }, select: { id: true } })) card = { savedCardId: s.savedCardId };
  } else if (s.method === 'card' && s.cardBin) {
    const t = await ctx.db.testCard.findFirst({ where: { number: { startsWith: s.cardBin } } });
    if (t) card = { issuingBank: t.issuingBank, cardType: t.cardType as CardType };
  }
  return { giftCardId: s.giftCardId, useCredits: s.useCredits, method: s.method, card };
}

/** SetPaymentSelection at checkout (PAY-002): every change re-quotes. */
export async function setCheckoutPayment(ctx: AppContext, accountId: string, checkoutId: string, s: QuoteSelection) {
  await ownCheckout(ctx, accountId, checkoutId);
  const selection = await selectionFromQuoteInput(ctx, accountId, s);
  await ctx.db.checkoutSession.update({ where: { id: checkoutId }, data: { paymentSelection: selection as unknown as object } });
  return getCheckout(ctx, accountId, checkoutId);
}

function decideOutcome(ctx: AppContext, forced: Outcome | null, weights: Record<Outcome, number>): Outcome {
  return forced ?? weightedPick(ctx.random, weights);
}

function methodChecks(q: Quote, method: Instrument['method']) {
  if (q.remainder > 0 && !method) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'method', code: 'required', message: 'Choose a payment method' }] });
  if (q.methodError === 'COD_NOT_ALLOWED') throw new AppError('COD_NOT_ALLOWED');
  if (q.methodError === 'METHOD_NOT_NEEDED') throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'method', code: 'not_needed', message: 'Nothing is left to pay: place the order without a payment method.' }] });
}

// ── Wallet reservations (PAY-006 e) ──────────────────────────────────────────

async function reserveWallet(ctx: AppContext, tx: Tx, order: Pick<Order, 'id' | 'accountId'>, q: Quote) {
  const now = ctx.clock.now();
  if (q.wallet.giftCard > 0 && q.wallet.giftCardId) {
    const changed = await tx.$executeRawUnsafe(
      'UPDATE "AccountGiftCard" SET "balance" = "balance" - ?, "status" = CASE WHEN "balance" - ? = 0 THEN \'exhausted\' ELSE "status" END WHERE "id" = ? AND "accountId" = ? AND "balance" >= ? AND "status" != \'expired\' AND "expiresAt" > ?',
      q.wallet.giftCard, q.wallet.giftCard, q.wallet.giftCardId, order.accountId, q.wallet.giftCard, now.toISOString(),
    );
    if (changed === 0) throw new AppError('QUOTE_CHANGED', { changes: [{ type: 'GIFT_CARD_UNUSABLE', reason: 'no_balance' }] });
    await tx.giftCardTxn.create({ data: { id: newId(), accountGiftCardId: q.wallet.giftCardId, amount: -q.wallet.giftCard, type: 'order_debit', orderId: order.id, createdAt: now } });
    await tx.paymentAllocation.create({ data: { id: newId(), orderId: order.id, source: 'gift_card', amount: q.wallet.giftCard, accountGiftCardId: q.wallet.giftCardId, label: 'Gift card', status: 'reserved', createdAt: now } });
  }
  if (q.wallet.credits > 0) {
    if ((await creditBalance(tx, order.accountId)) < q.wallet.credits) throw new AppError('QUOTE_CHANGED', { changes: [{ type: 'TOTAL_CHANGED', from: money(q.total), to: money(q.total) }] });
    await tx.creditLedgerEntry.create({ data: { id: newId(), accountId: order.accountId, amount: -q.wallet.credits, type: 'order_debit', orderId: order.id, note: 'Used on an order', createdAt: now } });
    await tx.paymentAllocation.create({ data: { id: newId(), orderId: order.id, source: 'credits', amount: q.wallet.credits, label: 'Credits', status: 'reserved', createdAt: now } });
  }
}

/** Creates the attempt; r = 0 and COD place the order at once (PAY-008). Returns the attempt. */
async function startAttempt(ctx: AppContext, tx: Tx, order: Order, q: Quote, ins: Instrument, actor: 'customer', sim: SimSettings) {
  const now = ctx.clock.now();
  const remainder = q.remainder;
  if (remainder === 0 || ins.method === 'cod') {
    const method = remainder === 0 ? 'none' : 'cod';
    const a = await tx.paymentAttempt.create({ data: { id: newId(), orderId: order.id, method, amount: remainder, outcome: 'success', decidedOutcome: 'success', createdAt: now, resolveAt: now, resolvedAt: now, instrumentLabel: method === 'cod' ? 'Cash on Delivery' : null } });
    if (method === 'cod') await tx.paymentAllocation.create({ data: { id: newId(), orderId: order.id, source: 'cod', amount: remainder, label: 'Cash on Delivery', status: 'cod_due', createdAt: now } });
    await placeOrder(ctx, tx, order, actor, sim);
    return a;
  }
  const weights = sim.paymentWeights;
  const reveal = sim.revealMs;
  return tx.paymentAttempt.create({
    data: {
      id: newId(), orderId: order.id, method: ins.method!, instrumentLabel: ins.label, testCardRef: ins.testCardRef, upiId: ins.upiId, amount: remainder,
      outcome: 'pending', decidedOutcome: decideOutcome(ctx, ins.forced, weights), forcedByTestValue: ins.forced !== null,
      saveCard: ins.saveCard ? (ins.saveCard as object) : undefined, bankOfferDiscount: q.bankOfferDiscount,
      createdAt: now, resolveAt: addMs(now, randomIntBetween(ctx.random, reveal.min, reveal.max)),
    },
  });
}

async function storedQuote(ctx: AppContext, accountId: string, quoteId: string, ref: { checkoutId?: string; orderId?: string }): Promise<Quote | null> {
  const row = await ctx.db.quote.findFirst({ where: { id: quoteId, accountId, ...(ref.checkoutId ? { checkoutId: ref.checkoutId } : { orderId: ref.orderId }) } });
  return row ? (row.payload as unknown as { quote: Quote }).quote : null;
}

// ── Pay (PAY-006…008, INT-002) ───────────────────────────────────────────────

export async function pay(ctx: AppContext, accountId: string, checkoutId: string, body: { quoteId: string; payment: PayInput }) {
  const s = await ownCheckout(ctx, accountId, checkoutId);
  const account = await getAccount(ctx, accountId);
  const pending = await pendingOrderSummary(ctx, accountId);
  if (pending) throw new AppError('PENDING_ORDER_EXISTS', { orderId: pending.orderId, pending });
  if (Array.isArray(s.pendingChanges) && s.pendingChanges.length) throw new AppError('QUOTE_CHANGED', { changes: s.pendingChanges as unknown as QuoteChange[] });
  const phone = account.phone ?? s.contactPhone;
  if (!phone) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'phone', code: 'required', message: 'Enter a valid 10-digit mobile number' }] });
  const address = s.addressId ? await ctx.db.address.findFirst({ where: { id: s.addressId, accountId } }) : null;
  if (!address) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'addressId', code: 'required', message: 'Select a delivery address' }] });
  const pin = await ctx.db.serviceablePincode.findUnique({ where: { pincode: address.pincode }, include: { zoneRef: true } });
  if (!pin) throw new AppError('ADDRESS_NOT_SERVICEABLE', { pincode: address.pincode });

  const ins = await resolveInstrument(ctx, accountId, body.payment);
  const lines = sessionLines(s);

  // (b) stock and activity, checked before anything is written.
  const data = await loadLineData(ctx, lines.map((l) => l.variantId));
  const inactive = lines.filter((l) => !data.get(l.variantId)?.active);
  if (inactive.length) throw new AppError('PRODUCT_INACTIVE', { lines: inactive.map((l) => l.variantId) });
  const short = lines.filter((l) => (data.get(l.variantId)?.available ?? 0) < l.quantity);
  if (short.length) {
    const d = data.get(short[0]!.variantId)!;
    throw new AppError('OUT_OF_STOCK', { item: `${d.name}, ${d.size}`, available: d.available, lines: short.map((l) => l.variantId) });
  }

  // (a) re-quote and compare with the quote the customer saw.
  const fresh = await priceLines(ctx, accountId, lines, s.couponCode, ins.selection);
  const shown = await storedQuote(ctx, accountId, body.quoteId, { checkoutId });
  const changes = shown ? diffQuotes(shown, fresh.quote, { giftCardReason: fresh.giftCardReason }) : [{ type: 'TOTAL_CHANGED' as const, from: money(fresh.quote.total), to: money(fresh.quote.total) }];
  if (changes.length) {
    // EC-07, EC-24: a coupon or gift card that no longer applies leaves the selection.
    const sel = { ...ins.selection, giftCardId: fresh.giftCardReason ? null : ins.selection.giftCardId };
    await ctx.db.checkoutSession.update({ where: { id: checkoutId }, data: { couponCode: fresh.quote.coupon.state === 'applied' ? s.couponCode : null, paymentSelection: sel as unknown as object } });
    throw new AppError('QUOTE_CHANGED', { changes });
  }
  methodChecks(fresh.quote, ins.method);

  const q = fresh.quote;
  const now = ctx.clock.now();
  const sim = await simSettings(ctx);
  const windowMs = sim.retryWindowMs;
  const addr = await addressView(ctx, address);
  const result = await writeTx(ctx, async (tx) => {
    const id = newId();
    const orderNumber = await newOrderNumber(ctx, tx, now);
    try {
      await tx.order.create({
        data: {
          id, orderNumber, accountId, status: 'AWAITING_PAYMENT', source: s.source, createdAt: now, retryEndsAt: addMs(now, windowMs),
          addressSnapshot: addr as unknown as object, contactPhone: phone, priceSnapshot: q as unknown as object,
          couponCode: q.coupon.state === 'applied' ? q.coupon.code : null, bankOfferApplied: q.bankOfferDiscount > 0,
          total: q.total, deliveryCharge: q.deliveryCharge, zone: pin.zone, expectedDeliveryDate: istDate(now),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new AppError('PENDING_ORDER_EXISTS');
      throw e;
    }
    // (d) holds, in variant order; a short variant fails the whole Pay (INV-001, INV-006).
    for (const l of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const held = await tx.$executeRawUnsafe('UPDATE "Inventory" SET "held" = "held" + ? WHERE "variantId" = ? AND "onHand" - "held" >= ?', l.quantity, l.variantId, l.quantity);
      if (held === 0) {
        const d = data.get(l.variantId)!;
        throw new AppError('OUT_OF_STOCK', { item: `${d.name}, ${d.size}`, lines: [l.variantId] });
      }
    }
    // (c) lines with their product snapshot and locked prices.
    for (const [i, ql] of q.lines.entries()) {
      const d = data.get(ql.variantId)!;
      await tx.orderLine.create({
        data: {
          id: newId(), orderId: id, variantId: ql.variantId, productId: d.productId, position: i,
          productSnapshot: { name: d.name, brand: d.brand, size: d.size, image: d.image, href: d.href },
          quantity: ql.qty, unitMrp: ql.unitMrp, unitSellingPrice: ql.unitPrice, couponShare: ql.couponShare, bankOfferShare: ql.bankOfferShare,
          lineNetPaid: ql.lineNet, taxRatePercent: ql.taxRatePercent, taxPortion: ql.taxPortion, returnable: d.returnable,
        },
      });
    }
    await tx.orderStatusEvent.create({ data: { id: newId(), orderId: id, fromStatus: null, toStatus: 'AWAITING_PAYMENT', at: now, actor: 'customer' } });
    const order = await tx.order.findUniqueOrThrow({ where: { id } });
    await reserveWallet(ctx, tx, order, q);
    const attempt = await startAttempt(ctx, tx, order, q, ins, 'customer', sim);
    await tx.checkoutSession.delete({ where: { id: checkoutId } });
    return { orderId: id, orderNumber, attemptId: attempt.id };
  });
  return attemptView(ctx, accountId, result.attemptId);
}

// ── Retry (PAY-011, PAY-015) ─────────────────────────────────────────────────

async function payableOrder(ctx: AppContext, accountId: string, orderId: string) {
  const order = await ctx.db.order.findFirst({ where: { id: orderId, accountId } });
  if (!order) throw new AppError('NOT_FOUND');
  if (order.status !== 'AWAITING_PAYMENT' || order.retryEndsAt <= ctx.clock.now()) throw new AppError('ORDER_NOT_PAYABLE', { orderId });
  return order;
}

/** A quote on the order's locked lines and coupon; the bank offer and wallet follow the new selection (PAY-011). */
async function orderQuote(ctx: AppContext, order: Order, sel: PaymentSelection) {
  const lines = await ctx.db.orderLine.findMany({ where: { orderId: order.id }, orderBy: { position: 'asc' } });
  const data = await loadLineData(ctx, lines.map((l) => l.variantId));
  const reserved = await ctx.db.paymentAllocation.findMany({ where: { orderId: order.id, status: 'reserved' } });
  const reservedCredits = reserved.filter((a) => a.source === 'credits').reduce((n, a) => n + a.amount, 0);
  const now = ctx.clock.now();
  let giftCard: PaymentSelectionInput['giftCard'] = null;
  let giftCardReason: 'expired' | 'no_balance' | 'inactive' | undefined;
  if (sel.giftCardId) {
    const g = await ctx.db.accountGiftCard.findFirst({ where: { id: sel.giftCardId, accountId: order.accountId } });
    if (g) {
      // Amounts already reserved on this order count as available: they're returned before re-reserving.
      const back = reserved.filter((a) => a.accountGiftCardId === g.id).reduce((n, a) => n + a.amount, 0);
      const status = giftCardStatus({ ...g, balance: g.balance + back }, now);
      giftCard = { id: g.id, balance: g.balance + back, usable: status === 'active' };
      if (status !== 'active') giftCardReason = status === 'expired' ? 'expired' : 'no_balance';
    } else giftCardReason = 'inactive';
  }
  let card: PaymentSelectionInput['card'] = null;
  if (sel.method === 'card' && sel.card) {
    if ('savedCardId' in sel.card) {
      const c = await ctx.db.savedCard.findFirst({ where: { id: sel.card.savedCardId, accountId: order.accountId } });
      if (c) card = { issuingBank: c.issuingBank, cardType: c.cardType as CardType };
    } else card = sel.card;
  }
  const coupon = order.couponCode ? await findCoupon(ctx, order.couponCode) : null;
  const quote = computeQuote({
    lines: lines.map((l) => ({ ...quoteLineInput(data.get(l.variantId)!, l.quantity), unitPrice: l.unitSellingPrice, unitMrp: l.unitMrp, taxRatePercent: l.taxRatePercent })),
    coupon: coupon ? { definition: { ...coupon, active: true, validFrom: new Date(0), validTo: new Date(8.64e15) }, customerUses: null } : null,
    bankOffer: await activeBankOffer(ctx),
    delivery: await deliveryConfig(ctx),
    payment: { giftCard, useCredits: sel.useCredits, creditBalance: sel.useCredits ? (await creditBalance(ctx.db, order.accountId)) + reservedCredits : 0, method: sel.method, card },
    now,
  });
  return { quote, lines, giftCardReason };
}

/** Payment step for an Awaiting Payment order: locked items, a fresh quote for the selection, and the retry time left. */
export async function orderPaymentQuote(ctx: AppContext, accountId: string, orderId: string, s: QuoteSelection) {
  const order = await payableOrder(ctx, accountId, orderId);
  const selection = await selectionFromQuoteInput(ctx, accountId, s);
  const { quote, lines } = await orderQuote(ctx, order, selection);
  const quoteId = await storeQuote(ctx, accountId, { orderId }, quote, { selection });
  const now = ctx.clock.now();
  return {
    order: { id: order.id, orderNumber: order.orderNumber, retryEndsAt: order.retryEndsAt.toISOString(), minutesLeft: Math.max(0, Math.ceil((order.retryEndsAt.getTime() - now.getTime()) / 60_000)) },
    items: lines.map((l) => ({ ...(l.productSnapshot as object), quantity: l.quantity, lineValue: money(l.unitSellingPrice * l.quantity) })),
    units: lines.reduce((n, l) => n + l.quantity, 0),
    quote: quoteView(quote),
    quoteId,
    selection,
  };
}

export async function retryPayment(ctx: AppContext, accountId: string, orderId: string, body: { quoteId: string; payment: PayInput }) {
  const order = await payableOrder(ctx, accountId, orderId);
  if (await ctx.db.paymentAttempt.findFirst({ where: { orderId, outcome: 'pending' }, select: { id: true } })) throw new AppError('PAYMENT_IN_PROGRESS');
  const ins = await resolveInstrument(ctx, accountId, body.payment);
  const fresh = await orderQuote(ctx, order, ins.selection);
  const shown = await storedQuote(ctx, accountId, body.quoteId, { orderId });
  const changes = shown ? diffQuotes(shown, fresh.quote, { giftCardReason: fresh.giftCardReason }) : [{ type: 'TOTAL_CHANGED' as const, from: money(fresh.quote.total), to: money(fresh.quote.total) }];
  if (changes.length) throw new AppError('QUOTE_CHANGED', { changes });
  methodChecks(fresh.quote, ins.method);
  const q = fresh.quote;
  const sim = await simSettings(ctx);
  const attemptId = await withOrder(ctx, orderId, async (tx, o) => {
    if (o.status !== 'AWAITING_PAYMENT' || o.retryEndsAt <= ctx.clock.now()) throw new AppError('ORDER_NOT_PAYABLE', { orderId });
    if (await tx.paymentAttempt.findFirst({ where: { orderId, outcome: 'pending' }, select: { id: true } })) throw new AppError('PAYMENT_IN_PROGRESS');
    await reverseReservations(ctx, tx, o);
    // The bank offer follows the new card: lines and the snapshot take the new shares.
    for (const [i, ql] of q.lines.entries()) {
      const l = fresh.lines[i]!;
      await tx.orderLine.update({ where: { id: l.id }, data: { bankOfferShare: ql.bankOfferShare, lineNetPaid: ql.lineNet, taxPortion: ql.taxPortion } });
    }
    await tx.order.update({ where: { id: orderId }, data: { priceSnapshot: q as unknown as object, total: q.total, bankOfferApplied: q.bankOfferDiscount > 0 } });
    await reserveWallet(ctx, tx, o, q);
    const a = await startAttempt(ctx, tx, { ...o, total: q.total }, q, ins, 'customer', sim);
    return a.id;
  });
  return attemptView(ctx, accountId, attemptId);
}

// ── Attempt status (PAY-008…010) ─────────────────────────────────────────────

export async function attemptView(ctx: AppContext, accountId: string, attemptId: string) {
  const a = await ctx.db.paymentAttempt.findUnique({ where: { id: attemptId }, include: { order: true } });
  if (!a || a.order.accountId !== accountId) throw new AppError('NOT_FOUND');
  const o = a.order;
  const now = ctx.clock.now();
  return {
    id: a.id,
    outcome: a.outcome,
    message: OUTCOME_MESSAGES[a.outcome as Outcome | 'pending'],
    method: a.method,
    amount: money(a.amount),
    order: {
      id: o.id, orderNumber: o.orderNumber, status: o.status,
      retryEndsAt: o.retryEndsAt.toISOString(), minutesLeft: Math.max(0, Math.ceil((o.retryEndsAt.getTime() - now.getTime()) / 60_000)),
      canRetry: o.status === 'AWAITING_PAYMENT' && o.retryEndsAt > now && a.outcome !== 'pending',
    },
  };
}

// ── Scheduler jobs (plan §7.5; API-007) ──────────────────────────────────────

/** Saves the card once the attempt is final, even after a failure (PAY-014, SD-47). Masked fields only. */
async function saveCardAfterAttempt(ctx: AppContext, accountId: string, card: Record<string, unknown>) {
  const c = card as { nameOnCard: string; last4: string; network: string; issuingBank: string; cardType: string; expiryMonth: number; expiryYear: number; testCardRef: string };
  const existing = await ctx.db.savedCard.findMany({ where: { accountId } });
  if (existing.some((e) => e.testCardRef === c.testCardRef && e.expiryMonth === c.expiryMonth && e.expiryYear === c.expiryYear)) return;
  if (existing.length >= (await ctx.settings.get<number>('cards.max', 5))) return;
  await ctx.db.savedCard.create({ data: { id: newId(), accountId, ...c, isDefault: existing.length === 0, createdAt: ctx.clock.now() } });
}

/** 1-second job: reveals each due attempt's outcome (PAY-008…010). Success places the order (PAY-009). */
export async function resolvePaymentAttempts(ctx: AppContext): Promise<number> {
  const due = await ctx.db.paymentAttempt.findMany({ where: { outcome: 'pending', resolveAt: { lte: ctx.clock.now() } }, select: { id: true, orderId: true } });
  const sim = due.length ? await simSettings(ctx) : null;
  for (const d of due) {
    const done = await withOrder(ctx, d.orderId, async (tx, order) => {
      const a = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: d.id } });
      if (a.outcome !== 'pending') return null; // already applied (API-007)
      const now = ctx.clock.now();
      await tx.paymentAttempt.update({ where: { id: a.id }, data: { outcome: a.decidedOutcome, resolvedAt: now } });
      if (a.decidedOutcome === 'success' && order.status === 'AWAITING_PAYMENT') {
        await tx.paymentAllocation.create({ data: { id: newId(), orderId: order.id, source: a.method, amount: a.amount, label: a.instrumentLabel, status: 'captured', createdAt: now } });
        await placeOrder(ctx, tx, order, 'system', sim!);
      }
      return { accountId: order.accountId, saveCard: a.saveCard as Record<string, unknown> | null };
    }).catch(() => null);
    if (done?.saveCard) await saveCardAfterAttempt(ctx, done.accountId, done.saveCard);
  }
  return due.length;
}

/**
 * 5-second job: an Awaiting Payment order whose retry window has ended, with no attempt still
 * processing, becomes Failed; holds are released and reservations reversed (PAY-012, EC-06).
 */
export async function expirePayments(ctx: AppContext): Promise<number> {
  const now = ctx.clock.now();
  const due = await ctx.db.order.findMany({ where: { status: 'AWAITING_PAYMENT', retryEndsAt: { lte: now } }, select: { id: true } });
  let n = 0;
  for (const d of due) {
    await withOrder(ctx, d.id, async (tx, order) => {
      if (order.status !== 'AWAITING_PAYMENT') return;
      if (await tx.paymentAttempt.findFirst({ where: { orderId: order.id, outcome: 'pending' }, select: { id: true } })) return;
      await releaseOrder(ctx, tx, order, 'PAYMENT_WINDOW_EXPIRED', 'scheduler');
      n += 1;
    });
  }
  return n;
}

/** CNL-002: an Awaiting Payment order is cancelled as a whole; nothing was captured, so there is no refund. */
export async function cancelPendingOrder(ctx: AppContext, accountId: string, orderId: string) {
  const own = await ctx.db.order.findFirst({ where: { id: orderId, accountId }, select: { id: true } });
  if (!own) throw new AppError('NOT_FOUND');
  await withOrder(ctx, orderId, async (tx, order) => {
    if (order.status !== 'AWAITING_PAYMENT') throw new AppError('ACTION_NOT_ALLOWED');
    if (await tx.paymentAttempt.findFirst({ where: { orderId, outcome: 'pending' }, select: { id: true } })) throw new AppError('PAYMENT_IN_PROGRESS');
    await releaseOrder(ctx, tx, order, 'CUSTOMER_CANCELLED_PENDING', 'customer');
  });
}
