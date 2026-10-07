import type { ProductCardData } from '@app/shared';
import type { AppContext } from '../../api/context.js';
import { discountPercent } from '../../domain/catalogue/discount.js';
import { recommendedScore } from '../../domain/catalogue/sortScore.js';
import { AppError } from '../../domain/errors.js';
import { formatINR, money } from '../../domain/money.js';
import { addDays, formatIstDate, istDate } from '../../domain/time.js';
import { derive, toCard, type Derived } from './listing.js';
import { ancestry, getDynamic, getSnapshot, type SnapProduct } from './snapshot.js';

// Product detail page reads (S9.1–S9.2): GetProduct, GetRecommendations, ListReviews, CheckPincode.

const nodeCrumbs = (chain: { name: string; href: string }[]) => chain.map((n) => ({ label: n.name, href: n.href }));

/** GetProduct (PDP-002…006, PDP-013, NAV-010). Inactive products return `active: false` with no purchase data. */
export async function getProduct(ctx: AppContext, id: string) {
  const p = await ctx.db.product.findUnique({
    where: { id },
    include: {
      brand: true,
      images: { orderBy: { order: 'asc' } },
      variants: { where: { active: true }, orderBy: { sortOrder: 'asc' }, include: { inventory: true } },
      nodes: { select: { nodeId: true } },
      sizeGuide: true,
      ratingAggregate: true,
    },
  });
  if (!p) throw new AppError('NOT_FOUND');
  const snap = await getSnapshot(ctx);
  const primaryChain = ancestry(snap, p.primaryNodeId);
  const base = {
    id: p.id, slug: p.slug, href: `/p/${p.slug}-${p.id}`, name: p.name, brand: { name: p.brand.name, slug: p.brand.slug }, subtitle: p.subtitle,
    image: p.images[0] ? { url: p.images[0].url, alt: `${p.brand.name} ${p.name}` } : null,
    breadcrumbs: {
      primary: nodeCrumbs(primaryChain),
      // Every listing that contains the product, so the client can show the path it came from (NAV-010).
      nodes: p.nodes.map((n) => snap.nodes.get(n.nodeId)).filter((x) => !!x).map((n) => ({ path: n.path, label: n.name, href: n.href })),
    },
  };
  if (!p.active || p.variants.length === 0) return { ...base, active: false as const };

  const variants = p.variants.map((v) => {
    const available = Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.held ?? 0));
    return { id: v.id, sizeLabel: v.sizeLabel, price: money(v.sellingPrice), mrp: money(v.mrp), discountPercent: discountPercent(v.mrp, v.sellingPrice), available };
  });
  const inStock = variants.filter((v) => v.available > 0);
  const defaultVariant = (inStock.length ? inStock : variants).reduce((a, b) => (b.price.paise < a.price.paise ? b : a));

  const now = ctx.clock.now();
  const nodeIds = new Set(p.nodes.map((n) => n.nodeId));
  const [offer, coupons, colourRows] = await Promise.all([
    p.bankOfferEligible ? ctx.db.bankOffer.findFirst({ where: { active: true, validFrom: { lte: now }, validTo: { gte: now } } }) : null,
    ctx.db.coupon.findMany({ where: { active: true, validFrom: { lte: now }, validTo: { gte: now } }, orderBy: { code: 'asc' } }),
    ctx.db.product.findMany({ where: { styleGroupId: p.styleGroupId, active: true }, select: { id: true, slug: true, colour: true, images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } } }, orderBy: { colour: 'asc' } }),
  ]);
  const eligibleCoupons = coupons
    .filter((c) => {
      const ids = (c.eligibleNodeIds as string[] | null) ?? [];
      return ids.length === 0 || ids.some((n) => nodeIds.has(n));
    })
    .slice(0, 3)
    .map((c) => ({ code: c.code, description: c.description, minEligibleValue: money(c.minEligibleValue) }));
  const agg = p.ratingAggregate && p.ratingAggregate.count > 0 ? p.ratingAggregate : null;
  const windowDays = await ctx.settings.get<number>('returns.windowDays', 14);
  const specs = (p.specifications as { key: string; value: string }[] | null) ?? [];

  return {
    ...base,
    active: true as const,
    description: p.description,
    materialCare: p.materialCare,
    specifications: specs,
    colour: p.colour,
    images: p.images.map((img, i) => ({ url: img.url, alt: `${p.brand.name} ${p.name}, ${p.colour}, image ${i + 1}` })),
    variants,
    defaultVariantId: defaultVariant.id,
    oneSize: variants.length === 1,
    rating: agg ? { average: Math.round((agg.sumRatings / agg.count) * 10) / 10, count: agg.count, distribution: { 5: agg.c5, 4: agg.c4, 3: agg.c3, 2: agg.c2, 1: agg.c1 } } : null,
    offers: {
      bank: offer ? { bankName: offer.bankName, summary: offer.summary, termsText: offer.termsText } : null,
      coupons: eligibleCoupons,
    },
    returns: { returnable: p.returnable, windowDays, text: p.returnable ? `Easy ${windowDays}-day returns` : 'This item is not returnable' },
    sizeGuide: p.sizeGuide ? { name: p.sizeGuide.name, table: p.sizeGuide.table as { columns: string[]; rows: string[][] }, notes: p.sizeGuide.notes } : null,
    colours: colourRows.length > 1 ? colourRows.map((c) => ({ id: c.id, colour: c.colour, href: `/p/${c.slug}-${c.id}`, image: c.images[0]?.url ?? null, current: c.id === p.id })) : [],
  };
}

