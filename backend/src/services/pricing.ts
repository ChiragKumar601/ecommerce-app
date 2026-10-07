import type { AppContext } from '../api/context.js';
import { discountPercent } from '../domain/catalogue/discount.js';
import { messageFor } from '../domain/errors.js';
import { formatINR, money, type Paise } from '../domain/money.js';
import type { BankOfferDefinition, CardType, CouponDefinition, CouponStatus, DeliveryConfig, Quote, QuoteLineInput } from '../domain/pricing/types.js';
import { getSnapshot } from './catalogue/snapshot.js';

// Loads pricing configuration and line data from the database for the pure engine (INT-001).

export async function deliveryConfig(ctx: AppContext): Promise<DeliveryConfig> {
  const [freeThreshold, flatCharge, codMaxPayable, deliveryTaxRatePercent] = await Promise.all([
    ctx.settings.get<number>('delivery.freeThreshold', 199900),
    ctx.settings.get<number>('delivery.flatCharge', 9900),
    ctx.settings.get<number>('cod.maxPayable', 1000000),
    ctx.settings.get<number>('delivery.taxRatePercent', 18),
  ]);
  return { freeThreshold, flatCharge, codMaxPayable, deliveryTaxRatePercent };
}

export async function activeBankOffer(ctx: AppContext): Promise<BankOfferDefinition | null> {
  const o = await ctx.db.bankOffer.findFirst({ where: { active: true }, orderBy: { id: 'asc' } });
  if (!o) return null;
  return {
    id: o.id, bankName: o.bankName, cardTypes: o.cardTypes as CardType[], percent: o.percent, maxDiscount: o.maxDiscount,
    minEligibleValue: o.minEligibleValue, validFrom: o.validFrom, validTo: o.validTo, active: o.active,
  };
}

export async function findCoupon(ctx: AppContext, code: string): Promise<CouponDefinition | null> {
  const c = await ctx.db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!c) return null;
  return {
    code: c.code, type: c.type as 'percent' | 'flat', value: c.value, maxDiscount: c.maxDiscount, minEligibleValue: c.minEligibleValue,
    eligibleNodeIds: (c.eligibleNodeIds as string[] | null) ?? [], validFrom: c.validFrom, validTo: c.validTo, perCustomerLimit: c.perCustomerLimit, active: c.active,
  };
}

/** Count of the customer's Placed-or-later orders that used the coupon (PRC-002). */
export async function couponUses(ctx: AppContext, accountId: string, code: string): Promise<number> {
  return ctx.db.order.count({ where: { accountId, couponCode: code, placedAt: { not: null } } });
}

/** Line data for priced items: product state, availability, tax rate (most specific node wins, R-35). */
export interface LineData {
  variantId: string;
  productId: string;
  href: string;
  brand: string;
  name: string;
  size: string;
  image: { url: string; alt: string } | null;
  unitMrp: Paise;
  unitPrice: Paise;
  available: number;
  active: boolean;
  returnable: boolean;
  bankOfferEligible: boolean;
  nodeIds: string[];
  taxRatePercent: number;
}

export async function loadLineData(ctx: AppContext, variantIds: string[]): Promise<Map<string, LineData>> {
  if (variantIds.length === 0) return new Map();
  const [rows, taxRows, snap] = await Promise.all([
    ctx.db.variant.findMany({
      where: { id: { in: variantIds } },
      include: {
        inventory: true,
        product: { include: { brand: true, nodes: { select: { nodeId: true } }, images: { take: 1, orderBy: { order: 'asc' } } } },
      },
    }),
    ctx.db.taxRate.findMany(),
    getSnapshot(ctx),
  ]);
  const taxes = new Map(taxRows.map((t) => [t.nodeId, t.ratePercent]));
  const depth = (id: string) => snap.nodes.get(id)?.path.split('/').length ?? 0;
  const out = new Map<string, LineData>();
  for (const v of rows) {
    const p = v.product;
    const nodeIds = p.nodes.map((n) => n.nodeId);
    const taxed = nodeIds.filter((id) => taxes.has(id)).sort((a, b) => depth(b) - depth(a));
    out.set(v.id, {
      variantId: v.id, productId: p.id, href: `/p/${p.slug}-${p.id}`, brand: p.brand.name, name: p.name, size: v.sizeLabel,
      image: p.images[0] ? { url: p.images[0].url, alt: `${p.brand.name} ${p.name}` } : null,
      unitMrp: v.mrp, unitPrice: v.sellingPrice,
      available: Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.held ?? 0)),
      active: p.active && v.active, returnable: p.returnable, bankOfferEligible: p.bankOfferEligible, nodeIds,
      taxRatePercent: taxed.length ? taxes.get(taxed[0]!)! : 0,
    });
  }
  return out;
}

