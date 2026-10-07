import type { AppContext } from '../api/context.js';
import { discountPercent } from '../domain/catalogue/discount.js';
import { AppError } from '../domain/errors.js';
import { formatINR, money, type Paise } from '../domain/money.js';
import { computeQuote } from '../domain/pricing/quote.js';
import type { CouponDefinition } from '../domain/pricing/types.js';
import { activeBankOffer, couponReason, couponUses, deliveryConfig, findCoupon, loadLineData, quoteLineInput, quoteView, type LineData } from './pricing.js';

// Bag (spec §6.12; plan S11.1–S11.3, S11.5). Guest bags live on the device and are priced by
// `guestQuote` without being stored; customer bags are stored. Both use the same line rules.

export interface StoredLine {
  variantId: string;
  quantity: number;
  addedAt: number;
  lastSeenUnitPrice?: Paise;
}

interface Limits {
  maxQtyPerLine: number;
  maxLines: number;
}
const limits = (ctx: AppContext) => ctx.settings.get<Limits>('bag.limits', { maxQtyPerLine: 10, maxLines: 50 });

export type LineFlag = 'inactive' | 'out_of_stock' | 'over_stock';

/** Prices a bag: line flags (BAG-005), price changes (BAG-004), coupon auto-removal (BAG-007), quote (INT-001). */
export async function priceBag(ctx: AppContext, input: { lines: StoredLine[]; couponCode: string | null; accountId: string | null }) {
  const [data, delivery, bankOffer, lim] = await Promise.all([
    loadLineData(ctx, input.lines.map((l) => l.variantId)),
    deliveryConfig(ctx),
    activeBankOffer(ctx),
    limits(ctx),
  ]);
  const now = ctx.clock.now();
  const lines = input.lines.filter((l) => data.has(l.variantId)).sort((a, b) => b.addedAt - a.addedAt);

  const view = lines.map((l) => {
    const d = data.get(l.variantId)!;
    const flag: LineFlag | null = !d.active ? 'inactive' : d.available === 0 ? 'out_of_stock' : l.quantity > d.available ? 'over_stock' : null;
    const flagMessage = flag === 'inactive' ? 'No longer available' : flag === 'out_of_stock' ? 'Out of stock' : flag === 'over_stock' ? `Only ${d.available} left` : null;
    const priceChange = l.lastSeenUnitPrice !== undefined && l.lastSeenUnitPrice !== d.unitPrice
      ? { from: money(l.lastSeenUnitPrice), to: money(d.unitPrice), message: `Price changed from ${formatINR(l.lastSeenUnitPrice)} to ${formatINR(d.unitPrice)}` }
      : null;
    return {
      variantId: d.variantId, productId: d.productId, href: d.href, brand: d.brand, name: d.name, size: d.size, image: d.image,
      unitPrice: money(d.unitPrice), unitMrp: money(d.unitMrp), discountPercent: discountPercent(d.unitMrp, d.unitPrice),
      quantity: l.quantity, lineValue: money(d.unitPrice * l.quantity), lineMrp: money(d.unitMrp * l.quantity),
      maxQuantity: Math.max(1, Math.min(lim.maxQtyPerLine, d.available)), available: d.available,
      flag, flagMessage, priceChange, returnable: d.returnable,
    };
  });

  // Flagged-out lines don't count towards the amounts; over-stock lines count at what's available.
  const priced = lines
    .map((l) => ({ l, d: data.get(l.variantId)! }))
    .filter(({ d }) => d.active && d.available > 0)
    .map(({ l, d }) => quoteLineInput(d, Math.min(l.quantity, d.available)));

  let coupon: CouponDefinition | null = null;
  let couponRemoved: { code: string; message: string } | null = null;
  if (input.couponCode) {
    coupon = await findCoupon(ctx, input.couponCode);
    if (!coupon) couponRemoved = { code: input.couponCode, message: `Coupon ${input.couponCode} removed: This coupon code isn't valid.` };
  }
  const uses = coupon && input.accountId ? await couponUses(ctx, input.accountId, coupon.code) : null;
  const q = computeQuote({ lines: priced, coupon: coupon ? { definition: coupon, customerUses: uses } : null, bankOffer, delivery, now });
  if (q.coupon.state === 'rejected') {
    couponRemoved = { code: q.coupon.code, message: `Coupon ${q.coupon.code} removed: ${couponReason(q.coupon).message}` };
    coupon = null;
  }

  // "View available coupons" with each coupon's status for this bag (BAG-006).
  const all = await ctx.db.coupon.findMany({ where: { active: true, validFrom: { lte: now }, validTo: { gte: now } }, orderBy: { code: 'asc' } });
  const coupons = await Promise.all(all.map(async (c) => {
    const def = (await findCoupon(ctx, c.code))!;
    const u = input.accountId ? await couponUses(ctx, input.accountId, c.code) : null;
    const r = computeQuote({ lines: priced, coupon: { definition: def, customerUses: u }, bankOffer: null, delivery, now }).coupon;
    return {
      code: c.code, description: c.description, minEligibleValue: money(c.minEligibleValue),
      eligible: r.state === 'applied', saving: r.state === 'applied' ? money(r.discount) : null,
      reason: r.state === 'rejected' ? couponReason(r).message : null,
    };
  }));

  return {
    lines: view,
    quote: quoteView(q, bankOffer?.bankName.replace(/ Bank$/, '') ?? 'HDFC'),
    couponCode: coupon?.code ?? null,
    couponRemoved,
    coupons,
    units: lines.reduce((s, l) => s + l.quantity, 0),
    blocked: view.some((l) => l.flag !== null),
  };
}
export type BagView = Awaited<ReturnType<typeof priceBag>>;

