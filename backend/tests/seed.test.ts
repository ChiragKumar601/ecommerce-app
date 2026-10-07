import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateCatalogue, MIN_PER_CATEGORY, MIN_PER_SUBCATEGORY } from '../src/seed/catalogue/generate.js';
import { generateReviews } from '../src/seed/catalogue/reviews.js';
import { seedAll, syncConfig } from '../src/seed/seedDb.js';
import { flattenTree, loadTree } from '../src/seed/tree.js';
import { verifySeed } from '../src/seed/verify.js';
import { createTestDb } from './helpers/testDb.js';

describe('catalogue generator (S3.8–S3.9)', () => {
  const nodes = flattenTree(loadTree());
  const a = generateCatalogue(nodes);

  it('is deterministic: the same ids, names and prices every run', () => {
    const b = generateCatalogue(nodes);
    expect(b.products.map((p) => `${p.id}|${p.name}|${p.variants[0]!.sellingPrice}`)).toEqual(
      a.products.map((p) => `${p.id}|${p.name}|${p.variants[0]!.sellingPrice}`),
    );
    expect(generateReviews(b.products).length).toBe(generateReviews(a.products).length);
  });

  it('meets the D-44 minimums: ≥ 6 per subcategory, ≥ 48 per category', () => {
    const count = (id: string) => a.products.filter((p) => p.nodeIds.has(id)).length;
    for (const n of nodes) {
      if (n.type === 'subcategory') expect(count(n.id), n.id).toBeGreaterThanOrEqual(MIN_PER_SUBCATEGORY);
      if (n.type === 'category') expect(count(n.id), n.id).toBeGreaterThanOrEqual(MIN_PER_CATEGORY);
    }
  });

  it('produces valid prices, unique ids and slugs, and fictional brands', () => {
    expect(new Set(a.products.map((p) => p.id)).size).toBe(a.products.length);
    expect(new Set(a.products.map((p) => p.slug)).size).toBe(a.products.length);
    for (const p of a.products) {
      for (const v of p.variants) {
        expect(v.sellingPrice).toBeGreaterThan(0);
        expect(v.sellingPrice).toBeLessThanOrEqual(v.mrp);
        expect(v.mrp % 100).toBe(0);
      }
    }
    expect(a.brands).not.toContain('Nike');
  });

  it('includes some fully out-of-stock products and colour siblings sharing a style group', () => {
    expect(a.products.some((p) => p.variants.every((v) => v.onHand === 0))).toBe(true);
    const groups = new Map<string, number>();
    for (const p of a.products) groups.set(p.styleGroupId, (groups.get(p.styleGroupId) ?? 0) + 1);
    expect([...groups.values()].some((n) => n > 1)).toBe(true);
  });

  it('lists mirrored products in their extra sections with ancestors (T-29)', () => {
    const inWomenBottomwear = a.products.filter((p) => p.nodeIds.has('women/bottomwear/jeans'));
    expect(inWomenBottomwear.length).toBeGreaterThan(0);
    expect(inWomenBottomwear.every((p) => p.primaryNodeId === 'women/western-wear/jeans' && p.nodeIds.has('women/bottomwear') && p.nodeIds.has('women'))).toBe(true);
  });
});

describe('seeding the database (S3.13)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    ctx = await createTestDb();
    await seedAll(ctx.db);
  }, 120_000);
  afterAll(async () => ctx.cleanup());

  it('passes the seed verifier with no errors', async () => {
    const r = await verifySeed(ctx.db);
    expect(r.errors).toEqual([]);
    expect(r.stats['products']).toBeGreaterThan(2000);
  }, 60_000);

  it('derives returnability from the return policy (R-17)', async () => {
    const beauty = await ctx.db.product.findFirst({ where: { primarySectionId: 'beauty' } });
    const tee = await ctx.db.product.findFirst({ where: { primaryNodeId: 'men/topwear/t-shirts' } });
    const briefs = await ctx.db.product.findFirst({ where: { primaryNodeId: 'men/innerwear/briefs' } });
    expect(beauty?.returnable).toBe(false);
    expect(briefs?.returnable).toBe(false);
    expect(tee?.returnable).toBe(true);
  });

  it('stores tax rates and config values from spec §5', async () => {
    expect((await ctx.db.taxRate.findUnique({ where: { nodeId: 'beauty' } }))?.ratePercent).toBe(18);
    expect((await ctx.db.taxRate.findUnique({ where: { nodeId: 'women/jewellery' } }))?.ratePercent).toBe(3);
    expect((await ctx.db.setting.findUnique({ where: { key: 'delivery.freeThreshold' } }))?.value).toBe(199900);
    expect((await ctx.db.coupon.findUnique({ where: { code: 'WELCOME10' } }))?.maxDiscount).toBe(30000);
    expect((await ctx.db.bankOffer.findUnique({ where: { id: 'hdfc' } }))?.minEligibleValue).toBe(250000);
  });

  it('config:sync is repeatable and bumps the catalogue version (PR-22)', async () => {
    const before = await ctx.db.setting.findUnique({ where: { key: 'catalogue_version' } });
    const first = await syncConfig(ctx.db);
    const second = await syncConfig(ctx.db);
    expect(second.catalogueVersion).toBe(first.catalogueVersion + 1);
    expect(first.catalogueVersion).toBe(Number(before?.value) + 1);
    expect(await ctx.db.coupon.count()).toBe(4);
    expect(await ctx.db.faqEntry.count()).toBe(16);
  }, 60_000);
});
