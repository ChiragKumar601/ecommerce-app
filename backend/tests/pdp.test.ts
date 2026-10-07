import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/testApp.js';
import { listingFixture, seedCatalogueFixture } from './helpers/catalogueFixture.js';

describe('product detail reads (S9.1–S9.2)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const get = (path: string) => request(t.app).get(`/api/v1${path}`);

  beforeAll(async () => {
    t = await createTestApp({
      seed: async (ctx) => {
        await seedCatalogueFixture(ctx.db, listingFixture());
        const at = (d: string) => new Date(`2026-${d}T10:00:00Z`);
        await ctx.db.review.createMany({
          data: [
            { id: 'r1', productId: 'p-alpha', authorDisplayName: 'Asha K.', rating: 5, text: 'Lovely', seeded: true, createdAt: at('10-01') },
            { id: 'r2', productId: 'p-alpha', authorDisplayName: 'Ravi M.', rating: 2, text: null, seeded: true, createdAt: at('10-03') },
            { id: 'r3', productId: 'p-alpha', authorDisplayName: 'Neha S.', rating: 4, text: 'Good fit', seeded: true, createdAt: at('10-02') },
            { id: 'r4', productId: 'p-alpha', authorDisplayName: 'Hidden H.', rating: 1, text: 'x', seeded: true, status: 'hidden', createdAt: at('10-04') },
          ],
        });
        await ctx.db.reviewImage.create({ data: { id: 'ri1', reviewId: 'r3', url: '/media/placeholder/1.svg', order: 0 } });
        await ctx.db.productCuratedRec.create({ data: { productId: 'p-alpha', kind: 'complete_the_look', targetId: 'p-delta', order: 0 } });
      },
    });
  }, 120_000);
  afterAll(async () => t.cleanup());

  it('returns the product with variants, availability and the default (lowest available) variant (PDP-002, PDP-003)', async () => {
    const r = await get('/products/p-alpha');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ active: true, name: 'Alpha Crew Tee', brand: { name: 'Northlane' }, colour: 'Black', oneSize: false });
    expect(r.body.variants.map((v: { sizeLabel: string; available: number }) => [v.sizeLabel, v.available])).toEqual([['S', 0], ['M', 4], ['L', 2]]);
    expect(r.body.defaultVariantId).toBe('p-alpha-v1');
    expect(r.body.variants[1]).toMatchObject({ price: { display: '₹1,299' }, mrp: { display: '₹1,999' }, discountPercent: 35 });
    expect(r.body.rating).toMatchObject({ average: 4.5, count: 120 });
    expect(r.body.images).toHaveLength(2);
  });

  it('offers: bank offer only when eligible; up to 3 coupons eligible for its nodes (PDP-005)', async () => {
    const alpha = (await get('/products/p-alpha')).body;
    expect(alpha.offers.bank).toMatchObject({ bankName: 'HDFC Bank' });
    expect(alpha.offers.coupons.map((c: { code: string }) => c.code)).toEqual(['FLAT200', 'WELCOME10']);
    const cushion = (await get('/products/p-foxtrot')).body;
    expect(cushion.offers.bank).toBeNull();
    expect(cushion.offers.coupons.map((c: { code: string }) => c.code)).toEqual(['WELCOME10']);
  });

  it('return eligibility line, colour siblings and breadcrumb hints (PDP-003, PDP-006, NAV-010)', async () => {
    const r = (await get('/products/p-alpha')).body;
    expect(r.returns).toEqual({ returnable: true, windowDays: 14, text: 'Easy 14-day returns' });
    expect(r.colours.map((c: { colour: string; current: boolean }) => [c.colour, c.current])).toEqual([['Black', true], ['Navy', false]]);
    expect(r.breadcrumbs.primary.map((c: { label: string }) => c.label)).toEqual(['Men', 'Topwear', 'T-Shirts']);
    expect(r.breadcrumbs.nodes).toContainEqual({ path: 'men/topwear/t-shirts', label: 'T-Shirts', href: '/men/topwear/t-shirts' });
    const delta = (await get('/products/p-delta')).body.breadcrumbs.nodes.map((n: { path: string }) => n.path);
    expect(delta).toEqual(expect.arrayContaining(['men/bottomwear/jeans', 'women/bottomwear/jeans', 'women']));
  });

  it('an inactive product is reported as unavailable without purchase data; unknown ids are NOT_FOUND (PDP-013)', async () => {
    const r = await get('/products/p-hotel');
    expect(r.status).toBe(200);
    expect(r.body.active).toBe(false);
    expect(r.body.variants).toBeUndefined();
    expect((await get('/products/nope')).status).toBe(404);
    expect((await get('/products/BAD!')).status).toBe(422);
    const recs = await get('/products/p-hotel/recommendations');
    expect(recs.status).toBe(200);
    expect(recs.body.similar.length).toBeGreaterThan(0);
  });

  it('recommendations: similar within ±30% in the same subcategory, related, curated (PDP-011)', async () => {
    const r = (await get('/products/p-alpha/recommendations')).body;
    // Alpha's card price ₹1,299 → ₹909–₹1,689: fillers (₹999), not Bravo (₹2,499).
    expect(r.similar.length).toBeGreaterThan(0);
    expect(r.similar.every((c: { price: { paise: number } }) => c.price.paise >= 90930 && c.price.paise <= 168870)).toBe(true);
    expect(r.similar.some((c: { id: string }) => c.id === 'p-alpha' || c.id === 'p-bravo')).toBe(false);
    expect(r.similar.length).toBeLessThanOrEqual(12);
    expect(r.related.some((c: { id: string }) => c.id === 'p-bravo')).toBe(true);
    expect(r.completeTheLook.map((c: { id: string }) => c.id)).toEqual(['p-delta']);
    expect(r.boughtTogether).toEqual([]);
  });

  it('reviews: visible only, sorts and filters (REV-001, REV-002)', async () => {
    const recent = (await get('/products/p-alpha/reviews')).body;
    expect(recent.items.map((x: { id: string }) => x.id)).toEqual(['r2', 'r3', 'r1']);
    expect(recent.totalCount).toBe(3);
    expect(recent.items[0].date).toBe('Sat, 3 Oct 2026');
    expect((await get('/products/p-alpha/reviews?sort=highest')).body.items[0].id).toBe('r1');
    expect((await get('/products/p-alpha/reviews?sort=lowest')).body.items[0].id).toBe('r2');
    expect((await get('/products/p-alpha/reviews?rating=4')).body.items.map((x: { id: string }) => x.id)).toEqual(['r3']);
    expect((await get('/products/p-alpha/reviews?withImages=1')).body.items[0].images).toHaveLength(1);
    expect((await get('/products/p-alpha/reviews?rating=9')).status).toBe(422);
  });

  it('pincode check: delivery date by zone in IST, unserviceable message, validation (PDP-007)', async () => {
    expect((await get('/pincode/110001')).body).toMatchObject({ serviceable: true, deliveryDate: '2026-10-09', message: 'Delivery by Fri, 9 Oct 2026', rule: 'Free delivery on orders above ₹1,999' });
    expect((await get('/pincode/999999')).body).toEqual({ pincode: '999999', serviceable: false, message: "Sorry, we don't deliver to 999999 yet" });
    expect((await get('/pincode/012345')).status).toBe(422);
    expect((await get('/pincode/12345')).status).toBe(422);
  });
});