const REC_MAX = 12;

/** GetRecommendations (PDP-011, SD-33): each rail ≤ 12, omitted when empty. Works for inactive products too (PDP-013). */
export async function getRecommendations(ctx: AppContext, id: string) {
  const snap = await getSnapshot(ctx);
  const dyn = await getDynamic(ctx);
  let me: SnapProduct | undefined = snap.byId.get(id);
  let myPrice: number;
  if (me) {
    myPrice = derive(me, dyn.available, dyn.ratings).price;
  } else {
    // Inactive products are not in the snapshot: use their stored placement and price.
    const row = await ctx.db.product.findUnique({ where: { id }, select: { id: true, primaryNodeId: true, primarySectionId: true, brandId: true, variants: { select: { sellingPrice: true } } } });
    if (!row) throw new AppError('NOT_FOUND');
    myPrice = Math.min(...row.variants.map((v) => v.sellingPrice), Number.MAX_SAFE_INTEGER);
    me = { id: row.id, primaryNodeId: row.primaryNodeId, primarySectionId: row.primarySectionId, brandId: row.brandId } as SnapProduct;
  }
  const now = ctx.clock.now();
  const score = (d: Derived) => recommendedScore(
    { averageRating: d.rating ? d.rating.sum / d.rating.count : 0, ratingCount: d.rating?.count ?? 0, listingDate: new Date(d.p.listingDate) },
    { now, globalMeanRating: dyn.globalMean, maxRatingCount: dyn.maxCount },
  );
  const card = (p: SnapProduct) => derive(p, dyn.available, dyn.ratings);
  const rank = (ds: Derived[]) => ds.sort((a, b) => Number(b.inStock) - Number(a.inStock) || score(b) - score(a)).slice(0, REC_MAX).map(toCard);

  const self = me;
  const similar = rank(snap.products.filter((p) => p.id !== self.id && p.nodeIds.has(self.primaryNodeId)).map(card).filter((d) => d.price >= myPrice * 0.7 && d.price <= myPrice * 1.3));
  const similarIds = new Set(similar.map((c) => c.id));
  const related = rank(snap.products.filter((p) => p.id !== self.id && !similarIds.has(p.id) && (p.brandId === self.brandId || p.primarySectionId === self.primarySectionId)).map(card));

  const curated = await ctx.db.productCuratedRec.findMany({ where: { productId: id }, orderBy: { order: 'asc' } });
  const curatedCards = (kind: string): ProductCardData[] =>
    curated.filter((c) => c.kind === kind).map((c) => snap.byId.get(c.targetId)).filter((p): p is SnapProduct => !!p).slice(0, REC_MAX).map((p) => toCard(card(p)));

  return { similar, related, boughtTogether: curatedCards('bought_together'), completeTheLook: curatedCards('complete_the_look') };
}

export type ReviewSort = 'recent' | 'highest' | 'lowest';
const REVIEW_PAGE = 10;

/** ListReviews (REV-001, REV-002, SD-34): visible reviews, 10 per page, sort and star/image filters. */
export async function listReviews(ctx: AppContext, productId: string, q: { sort: ReviewSort; rating?: number; withImages: boolean; cursor?: string }) {
  const exists = await ctx.db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND');
  const offset = q.cursor ? Number(Buffer.from(q.cursor, 'base64url').toString()) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'cursor', code: 'invalid', message: 'Invalid page.' }] });
  const where = { productId, status: 'visible', ...(q.rating ? { rating: q.rating } : {}), ...(q.withImages ? { images: { some: {} } } : {}) };
  const orderBy =
    q.sort === 'highest' ? [{ rating: 'desc' as const }, { createdAt: 'desc' as const }]
    : q.sort === 'lowest' ? [{ rating: 'asc' as const }, { createdAt: 'desc' as const }]
    : [{ createdAt: 'desc' as const }];
  const [rows, totalCount] = await Promise.all([
    ctx.db.review.findMany({ where, orderBy: [...orderBy, { id: 'asc' }], skip: offset, take: REVIEW_PAGE, include: { images: { orderBy: { order: 'asc' } } } }),
    ctx.db.review.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id, author: r.authorDisplayName, rating: r.rating, text: r.text, verifiedPurchase: r.verifiedPurchase,
      images: r.images.map((i) => ({ url: i.url })), createdAt: r.createdAt.toISOString(), date: formatIstDate(istDate(r.createdAt)),
    })),
    totalCount,
    nextCursor: offset + REVIEW_PAGE < totalCount ? Buffer.from(String(offset + REVIEW_PAGE)).toString('base64url') : null,
  };
}

/** CheckPincode (PDP-007, T-17): delivery date by zone, plus the delivery-charge rule. */
export async function checkPincode(ctx: AppContext, pincode: string) {
  const row = await ctx.db.serviceablePincode.findUnique({ where: { pincode }, include: { zoneRef: true } });
  const threshold = await ctx.settings.get<number>('delivery.freeThreshold', 199900);
  const rule = `Free delivery on orders above ${formatINR(threshold)}`;
  if (!row) return { pincode, serviceable: false as const, message: `Sorry, we don't deliver to ${pincode} yet` };
  const date = addDays(istDate(ctx.clock.now()), row.zoneRef.deliveryDays);
  return { pincode, serviceable: true as const, city: row.city, zone: row.zone, deliveryDate: date, message: `Delivery by ${formatIstDate(date)}`, rule };
}