export const quoteLineInput = (d: LineData, qty: number): QuoteLineInput => ({
  variantId: d.variantId, productId: d.productId, name: `${d.brand} ${d.name} (${d.size})`, qty, unitMrp: d.unitMrp, unitPrice: d.unitPrice,
  nodeIds: d.nodeIds, bankOfferEligible: d.bankOfferEligible, taxRatePercent: d.taxRatePercent,
});

/** Customer-facing reason for a rejected coupon (BAG-006/007, §13). */
export function couponReason(status: Extract<CouponStatus, { state: 'rejected' }>): { code: 'COUPON_INVALID' | 'COUPON_EXPIRED' | 'COUPON_NOT_ELIGIBLE'; message: string } {
  if (status.reason === 'inactive') return { code: 'COUPON_INVALID', message: messageFor('COUPON_INVALID') };
  if (status.reason === 'expired') return { code: 'COUPON_EXPIRED', message: messageFor('COUPON_EXPIRED') };
  return { code: 'COUPON_NOT_ELIGIBLE', message: messageFor('COUPON_NOT_ELIGIBLE', { reason: status.reason, shortfall: status.shortfall !== undefined ? formatINR(status.shortfall) : undefined }) };
}

/** The quote as sent to the client: every amount as {paise, display} (API-005, PRC-012). */
export function quoteView(q: Quote, bankName = 'HDFC') {
  const freeDeliveryNudge = q.deliveryCharge > 0 && q.freeDeliveryShortfall > 0 ? `Add items worth ${formatINR(q.freeDeliveryShortfall)} more for FREE delivery` : null;
  let bankOfferText: string | null = null;
  if (q.bankOffer.state === 'available') bankOfferText = `Pay with an ${bankName} card and save up to ${formatINR(q.bankOffer.potentialDiscount)}`;
  else if (q.bankOffer.state === 'applied') bankOfferText = `${bankName} card offer applied: you save ${formatINR(q.bankOffer.discount)}`;
  else if (q.bankOffer.state === 'not_eligible' && q.bankOffer.reason !== 'inactive' && q.bankOffer.reason !== 'wallet_covers_total')
    bankOfferText = `10% instant discount with ${bankName} cards on eligible items above ${formatINR(q.bankOffer.minEligibleValue)}`;
  return {
    lines: q.lines.map((l) => ({
      variantId: l.variantId, qty: l.qty, unitPrice: money(l.unitPrice), unitMrp: money(l.unitMrp), lineValue: money(l.lineValue), lineMrp: money(l.lineMrp),
      couponShare: money(l.couponShare), bankOfferShare: money(l.bankOfferShare), lineNet: money(l.lineNet), taxPortion: money(l.taxPortion),
      discountPercent: discountPercent(l.unitMrp, l.unitPrice),
    })),
    totalMrp: money(q.totalMrp),
    discountOnMrp: money(q.discountOnMrp),
    bagValue: money(q.bagValue),
    couponDiscount: money(q.couponDiscount),
    coupon: q.coupon.state === 'applied' ? { code: q.coupon.code, discount: money(q.coupon.discount) } : null,
    deliveryCharge: money(q.deliveryCharge),
    deliveryFree: q.deliveryCharge === 0,
    freeDeliveryNudge,
    bankOfferDiscount: money(q.bankOfferDiscount),
    bankOffer: { state: q.bankOffer.state, text: bankOfferText },
    total: money(q.total),
    taxPortion: money(q.taxPortion),
    taxText: `Inclusive of ${formatINR(q.taxPortion)} tax`,
    wallet: { giftCard: money(q.wallet.giftCard), credits: money(q.wallet.credits), giftCardId: q.wallet.giftCardId },
    remainder: money(q.remainder),
    allowedMethods: q.allowedMethods,
    methodError: q.methodError,
  };
}
export type QuoteView = ReturnType<typeof quoteView>;
