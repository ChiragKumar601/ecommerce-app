import type { QuoteChange } from '@app/shared';
import type { AppContext } from '../api/context.js';
import { AppError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { money, type Paise } from '../domain/money.js';
import { computeQuote } from '../domain/pricing/quote.js';
import { diffQuotes } from '../domain/pricing/quoteDiff.js';
import type { CardType, PaymentSelectionInput, Quote } from '../domain/pricing/types.js';
import { addMs, MS } from '../domain/time.js';
import type { CheckoutSession } from '../generated/prisma/client.js';
import { creditBalance, giftCardStatus } from './account.js';
import { addressView, getOwnAddress } from './address.js';
import { getAccount } from './auth.js';
import { applyOp, getBag, priceBag } from './bag.js';
import { activeBankOffer, couponUses, deliveryConfig, findCoupon, loadLineData, quoteLineInput, quoteView, type LineData } from './pricing.js';

// Checkout (spec §6.14; plan S14). The session lives on the server so it survives session expiry (CHK-007).

export interface CheckoutLine {
  variantId: string;
  quantity: number;
}

/** What the customer chose on the payment step (S15). */
export interface PaymentSelection {
  giftCardId: string | null;
  useCredits: boolean;
  method: 'card' | 'upi' | 'cod' | null;
  /** A saved card, or a new card's test-card bank and type (known once the number is entered). */
  card: { savedCardId: string } | { issuingBank: string; cardType: CardType } | null;
}
export const NO_SELECTION: PaymentSelection = { giftCardId: null, useCredits: false, method: null, card: null };

const CHECKOUT_TTL_MS = MS.day;
export type Step = 'address' | 'summary' | 'payment';

// ── Pending order (CHK-010) ──────────────────────────────────────────────────

export interface PendingOrderSummary {
  orderId: string;
  orderNumber: string;
  amount: string;
  retryEndsAt: string;
  minutesLeft: number;
}

/** The customer's Awaiting Payment order still inside its retry window, if any (R-09). */
export async function pendingOrderSummary(ctx: AppContext, accountId: string): Promise<PendingOrderSummary | null> {
  const o = await ctx.db.order.findFirst({ where: { accountId, status: 'AWAITING_PAYMENT' } });
  if (!o) return null;
  const now = ctx.clock.now();
  return {
    orderId: o.id, orderNumber: o.orderNumber, amount: money(o.total).display, retryEndsAt: o.retryEndsAt.toISOString(),
    minutesLeft: Math.max(0, Math.ceil((o.retryEndsAt.getTime() - now.getTime()) / 60_000)),
  };
}

// ── Pricing ──────────────────────────────────────────────────────────────────

interface Priced {
  quote: Quote;
  data: Map<string, LineData>;
  /** Wallet facts used, so Pay can tell why a gift card became unusable (EC-07). */
  giftCardReason?: 'expired' | 'no_balance' | 'inactive';
}

export async function resolvePayment(ctx: AppContext, accountId: string, sel: PaymentSelection | null): Promise<{ input: PaymentSelectionInput | null; giftCardReason?: 'expired' | 'no_balance' | 'inactive' }> {
  if (!sel) return { input: null };
  const now = ctx.clock.now();
  let giftCard: PaymentSelectionInput['giftCard'] = null;
  let giftCardReason: 'expired' | 'no_balance' | 'inactive' | undefined;
  if (sel.giftCardId) {
    const g = await ctx.db.accountGiftCard.findFirst({ where: { id: sel.giftCardId, accountId } });
    if (g) {
      const status = giftCardStatus(g, now);
      giftCard = { id: g.id, balance: g.balance, usable: status === 'active' };
      if (status !== 'active') giftCardReason = status === 'expired' ? 'expired' : 'no_balance';
    } else {
      giftCardReason = 'inactive';
    }
  }
  let card: PaymentSelectionInput['card'] = null;
  if (sel.method === 'card' && sel.card) {
    if ('savedCardId' in sel.card) {
      const c = await ctx.db.savedCard.findFirst({ where: { id: sel.card.savedCardId, accountId } });
      if (c) card = { issuingBank: c.issuingBank, cardType: c.cardType as CardType };
    } else {
      card = { issuingBank: sel.card.issuingBank, cardType: sel.card.cardType };
    }
  }
  return {
    input: { giftCard, useCredits: sel.useCredits, creditBalance: sel.useCredits ? await creditBalance(ctx.db, accountId) : 0, method: sel.method, card },
    giftCardReason,
  };
}

/** Quotes a set of lines for a customer (INT-001): coupon with their usage count, bank offer, wallet and method. */
export async function priceLines(ctx: AppContext, accountId: string, lines: CheckoutLine[], couponCode: string | null, sel: PaymentSelection | null): Promise<Priced> {
  const [data, delivery, bankOffer, payment] = await Promise.all([
    loadLineData(ctx, lines.map((l) => l.variantId)),
    deliveryConfig(ctx),
    activeBankOffer(ctx),
    resolvePayment(ctx, accountId, sel),
  ]);
  const inputs = lines
    .map((l) => ({ l, d: data.get(l.variantId) }))
    .filter((x): x is { l: CheckoutLine; d: LineData } => !!x.d && x.d.active && x.d.available > 0)
    .map(({ l, d }) => quoteLineInput(d, Math.min(l.quantity, d.available)));
  const coupon = couponCode ? await findCoupon(ctx, couponCode) : null;
  const uses = coupon ? await couponUses(ctx, accountId, coupon.code) : null;
  const quote = computeQuote({
    lines: inputs, coupon: coupon ? { definition: coupon, customerUses: uses } : null, bankOffer, delivery, payment: payment.input, now: ctx.clock.now(),
  });
  return { quote, data, giftCardReason: payment.giftCardReason };
}

/** Stores a quote shown to the customer and returns its id (API-006). */
export async function storeQuote(ctx: AppContext, accountId: string, ref: { checkoutId?: string; orderId?: string }, quote: Quote, extra: Record<string, unknown> = {}): Promise<string> {
  const id = newId();
  await ctx.db.quote.create({ data: { id, accountId, checkoutId: ref.checkoutId ?? null, orderId: ref.orderId ?? null, payload: { quote, ...extra } as object, createdAt: ctx.clock.now() } });
  return id;
}

// ── Start (CHK-001, CHK-002, CHK-006, CHK-010, BAG-011) ──────────────────────

export type StartInput = { source: 'bag'; addressId?: string } | { source: 'buy_now'; variantId: string; quantity?: number; addressId?: string };

export async function startCheckout(ctx: AppContext, accountId: string, input: StartInput) {
  const pending = await pendingOrderSummary(ctx, accountId);
  if (pending) throw new AppError('PENDING_ORDER_EXISTS', { orderId: pending.orderId, pending });

  let lines: CheckoutLine[];
  let couponCode: string | null = null;
  let changes: QuoteChange[] = [];

  if (input.source === 'bag') {
    const bagRows = await ctx.db.bagLine.findMany({ where: { accountId } });
    const bag = await ctx.db.bag.findUnique({ where: { accountId } });
    const view = await priceBag(ctx, { lines: bagRows.map((r) => ({ variantId: r.variantId, quantity: r.quantity, addedAt: r.addedAt.getTime(), lastSeenUnitPrice: r.lastSeenUnitPrice })), couponCode: bag?.couponCode ?? null, accountId });
    if (view.lines.length === 0) throw new AppError('CHECKOUT_BLOCKED', { reason: 'empty' });
    // BAG-005: flagged lines must be fixed in the bag first.
    if (view.blocked) throw new AppError('CHECKOUT_BLOCKED', { lines: view.lines.filter((l) => l.flag).map((l) => l.variantId) });
    lines = view.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
    couponCode = view.couponCode;

    // CHK-002: compare what the customer last saw (prices and coupon) with now.
    const seen = new Map(bagRows.map((r) => [r.variantId, r.lastSeenUnitPrice]));
    // Priced with the bag's coupon, so a coupon that no longer applies is reported with its reason.
    const fresh = await priceLines(ctx, accountId, lines, bag?.couponCode ?? null, null);
    const previous = await quoteAtSeenPrices(ctx, lines, fresh.data, seen, bag?.couponCode ?? null);
    changes = diffQuotes(previous, fresh.quote);
    // The bag now remembers the new prices, and drops a coupon that no longer applies.
    await getBag(ctx, accountId);
  } else {
    const d = (await loadLineData(ctx, [input.variantId])).get(input.variantId);
    if (!d) throw new AppError('NOT_FOUND');
    if (!d.active) throw new AppError('PRODUCT_INACTIVE');
    const qty = input.quantity ?? 1;
    if (d.available === 0) throw new AppError('OUT_OF_STOCK', { item: `${d.name}, ${d.size}` });
    if (d.available < qty) throw new AppError('OUT_OF_STOCK', { item: `${d.name}, ${d.size}`, available: d.available });
    lines = [{ variantId: d.variantId, quantity: qty }];
  }

  const addressId = await defaultAddressId(ctx, accountId, input.addressId);
  const now = ctx.clock.now();
  const id = newId();
  await ctx.db.checkoutSession.create({
    data: {
      id, accountId, source: input.source, lines: lines as unknown as object, couponCode, addressId,
      pendingChanges: changes.length ? (changes as unknown as object) : undefined, createdAt: now, expiresAt: addMs(now, CHECKOUT_TTL_MS),
    },
  });
  return getCheckout(ctx, accountId, id);
}

/** The quote the customer saw in the bag: last-seen unit prices and the coupon as it was applied. */
async function quoteAtSeenPrices(ctx: AppContext, lines: CheckoutLine[], data: Map<string, LineData>, seen: Map<string, Paise>, couponCode: string | null) {
  const coupon = couponCode ? await findCoupon(ctx, couponCode) : null;
  return computeQuote({
    lines: lines.map((l) => {
      const d = data.get(l.variantId)!;
      return { ...quoteLineInput(d, l.quantity), unitPrice: seen.get(l.variantId) ?? d.unitPrice };
    }),
    // As shown in the bag: valid then, so customer usage isn't re-counted here.
    coupon: coupon ? { definition: { ...coupon, active: true, validFrom: new Date(0), validTo: new Date(8.64e15) }, customerUses: null } : null,
    bankOffer: await activeBankOffer(ctx),
    delivery: await deliveryConfig(ctx),
    now: ctx.clock.now(),
  });
}

async function defaultAddressId(ctx: AppContext, accountId: string, preferred?: string): Promise<string | null> {
  const rows = await ctx.db.address.findMany({ where: { accountId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  const pins = new Set((await ctx.db.serviceablePincode.findMany({ where: { pincode: { in: rows.map((r) => r.pincode) } }, select: { pincode: true } })).map((p) => p.pincode));
  const usable = rows.filter((r) => pins.has(r.pincode));
  return usable.find((r) => r.id === preferred)?.id ?? usable.find((r) => r.isDefault)?.id ?? usable[0]?.id ?? null;
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function ownCheckout(ctx: AppContext, accountId: string, id: string): Promise<CheckoutSession> {
  const s = await ctx.db.checkoutSession.findFirst({ where: { id, accountId } });
  if (!s || s.expiresAt <= ctx.clock.now()) throw new AppError('NOT_FOUND'); // AUTHZ-002
  return s;
}

export const sessionLines = (s: CheckoutSession) => s.lines as unknown as CheckoutLine[];
export const sessionSelection = (s: CheckoutSession) => (s.paymentSelection as unknown as PaymentSelection | null) ?? null;

/** Checkout view: items, address, phone, coupon, the quote and its quoteId (CHK-001…006, API-006). */
export async function getCheckout(ctx: AppContext, accountId: string, id: string) {
  const s = await ownCheckout(ctx, accountId, id);
  const account = await getAccount(ctx, accountId);
  const lines = sessionLines(s);
  const sel = sessionSelection(s);
  const priced = await priceLines(ctx, accountId, lines, s.couponCode, sel);
  const quoteId = await storeQuote(ctx, accountId, { checkoutId: s.id }, priced.quote, { lines, couponCode: s.couponCode, selection: sel });
  const address = s.addressId ? await ctx.db.address.findFirst({ where: { id: s.addressId, accountId } }) : null;
  const max = await ctx.settings.get<{ maxQtyPerLine: number }>('bag.limits', { maxQtyPerLine: 10 });
  const qLines = new Map(priced.quote.lines.map((l) => [l.variantId, l]));
  const now = ctx.clock.now();
  const coupons = await ctx.db.coupon.findMany({ where: { active: true, validFrom: { lte: now }, validTo: { gte: now } }, orderBy: { code: 'asc' } });
  return {
    id: s.id,
    source: s.source,
    step: s.step,
    changes: (s.pendingChanges as unknown as QuoteChange[] | null) ?? [],
    phone: { value: account.phone ?? s.contactPhone, needed: !account.phone && !s.contactPhone, forThisOrderOnly: !account.phone && !!s.contactPhone },
    address: address ? await addressView(ctx, address) : null,
    items: lines.map((l) => {
      const d = priced.data.get(l.variantId);
      const q = qLines.get(l.variantId);
      return {
        variantId: l.variantId, productId: d?.productId ?? '', href: d?.href ?? '', brand: d?.brand ?? '', name: d?.name ?? '', size: d?.size ?? '', image: d?.image ?? null,
        quantity: l.quantity, available: d?.available ?? 0, maxQuantity: Math.max(1, Math.min(max.maxQtyPerLine, d?.available ?? 1)),
        unitPrice: money(d?.unitPrice ?? 0), unitMrp: money(d?.unitMrp ?? 0), lineValue: money(q?.lineValue ?? 0),
        problem: !d || !d.active ? 'No longer available' : d.available < l.quantity ? (d.available === 0 ? 'Out of stock' : `Only ${d.available} left`) : null,
      };
    }),
    couponCode: s.couponCode,
    coupons: coupons.map((c) => ({ code: c.code, description: c.description, minEligibleValue: money(c.minEligibleValue) })),
    quote: quoteView(priced.quote),
    quoteId,
    units: lines.reduce((n, l) => n + l.quantity, 0),
    selection: sel ?? NO_SELECTION,
  };
}
export type CheckoutView = Awaited<ReturnType<typeof getCheckout>>;

// ── Changes ──────────────────────────────────────────────────────────────────

/** "Continue with these changes" (CHK-002). */
export async function acknowledgeChanges(ctx: AppContext, accountId: string, id: string) {
  await ownCheckout(ctx, accountId, id);
  await ctx.db.$executeRawUnsafe('UPDATE "CheckoutSession" SET "pendingChanges" = NULL WHERE "id" = ?', id);
  return getCheckout(ctx, accountId, id);
}

/** CHK-003: a free number is saved to the account; one linked to another account is used for this order only. */
export async function setCheckoutPhone(ctx: AppContext, accountId: string, id: string, phone: string) {
  await ownCheckout(ctx, accountId, id);
  const taken = await ctx.db.account.findFirst({ where: { phone, NOT: { id: accountId } }, select: { id: true } });
  let message: string | null = null;
  if (taken) {
    await ctx.db.checkoutSession.update({ where: { id }, data: { contactPhone: phone } });
    message = "This number can't be added to your account. We'll use it as the contact number for this order only.";
  } else {
    try {
      await ctx.db.account.update({ where: { id: accountId }, data: { phone } });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      await ctx.db.checkoutSession.update({ where: { id }, data: { contactPhone: phone } });
      message = "This number can't be added to your account. We'll use it as the contact number for this order only.";
    }
  }
  return { ...(await getCheckout(ctx, accountId, id)), savedToAccount: !message, message };
}

/** CHK-004: only a serviceable address of the customer's own can be selected. */
export async function setCheckoutAddress(ctx: AppContext, accountId: string, id: string, addressId: string) {
  await ownCheckout(ctx, accountId, id);
  const a = await getOwnAddress(ctx, accountId, addressId);
  const pin = await ctx.db.serviceablePincode.findUnique({ where: { pincode: a.pincode } });
  if (!pin) throw new AppError('ADDRESS_NOT_SERVICEABLE', { pincode: a.pincode });
  await ctx.db.checkoutSession.update({ where: { id }, data: { addressId } });
  return getCheckout(ctx, accountId, id);
}

/** CHK-005 / CHK-006: apply or remove a coupon at checkout. A bag checkout keeps the bag's coupon in step. */
export async function setCheckoutCoupon(ctx: AppContext, accountId: string, id: string, code: string | null) {
  const s = await ownCheckout(ctx, accountId, id);
  if (code) {
    const lines = sessionLines(s).map((l) => ({ ...l, addedAt: 0 }));
    // Same rules and messages as the bag (BAG-006).
    await applyOp(ctx, { lines, couponCode: null }, { type: 'applyCoupon', code }, accountId);
  }
  const normalised = code ? code.toUpperCase() : null;
  await ctx.db.checkoutSession.update({ where: { id }, data: { couponCode: normalised } });
  if (s.source === 'bag') await ctx.db.bag.updateMany({ where: { accountId }, data: { couponCode: normalised } });
  return getCheckout(ctx, accountId, id);
}

/** CHK-006: the Buy Now quantity can change (1–10, within stock). */
export async function setCheckoutQuantity(ctx: AppContext, accountId: string, id: string, quantity: number) {
  const s = await ownCheckout(ctx, accountId, id);
  if (s.source !== 'buy_now') throw new AppError('ACTION_NOT_ALLOWED');
  const [line] = sessionLines(s);
  const d = (await loadLineData(ctx, [line!.variantId])).get(line!.variantId);
  if (!d || !d.active) throw new AppError('PRODUCT_INACTIVE');
  if (quantity > d.available) throw new AppError('OUT_OF_STOCK', { item: `${d.name}, ${d.size}`, available: d.available });
  await ctx.db.checkoutSession.update({ where: { id }, data: { lines: [{ variantId: line!.variantId, quantity }] as unknown as object } });
  return getCheckout(ctx, accountId, id);
}

/** The current step is kept on the server so it survives re-login (CHK-007). */
export async function setCheckoutStep(ctx: AppContext, accountId: string, id: string, step: Step) {
  const s = await ownCheckout(ctx, accountId, id);
  if (step !== 'address') {
    const account = await getAccount(ctx, accountId);
    if (!account.phone && !s.contactPhone) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'phone', code: 'required', message: 'Enter a valid 10-digit mobile number' }] });
    if (!s.addressId) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'addressId', code: 'required', message: 'Select a delivery address' }] });
  }
  await ctx.db.checkoutSession.update({ where: { id }, data: { step } });
  return getCheckout(ctx, accountId, id);
}