// ── Line operations, shared by guest and customer bags ───────────────────────

export type BagOp =
  | { type: 'add'; variantId: string; quantity?: number }
  | { type: 'set'; variantId: string; quantity: number }
  | { type: 'remove'; variantId: string }
  | { type: 'applyCoupon'; code: string }
  | { type: 'removeCoupon' };

interface BagState {
  lines: StoredLine[];
  couponCode: string | null;
}

/** Applies one operation in memory; returns the new state and a message for the customer, if any. */
export async function applyOp(ctx: AppContext, state: BagState, op: BagOp, accountId: string | null): Promise<BagState & { message: string | null }> {
  const lim = await limits(ctx);
  const lines = state.lines.map((l) => ({ ...l }));
  const now = ctx.clock.now().getTime();
  const lineData = async (variantId: string): Promise<LineData> => {
    const d = (await loadLineData(ctx, [variantId])).get(variantId);
    if (!d) throw new AppError('NOT_FOUND');
    return d;
  };

  switch (op.type) {
    case 'add': {
      // PDP-008: +1 (or the given quantity), capped at min(10, available).
      const d = await lineData(op.variantId);
      if (!d.active) throw new AppError('PRODUCT_INACTIVE');
      if (d.available === 0) throw new AppError('OUT_OF_STOCK', { item: `${d.name}, ${d.size}` });
      const existing = lines.find((l) => l.variantId === op.variantId);
      if (!existing && lines.length >= lim.maxLines) throw new AppError('LIMIT_REACHED', { context: 'bag' });
      const cap = Math.min(lim.maxQtyPerLine, d.available);
      const wanted = (existing?.quantity ?? 0) + (op.quantity ?? 1);
      const qty = Math.min(wanted, cap);
      const message = wanted > cap ? (cap === lim.maxQtyPerLine ? `Maximum ${lim.maxQtyPerLine} per item` : `Only ${d.available} available`) : null;
      if (existing) {
        if (existing.quantity >= cap) {
          if (existing.quantity > cap) existing.quantity = cap;
          return { lines, couponCode: state.couponCode, message };
        }
        existing.quantity = qty;
        existing.lastSeenUnitPrice = d.unitPrice;
      } else {
        lines.push({ variantId: op.variantId, quantity: qty, addedAt: now, lastSeenUnitPrice: d.unitPrice });
      }
      return { lines, couponCode: state.couponCode, message };
    }
    case 'set': {
      // BAG-002: above available → set to available with "Only <n> available".
      const line = lines.find((l) => l.variantId === op.variantId);
      if (!line) throw new AppError('NOT_FOUND');
      if (op.quantity > lim.maxQtyPerLine) throw new AppError('QTY_LIMIT');
      const d = await lineData(op.variantId);
      if (d.active && d.available > 0 && op.quantity > d.available) {
        line.quantity = d.available;
        return { lines, couponCode: state.couponCode, message: `Only ${d.available} available` };
      }
      line.quantity = op.quantity;
      return { lines, couponCode: state.couponCode, message: null };
    }
    case 'remove':
      return { lines: lines.filter((l) => l.variantId !== op.variantId), couponCode: state.couponCode, message: null };
    case 'applyCoupon': {
      // BAG-006: unknown → COUPON_INVALID; outside validity → COUPON_EXPIRED; otherwise the specific reason.
      const def = await findCoupon(ctx, op.code);
      if (!def || !def.active) throw new AppError('COUPON_INVALID');
      const uses = accountId ? await couponUses(ctx, accountId, def.code) : null;
      const q = computeQuote({ lines: await pricedInputs(ctx, lines), coupon: { definition: def, customerUses: uses }, bankOffer: null, delivery: await deliveryConfig(ctx), now: ctx.clock.now() });
      if (q.coupon.state === 'rejected') {
        const r = couponReason(q.coupon);
        throw new AppError(r.code, { reason: q.coupon.reason, shortfall: q.coupon.shortfall !== undefined ? formatINR(q.coupon.shortfall) : undefined });
      }
      return { lines, couponCode: def.code, message: null };
    }
    case 'removeCoupon':
      return { lines, couponCode: null, message: null };
  }
}

