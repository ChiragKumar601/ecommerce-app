import { aggregate, generateReviews } from './catalogue/reviews.js';
import { generateCatalogue, SEED_DATE } from './catalogue/generate.js';
import { assignImages } from './catalogue/images.js';
import { SIZE_GUIDES } from './catalogue/sizeGuides.js';
import { contentImage, loadImageManifest, loadSeedFiles } from './files.js';
import { fallbackQueriesFor } from './queries.js';
import { flattenTree, loadTree } from './tree.js';
import { recommendedScore } from '../domain/catalogue/sortScore.js';
import { slugify } from '../domain/ids.js';
import type { PrismaClient } from '../generated/prisma/client.js';

const CHUNK = 500;
async function insertMany<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

/** Upserts config, content, reference and demo data (`pnpm config:sync`). Never touches user data. */
export async function syncConfig(db: PrismaClient): Promise<{ catalogueVersion: number }> {
  const f = loadSeedFiles();
  const manifest = loadImageManifest();
  const nodeIds = new Set((await db.catalogueNode.findMany({ select: { id: true } })).map((n) => n.id));

  await db.$transaction(async (tx) => {
    for (const [key, value] of Object.entries({ ...f.settings, 'returns.windowDays': f.returnPolicy.windowDays, footer: f.footer })) {
      await tx.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
    }
    for (const c of f.coupons) {
      const data = { ...c, code: c.code.toUpperCase(), eligibleNodeIds: c.eligibleNodeIds, validFrom: new Date(c.validFrom), validTo: new Date(c.validTo) };
      await tx.coupon.upsert({ where: { code: data.code }, create: data, update: data });
    }
    for (const o of f.bankOffers) {
      const data = { ...o, validFrom: new Date(o.validFrom), validTo: new Date(o.validTo) };
      await tx.bankOffer.upsert({ where: { id: o.id }, create: data, update: data });
    }
    for (const z of f.zones) await tx.deliveryZone.upsert({ where: { zone: z.zone }, create: z, update: z });
    for (const s of f.states) await tx.stateRef.upsert({ where: { code: s.code }, create: s, update: s });
    await tx.serviceablePincode.deleteMany();
    await tx.serviceablePincode.createMany({ data: f.pincodes });
    await tx.securityQuestion.deleteMany({ where: { id: { notIn: f.securityQuestions.map((_, i) => `q${i + 1}`) } } });
    for (const [i, text] of f.securityQuestions.entries()) {
      await tx.securityQuestion.upsert({ where: { id: `q${i + 1}` }, create: { id: `q${i + 1}`, text, order: i + 1 }, update: { text, order: i + 1, active: true } });
    }
    await tx.blockedWord.deleteMany();
    await tx.blockedWord.createMany({ data: f.blockedWords.map((word) => ({ word: word.toLowerCase() })) });
    await tx.testCard.deleteMany();
    await tx.testCard.createMany({ data: f.testCards });
    await tx.testUpi.deleteMany();
    await tx.testUpi.createMany({ data: f.testUpi });
    for (const g of f.giftCodes) await tx.giftCardCode.upsert({ where: { code: g.code }, create: g, update: g });
    await tx.taxRate.deleteMany();
    await tx.taxRate.createMany({ data: Object.entries(f.taxRates).filter(([id]) => nodeIds.has(id)).map(([nodeId, ratePercent]) => ({ nodeId, ratePercent })) });
    await tx.returnPolicyNode.deleteMany();
    await tx.returnPolicyNode.createMany({ data: f.returnPolicy.nonReturnableNodeIds.filter((id) => nodeIds.has(id)).map((nodeId) => ({ nodeId })) });
    const usedContentImages = new Set<string>();
    await tx.heroSlide.deleteMany();
    await tx.heroSlide.createMany({
      data: f.slides.map((s) => {
        const img = contentImage(manifest, s.imageQuery, s.imageKeywords, usedContentImages, s.imageId);
        return { id: s.id, imageUrl: img.url, imageAlt: img.alt, headline: s.headline, subheadline: s.subheadline, ctaLabel: s.ctaLabel, href: s.href, order: s.order, active: s.active };
      }),
    });
    await tx.shopByCategoryCard.deleteMany();
    await tx.shopByCategoryCard.createMany({
      data: f.cards.map((c) => {
        const img = contentImage(manifest, c.imageQuery, c.imageKeywords, usedContentImages, c.imageId);
        return { id: c.id, name: c.name, imageUrl: img.url, imageAlt: img.alt, discountText: c.discountText, href: c.href, order: c.order, active: true };
      }),
    });
    await tx.popularSearch.deleteMany();
    await tx.popularSearch.createMany({ data: f.popularSearches.map((term, i) => ({ term, order: i + 1 })) });
    await tx.contentPage.deleteMany();
    await tx.contentPage.createMany({ data: f.pages });
    await tx.faqEntry.deleteMany();
    await tx.faqEntry.createMany({ data: f.faqs.map((q, i) => ({ id: `faq-${i + 1}`, ...q, order: i + 1 })) });
  });

  // A product is returnable unless it sits under a non-returnable node (R-17).
  const blocked = f.returnPolicy.nonReturnableNodeIds;
  if (blocked.length) {
    await db.product.updateMany({ data: { returnable: true } });
    await db.product.updateMany({ where: { nodes: { some: { nodeId: { in: blocked } } } }, data: { returnable: false } });
  }
  return { catalogueVersion: await bumpCatalogueVersion(db) };
}

