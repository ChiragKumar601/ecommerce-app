import { passesLuhn } from '@app/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { MAX_PRODUCTS_PER_PRIMARY_IMAGE } from './catalogue/images.js';
import { MIN_PER_CATEGORY, MIN_PER_SUBCATEGORY } from './catalogue/generate.js';
import { RESERVED_SEGMENTS } from './tree.js';

/** Owner minimum for distinct catalogue images (OD-13). */
export const MIN_DISTINCT_IMAGES = 150;

export interface VerifyResult {
  errors: string[];
  warnings: string[];
  stats: Record<string, number>;
}

/** Checks the seeded database against the Stage 3 rules (DAT-001…009, D-44, OD-6, R-20). */
export async function verifySeed(db: PrismaClient): Promise<VerifyResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodes = await db.catalogueNode.findMany({ include: { _count: { select: { products: true } } } });
  const products = await db.product.count();
  const stats: Record<string, number> = { products, nodes: nodes.length };

  // DAT-001 / SD-64
  for (const s of nodes.filter((n) => n.type === 'section')) {
    if ((RESERVED_SEGMENTS as readonly string[]).includes(s.slug)) errors.push(`reserved section slug ${s.slug}`);
  }
  // D-44 volumes: ≥ 6 per subcategory, ≥ 48 per category; total reported.
  for (const n of nodes) {
    if (n.type === 'subcategory' && n._count.products < MIN_PER_SUBCATEGORY) errors.push(`subcategory ${n.id} has ${n._count.products} products (< ${MIN_PER_SUBCATEGORY})`);
    if (n.type === 'category' && n._count.products < MIN_PER_CATEGORY) errors.push(`category ${n.id} has ${n._count.products} products (< ${MIN_PER_CATEGORY})`);
  }
  if (products < 1800 || products > 2500) warnings.push(`total products ${products} is outside "about 1,800–2,500" (D-44)`);

  // Prices and stock.
  const badPrices = await db.variant.count({ where: { OR: [{ sellingPrice: { lte: 0 } }] } });
  if (badPrices) errors.push(`${badPrices} variants with a non-positive price`);
  const noVariants = await db.product.count({ where: { variants: { none: {} } } });
  if (noVariants) errors.push(`${noVariants} products without variants`);
  stats['outOfStockProducts'] = await db.product.count({ where: { variants: { every: { inventory: { onHand: 0 } } } } });

  // R-20 / DAT-003: every aggregate equals its visible review rows.
  const rows = await db.$queryRawUnsafe<{ productId: string; n: number; s: number }[]>(
    `SELECT "productId", COUNT(*) AS n, SUM("rating") AS s FROM "Review" WHERE "status" = 'visible' GROUP BY "productId"`,
  );
  const aggs = new Map((await db.ratingAggregate.findMany()).map((a) => [a.productId, a]));
  for (const r of rows) {
    const a = aggs.get(r.productId);
    if (!a || a.count !== Number(r.n) || a.sumRatings !== Number(r.s)) errors.push(`rating aggregate mismatch for ${r.productId}`);
  }
  if (aggs.size !== rows.length) errors.push(`aggregates (${aggs.size}) don't match products with reviews (${rows.length})`);
  stats['reviews'] = await db.review.count();
  if ((await db.review.count({ where: { seeded: true, verifiedPurchase: true } })) > 0) errors.push('seeded reviews must not be Verified Purchase (R-20)');

  // D-22 / OD-6: images, licences and repetition guardrails.
  const imageCount = await db.productImage.count();
  stats['images'] = imageCount;
  if (imageCount === 0) {
    warnings.push('no product images yet — run `pnpm images:fetch`, then `pnpm db:seed`');
  } else {
    // Owner rule (OD-13): reuse is fine, but at least 150 different images across the catalogue.
    const distinct = (await db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(DISTINCT "url") AS n FROM "ProductImage" WHERE "source" <> 'placeholder'`))[0]?.n ?? 0;
    stats['placeholderProducts'] = await db.productImage.count({ where: { source: 'placeholder' } });
    stats['distinctImages'] = Number(distinct);
    if (Number(distinct) < MIN_DISTINCT_IMAGES) errors.push(`only ${distinct} distinct product images (need ≥ ${MIN_DISTINCT_IMAGES})`);
    const perProduct = await db.productImage.groupBy({ by: ['productId'], _count: { _all: true } });
    const placeholderIds = new Set((await db.productImage.findMany({ where: { source: 'placeholder' }, select: { productId: true } })).map((x) => x.productId));
    // Real photos: 2–4 each. Placeholder products have exactly one on-theme image.
    const few = perProduct.filter((x) => !placeholderIds.has(x.productId) && (x._count._all < 2 || x._count._all > 4)).length;
    if (placeholderIds.size) warnings.push(`${placeholderIds.size} products use the on-theme placeholder (no relevant photo yet)`);
    const missing = products - perProduct.length;
    if (missing) errors.push(`${missing} products have no images`);
    if (few) errors.push(`${few} products have fewer than 2 or more than 4 images`);
    if (await db.productImage.count({ where: { source: { not: 'placeholder' }, OR: [{ licence: '' }, { photographer: '' }, { sourcePageUrl: '' }] } })) errors.push('images without licence/source metadata');
    const primaries = await db.$queryRawUnsafe<{ primaryNodeId: string; url: string; n: number }[]>(
      `SELECT p."primaryNodeId", i."url", COUNT(*) AS n FROM "ProductImage" i JOIN "Product" p ON p."id" = i."productId" WHERE i."order" = 0 AND i."source" <> 'placeholder' GROUP BY p."primaryNodeId", i."url" HAVING COUNT(*) > ${MAX_PRODUCTS_PER_PRIMARY_IMAGE}`,
    );
    // OD-11: reuse beyond 2 is allowed only when a pool is too small, so it is reported, not failed.
    for (const x of primaries) warnings.push(`primary image used by ${x.n} products in ${x.primaryNodeId}`);
  }

  // DAT-004 … DAT-009 reference and content data.
  const slides = await db.heroSlide.findMany({ where: { active: true } });
  if (slides.length < 5 || slides.length > 8) errors.push(`${slides.length} active hero slides (need 5–8)`);
  if (!slides.some((s) => s.href === '/collections/best-seller-styles')) errors.push('no hero slide links to Best Seller Styles (LND-003)');
  if ((await db.shopByCategoryCard.count()) < 20) errors.push('too few Shop by Category cards');
  if (await db.heroSlide.count({ where: { imageUrl: { startsWith: 'placeholder:' } } })) warnings.push('hero slides still use placeholder images');
  const pins = await db.serviceablePincode.findMany();
  const states = await db.stateRef.findMany();
  if (pins.length < 200) errors.push(`${pins.length} serviceable pincodes (< 200)`);
  const covered = new Set(pins.map((p) => p.state));
  for (const s of states) if (!covered.has(s.name)) errors.push(`no serviceable pincode in ${s.name}`);
  if (states.length !== 36) errors.push(`${states.length} states/UTs (expected 36)`);
  if ((await db.securityQuestion.count({ where: { active: true } })) < 6) errors.push('fewer than 6 security questions');
  const cards = await db.testCard.findMany();
  if (cards.length !== 15 || cards.some((c) => !passesLuhn(c.number))) errors.push('test cards must be 15 Luhn-valid numbers');
  if ((await db.testUpi.count()) !== 4) errors.push('expected 4 test UPI IDs');
  if ((await db.giftCardCode.count({ where: { active: true } })) < 5) errors.push('fewer than 5 active gift card codes');
  const faqs = await db.faqEntry.findMany();
  if (faqs.length < 15 || new Set(faqs.map((f) => f.topic)).size < 5) errors.push('need ≥ 15 FAQs across ≥ 5 topics');
  const pages = await db.contentPage.findMany();
  for (const slug of ['blog', 'careers', 'sitemap', 'corporate-information', 'terms-of-use', 'privacy-policy', 'returns-and-refunds-policy', 'shipping-policy']) {
    const page = pages.find((p) => p.slug === slug);
    if (!page) errors.push(`missing content page ${slug}`);
    else if (!page.isPlaceholder) errors.push(`page ${slug} must be labelled as placeholder (LND-008)`);
  }
  const privacy = pages.find((p) => p.slug === 'privacy-policy');
  if (privacy && !/30 days/.test(privacy.body)) errors.push('privacy policy must state the 30-day purge (PRV-004)');
  stats['nonReturnable'] = await db.product.count({ where: { returnable: false } });
  stats['bestSellers'] = await db.product.count({ where: { bestSeller: true } });
  stats['bankOfferEligible'] = await db.product.count({ where: { bankOfferEligible: true } });
  return { errors, warnings, stats };
}