async function pricedInputs(ctx: AppContext, lines: StoredLine[]) {
  const data = await loadLineData(ctx, lines.map((l) => l.variantId));
  return lines
    .map((l) => ({ l, d: data.get(l.variantId) }))
    .filter((x): x is { l: StoredLine; d: LineData } => !!x.d && x.d.active && x.d.available > 0)
    .map(({ l, d }) => quoteLineInput(d, Math.min(l.quantity, d.available)));
}

// ── Guest bag (device): priced, never stored ─────────────────────────────────

/** POST /bag/guest-quote: applies an optional op to the device lines and prices them. Returns the lines to store on the device. */
export async function guestQuote(ctx: AppContext, body: { lines: StoredLine[]; coupon: string | null; op?: BagOp }) {
  let state: BagState = { lines: dedupe(body.lines), couponCode: body.coupon };
  let message: string | null = null;
  if (body.op) ({ message, ...state } = await applyOp(ctx, state, body.op, null));
  const view = await priceBag(ctx, { lines: state.lines, couponCode: state.couponCode, accountId: null });
  // The device keeps the prices the guest has now seen (BAG-004).
  const prices = new Map(view.lines.map((l) => [l.variantId, l.unitPrice.paise]));
  const deviceLines = state.lines.filter((l) => prices.has(l.variantId)).map((l) => ({ ...l, lastSeenUnitPrice: prices.get(l.variantId)! }));
  return { ...view, message, deviceLines };
}

function dedupe(lines: StoredLine[]): StoredLine[] {
  const m = new Map<string, StoredLine>();
  for (const l of lines) {
    const e = m.get(l.variantId);
    if (e) e.quantity = Math.min(10, e.quantity + l.quantity);
    else m.set(l.variantId, { ...l });
  }
  return [...m.values()];
}

// ── Customer bag (stored) ────────────────────────────────────────────────────

async function loadState(ctx: AppContext, accountId: string): Promise<BagState> {
  const [bag, rows] = await Promise.all([
    ctx.db.bag.findUnique({ where: { accountId } }),
    ctx.db.bagLine.findMany({ where: { accountId } }),
  ]);
  return {
    couponCode: bag?.couponCode ?? null,
    lines: rows.map((r) => ({ variantId: r.variantId, quantity: r.quantity, addedAt: r.addedAt.getTime(), lastSeenUnitPrice: r.lastSeenUnitPrice })),
  };
}

async function saveState(ctx: AppContext, accountId: string, s: BagState) {
  const fallbackPrices = await loadLineData(ctx, s.lines.filter((l) => l.lastSeenUnitPrice === undefined).map((l) => l.variantId));
  await ctx.db.$transaction([
    ctx.db.bag.upsert({ where: { accountId }, create: { accountId, couponCode: s.couponCode }, update: { couponCode: s.couponCode } }),
    ctx.db.bagLine.deleteMany({ where: { accountId } }),
    ctx.db.bagLine.createMany({
      data: s.lines.map((l) => ({
        accountId, variantId: l.variantId, quantity: l.quantity, addedAt: new Date(l.addedAt),
        lastSeenUnitPrice: l.lastSeenUnitPrice ?? fallbackPrices.get(l.variantId)?.unitPrice ?? 0,
      })),
    }),
  ]);
}