/** Increments `catalogue_version` so running APIs rebuild caches and the search index (PR-22). */
export async function bumpCatalogueVersion(db: PrismaClient): Promise<number> {
  const cur = await db.setting.findUnique({ where: { key: 'catalogue_version' } });
  const next = (typeof cur?.value === 'number' ? cur.value : 0) + 1;
  await db.setting.upsert({ where: { key: 'catalogue_version' }, create: { key: 'catalogue_version', value: next }, update: { value: next } });
  return next;
}

/** Full catalogue seed (`pnpm db:seed`): replaces catalogue, review and config data. */
/** Image assignment for the generated catalogue, in the default listing order (S3.10). */
function planImages(nodes: ReturnType<typeof flattenTree>, catalogue: ReturnType<typeof generateCatalogue>, reviews: ReturnType<typeof generateReviews>) {
  const manifest = loadImageManifest();
  // Rating statistics for the default listing order used by image assignment.
  const byProduct = new Map<string, number[]>();
  for (const r of reviews) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r.rating]);
  const allRatings = reviews.map((r) => r.rating);
  const mean = allRatings.reduce((a, b) => a + b, 0) / Math.max(1, allRatings.length);
  const maxCount = Math.max(1, ...[...byProduct.values()].map((x) => x.length));
  const score = (id: string, listingDate: Date) => {
    const rs = byProduct.get(id) ?? [];
    const avg = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
    return recommendedScore({ averageRating: avg, ratingCount: rs.length, listingDate }, { now: SEED_DATE, globalMeanRating: mean, maxRatingCount: maxCount });
  };
  const images = manifest
    ? assignImages(catalogue.products, manifest, (p) => score(p.id, p.listingDate), fallbackQueriesFor(new Map(nodes.map((n) => [n.id, n]))))
    : { images: [], problems: ['image manifest not found — run `pnpm images:fetch`'], placeholderProductIds: catalogue.products.map((x) => x.id) };
  return { images, byProduct };
}

/** Product image rows: real photos with their credits, and the on-theme placeholder where none is relevant. */
function imageRows(catalogue: ReturnType<typeof generateCatalogue>, images: ReturnType<typeof planImages>['images']) {
  const byId = new Map(catalogue.products.map((x) => [x.id, x]));
  return [
    ...images.images.map((im) => ({
      id: `${im.productId}-i${im.order}`, productId: im.productId, url: im.photo.url, alt: im.photo.alt, order: im.order, source: im.photo.source,
      sourcePageUrl: im.photo.pageUrl, photographer: im.photo.photographer, photographerUrl: im.photo.photographerUrl, licence: im.photo.licence,
    })),
    ...images.placeholderProductIds.map((productId) => ({
      id: `${productId}-i0`, productId, url: `/media/placeholder/${byId.get(productId)!.primarySectionId}.svg`, alt: `${byId.get(productId)!.name} — image coming soon`,
      order: 0, source: 'placeholder', sourcePageUrl: '', photographer: '', photographerUrl: null, licence: 'Own work',
    })),
  ];
}

/**
 * Re-assigns product, hero and category-card images in place (after the manifest or blocklist
 * changes). Products, variants, stock, reviews, bags, wishlists and orders are left untouched.
 */