/** GetBag (BAG-004): a fresh quote; price changes are reported once, then remembered; an ineligible coupon is removed. */
export async function getBag(ctx: AppContext, accountId: string, message: string | null = null) {
  const state = await loadState(ctx, accountId);
  const view = await priceBag(ctx, { lines: state.lines, couponCode: state.couponCode, accountId });
  const seen = new Map(view.lines.map((l) => [l.variantId, l.unitPrice.paise]));
  const stale = state.lines.some((l) => seen.has(l.variantId) && l.lastSeenUnitPrice !== seen.get(l.variantId));
  if (stale || view.couponRemoved) {
    await ctx.db.$transaction([
      ...state.lines.filter((l) => seen.has(l.variantId) && l.lastSeenUnitPrice !== seen.get(l.variantId)).map((l) =>
        ctx.db.bagLine.update({ where: { accountId_variantId: { accountId, variantId: l.variantId } }, data: { lastSeenUnitPrice: seen.get(l.variantId)! } })),
      ...(view.couponRemoved ? [ctx.db.bag.update({ where: { accountId }, data: { couponCode: null } })] : []),
    ]);
  }
  return { ...view, message };
}

export async function updateBag(ctx: AppContext, accountId: string, op: BagOp) {
  const state = await loadState(ctx, accountId);
  const next = await applyOp(ctx, state, op, accountId);
  await saveState(ctx, accountId, next);
  return getBag(ctx, accountId, next.message);
}

/** Units in the bag, for the header badge (NAV-004). */
export async function bagUnits(ctx: AppContext, accountId: string): Promise<number> {
  const r = await ctx.db.bagLine.aggregate({ where: { accountId }, _sum: { quantity: true } });
  return r._sum.quantity ?? 0;
}

// ── Merge on login and sign-up (AUTH-012, EC-15) ──────────────────────────────

/**
 * Guest lines join the account bag: matching variants are summed and capped at min(10, available);
 * new lines are added up to the 50-line limit; inactive or out-of-stock lines carry over flagged.
 * The account's coupon wins; the guest coupon applies only when the account has none.
 */
export async function mergeGuestBag(ctx: AppContext, accountId: string, guest: { lines: StoredLine[]; coupon: string | null }): Promise<string[]> {
  if (guest.lines.length === 0 && !guest.coupon) return [];
  const lim = await limits(ctx);
  const state = await loadState(ctx, accountId);
  const data = await loadLineData(ctx, [...guest.lines.map((l) => l.variantId), ...state.lines.map((l) => l.variantId)]);
  const messages: string[] = [];
  let skipped = 0;
  for (const g of dedupe(guest.lines)) {
    const d = data.get(g.variantId);
    if (!d) continue;
    const existing = state.lines.find((l) => l.variantId === g.variantId);
    const cap = Math.min(lim.maxQtyPerLine, d.available);
    if (existing) {
      const sum = existing.quantity + g.quantity;
      const qty = d.active && d.available > 0 ? Math.min(sum, cap) : Math.min(sum, lim.maxQtyPerLine);
      if (qty < sum) messages.push(`${d.brand} ${d.name} (${d.size}): quantity adjusted to ${qty}`);
      existing.quantity = qty;
    } else if (state.lines.length >= lim.maxLines) {
      skipped += 1;
    } else {
      const qty = d.active && d.available > 0 && g.quantity > cap ? cap : Math.min(g.quantity, lim.maxQtyPerLine);
      if (qty < g.quantity) messages.push(`${d.brand} ${d.name} (${d.size}): quantity adjusted to ${qty}`);
      state.lines.push({ variantId: g.variantId, quantity: qty, addedAt: g.addedAt, lastSeenUnitPrice: g.lastSeenUnitPrice });
    }
  }
  if (skipped) messages.push(`${skipped} item${skipped === 1 ? '' : 's'} from your guest bag couldn't be added: your bag can hold up to ${lim.maxLines} different items.`);
  if (!state.couponCode && guest.coupon) state.couponCode = guest.coupon.toUpperCase();
  await saveState(ctx, accountId, state);
  return messages;
}