export async function refreshImages(db: PrismaClient) {
  const nodes = flattenTree(loadTree());
  const catalogue = generateCatalogue(nodes);
  const { images } = planImages(nodes, catalogue, generateReviews(catalogue.products));
  const existing = new Set((await db.product.findMany({ select: { id: true } })).map((p) => p.id));
  const rows = imageRows(catalogue, images).filter((r) => existing.has(r.productId));
  await db.productImage.deleteMany();
  await insertMany(rows, (c) => db.productImage.createMany({ data: c }));
  const sync = await syncConfig(db); // hero slides and category cards pick their images again
  return { images: rows.length, placeholders: images.placeholderProductIds.length, problems: images.problems, catalogueVersion: sync.catalogueVersion };
}

export async function seedAll(db: PrismaClient) {
  const nodes = flattenTree(loadTree());
  const catalogue = generateCatalogue(nodes);
  const reviews = generateReviews(catalogue.products);
  const { images, byProduct } = planImages(nodes, catalogue, reviews);

  // Clear catalogue data (children first).
  await db.$transaction([
    db.ratingAggregate.deleteMany(), db.reviewImage.deleteMany(), db.reviewReport.deleteMany(), db.review.deleteMany(),
    db.productCuratedRec.deleteMany(), db.productImage.deleteMany(), db.inventory.deleteMany(), db.variant.deleteMany(),
    db.productNode.deleteMany(), db.product.deleteMany(), db.brand.deleteMany(), db.sizeGuide.deleteMany(),
    db.taxRate.deleteMany(), db.returnPolicyNode.deleteMany(), db.catalogueNode.deleteMany(),
  ]);

  for (const n of nodes) {
    await db.catalogueNode.create({ data: { id: n.id, type: n.type, name: n.name, slug: n.slug, path: n.path, parentId: n.parentId, displayOrder: n.displayOrder } });
  }
  await db.sizeGuide.createMany({ data: SIZE_GUIDES });
  const brandId = (name: string) => slugify(name);
  await db.brand.createMany({ data: catalogue.brands.map((name) => ({ id: brandId(name), name, slug: brandId(name) })) });

  const p = catalogue.products;
  await insertMany(p, (chunk) => db.product.createMany({
    data: chunk.map((x) => ({
      id: x.id, slug: x.slug, brandId: brandId(x.brand), name: x.name, subtitle: x.subtitle, description: x.description,
      materialCare: x.materialCare, specifications: x.specifications, primarySectionId: x.primarySectionId, primaryNodeId: x.primaryNodeId,
      gender: x.gender, colour: x.colour, styleGroupId: x.styleGroupId, listingDate: x.listingDate, bestSeller: x.bestSeller,
      bankOfferEligible: x.bankOfferEligible, inclusiveSizing: x.inclusiveSizing, sizeGuideId: x.sizeGuideId,
    })),
  }));
  await insertMany(p.flatMap((x) => [...x.nodeIds].map((nodeId) => ({ productId: x.id, nodeId }))), (c) => db.productNode.createMany({ data: c }));
  await insertMany(p.flatMap((x) => x.variants.map((v) => ({ id: v.id, productId: x.id, sizeLabel: v.sizeLabel, sortOrder: v.sortOrder, mrp: v.mrp, sellingPrice: v.sellingPrice }))), (c) => db.variant.createMany({ data: c }));
  await insertMany(p.flatMap((x) => x.variants.map((v) => ({ variantId: v.id, onHand: v.onHand, held: 0, baselineOnHand: v.onHand }))), (c) => db.inventory.createMany({ data: c }));
  await insertMany(catalogue.curated, (c) => db.productCuratedRec.createMany({ data: c }));
  await insertMany(imageRows(catalogue, images), (c) => db.productImage.createMany({ data: c }));
  await insertMany(reviews.map((r) => ({ ...r, seeded: true, verifiedPurchase: false, status: 'visible', updatedAt: r.createdAt })), (c) => db.review.createMany({ data: c }));
  await insertMany([...byProduct].map(([productId, rs]) => ({ productId, ...aggregate(rs) })), (c) => db.ratingAggregate.createMany({ data: c }));

  const sync = await syncConfig(db);
  return {
    products: p.length,
    variants: p.reduce((s, x) => s + x.variants.length, 0),
    reviews: reviews.length,
    images: images.images.length,
    placeholders: images.placeholderProductIds.length,
    imageProblems: images.problems,
    catalogueVersion: sync.catalogueVersion,
  };
}
