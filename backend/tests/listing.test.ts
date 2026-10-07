import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListingResponse } from '@app/shared';
import { createTestApp } from './helpers/testApp.js';
import { listingFixture, seedCatalogueFixture } from './helpers/catalogueFixture.js';

describe('ListProducts (S6.1–S6.4)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const list = async (query: Record<string, string>) => {
    const res = await request(t.app).get('/api/v1/products').query(query);
    return res as Omit<typeof res, 'body'> & { body: ListingResponse };
  };
  const ids = (r: { body: ListingResponse }) => r.body.items.map((i) => i.id);

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => seedCatalogueFixture(ctx.db, listingFixture()) });
  }, 120_000);
  afterAll(async () => t.cleanup());

  describe('scopes', () => {
    it('section scope counts active products including mirrored ones, never inactive (PLP-001, PLP-005)', async () => {
      const r = await list({ scope: 'node', node: 'men' });
      expect(r.status).toBe(200);
      expect(r.body.totalCount).toBe(31);
      expect(r.body.scope).toMatchObject({ kind: 'section', title: 'Men', section: 'men' });
      const women = await list({ scope: 'node', node: 'women' });
      expect(ids(women).sort()).toEqual(['p-delta', 'p-golf']);
      expect(r.body.items.some((i) => i.id === 'p-hotel')).toBe(false);
    });

    it('category and subcategory scopes, with breadcrumbs from the tree', async () => {
      const cat = await list({ scope: 'node', node: 'men/topwear' });
      expect(cat.body.totalCount).toBe(30);
      expect(cat.body.scope.kind).toBe('category');
      const sub = await list({ scope: 'node', node: 'men/topwear/t-shirts' });
      expect(sub.body.totalCount).toBe(28);
      expect(sub.body.scope.breadcrumbs).toEqual([
        { label: 'Home', href: '/' }, { label: 'Men', href: '/shop/men' }, { label: 'Topwear', href: '/men/topwear' }, { label: 'T-Shirts' },
      ]);
    });

    it('unknown slugs are NOT_FOUND; malformed paths fail validation (GLB-005)', async () => {
      expect((await list({ scope: 'node', node: 'men/nope' })).status).toBe(404);
      expect((await list({ scope: 'node', node: '../etc' })).status).toBe(422);
      expect((await list({ scope: 'node' })).status).toBe(422);
      expect((await list({ scope: 'all', sort: 'cheapest' })).status).toBe(422);
    });

    it('best-seller and inclusive-sizing listings (PLP-015)', async () => {
      expect(ids(await list({ scope: 'best-seller' })).sort()).toEqual(['p-alpha', 'p-foxtrot']);
      expect(ids(await list({ scope: 'all', inclusiveSizing: '1' }))).toEqual(['p-charlie']);
    });

    it('all-products narrowed to a node list, titled from the nodes; unknown ids ignored', async () => {
      const r = await list({ scope: 'all', nodes: 'men/bottomwear,women/dresses,nope/x' });
      expect(ids(r).sort()).toEqual(['p-delta', 'p-golf']);
      expect(r.body.scope.title).toBe('Bottomwear, Dresses');
      expect((await list({ scope: 'all', nodes: 'nope/x' })).body.totalCount).toBe(33);
    });

    it('bank-offer listing applies the eligibility filter as a removable chip (LND-004, PLP-006)', async () => {
      const on = await list({ scope: 'bank-offer' });
      expect(on.body.applied.bankOffer).toBe(true);
      expect(ids(on).sort()).toEqual(['p-alpha', 'p-delta']);
      const off = await list({ scope: 'bank-offer', bankOffer: '0' });
      expect(off.body.applied.bankOffer).toBe(false);
      expect(off.body.totalCount).toBe(33);
    });
  });

  describe('pagination (PLP-007, API-004)', () => {
    it('pages of 24 with an opaque cursor, no overlap, null at the end', async () => {
      const p1 = await list({ scope: 'node', node: 'men/topwear' });
      expect(p1.body.items).toHaveLength(24);
      expect(p1.body.nextCursor).toBeTruthy();
      const p2 = await list({ scope: 'node', node: 'men/topwear', cursor: p1.body.nextCursor! });
      expect(p2.body.items).toHaveLength(6);
      expect(p2.body.nextCursor).toBeNull();
      expect(new Set([...ids(p1), ...ids(p2)]).size).toBe(30);
    });

    it('rejects a forged cursor', async () => {
      expect((await list({ scope: 'all', cursor: 'not-a-cursor' })).status).toBe(422);
    });
  });

  describe('card data (PLP-011…013)', () => {
    it('prices from the lowest-priced available variant; discount floor; rating hidden without reviews', async () => {
      const r = await list({ scope: 'node', node: 'men' });
      const alpha = r.body.items.find((i) => i.id === 'p-alpha')!;
      expect(alpha.price).toEqual({ paise: 129900, display: '₹1,299' });
      expect(alpha.mrp.display).toBe('₹1,999');
      expect(alpha.discountPercent).toBe(35);
      expect(alpha.rating).toEqual({ average: 4.5, count: 120 });
      expect(alpha.href).toBe('/p/northlane-alpha-crew-tee-p-alpha');
      expect(alpha.image?.alt).toBe('Northlane Alpha Crew Tee, Black');
      const delta = r.body.items.find((i) => i.id === 'p-delta')!;
      expect(delta.rating).toBeNull();
    });

    it('a fully out-of-stock product uses its lowest-priced variant and is flagged', async () => {
      const r = await list({ scope: 'node', node: 'men/topwear/casual-shirts' });
      const echo = r.body.items.find((i) => i.id === 'p-echo')!;
      expect(echo.outOfStock).toBe(true);
      expect(echo.price.display).toBe('₹799');
      expect(echo.discountPercent).toBe(55);
    });
  });

  describe('filters (PLP-002)', () => {
    it('brand, colour, gender and category', async () => {
      expect(ids(await list({ scope: 'node', node: 'men', brand: 'northlane' })).sort()).toEqual(['p-alpha', 'p-bravo', 'p-echo']);
      expect(ids(await list({ scope: 'node', node: 'men', colour: 'White' })).sort()).toEqual(['p-charlie', 'p-echo']);
      expect(ids(await list({ scope: 'all', gender: 'women,unisex' })).sort()).toEqual(['p-delta', 'p-golf']);
      expect(ids(await list({ scope: 'node', node: 'men', category: 'men/bottomwear' }))).toEqual(['p-delta']);
    });

    it('size matches only variants with stock', async () => {
      expect((await list({ scope: 'node', node: 'men/topwear/t-shirts', size: 'S' })).body.totalCount).toBe(0);
      expect((await list({ scope: 'node', node: 'men/topwear/t-shirts', size: 'L' })).body.items.map((i) => i.id)).toEqual(['p-alpha']);
    });

    it('price range (rupees, on the card price), discount bucket, rating and in-stock', async () => {
      expect(ids(await list({ scope: 'node', node: 'men', priceMin: '1000', priceMax: '2000' })).sort()).toEqual(['p-alpha', 'p-charlie']);
      expect(ids(await list({ scope: 'node', node: 'men', discount: '50' })).sort()).toEqual(['p-charlie', 'p-echo']);
      expect(ids(await list({ scope: 'node', node: 'men', rating: '4' })).sort()).toEqual(['p-alpha', 'p-charlie', 'p-echo']);
      const inStock = await list({ scope: 'node', node: 'men', inStock: '1' });
      expect(inStock.body.totalCount).toBe(30);
      expect(inStock.body.items.some((i) => i.outOfStock)).toBe(false);
      expect((await list({ scope: 'all', discount: '15' })).status).toBe(422);
    });
  });

  describe('facets', () => {
    it('counts each facet ignoring its own selection (disjunctive)', async () => {
      const r = await list({ scope: 'node', node: 'men', brand: 'northlane' });
      const brand = Object.fromEntries(r.body.facets.brand!.map((b) => [b.label, b.count]));
      expect(brand).toEqual({ 'Filler Co': 26, Northlane: 3, Kestrel: 2 });
      // Other facets respect the brand selection.
      expect(r.body.facets.inStock).toEqual({ count: 2 });
      expect(r.body.labels['brand:northlane']).toBe('Northlane');
    });

    it('discount buckets, rating buckets, price bounds and categories within the scope', async () => {
      const f = (await list({ scope: 'node', node: 'men' })).body.facets;
      expect(f.discount!.map((d) => [d.value, d.count])).toEqual([['10', 4], ['20', 4], ['30', 4], ['40', 2], ['50', 2]]);
      expect(f.rating!.map((d) => [d.value, d.count])).toEqual([['4', 3], ['3', 4]]);
      expect(f.price).toEqual({ min: 799, max: 2499 });
      expect(f.category!.map((c) => [c.label, c.count])).toEqual([['Topwear', 30], ['Bottomwear', 1]]);
      expect(f.size!.map((s) => s.value)).toEqual(['M', 'L', '32']);
    });

    it('hides facets with no values in scope (gender on Home)', async () => {
      const f = (await list({ scope: 'node', node: 'home' })).body.facets;
      expect(f.gender).toBeUndefined();
      expect(f.rating).toBeUndefined();
      expect(f.brand).toHaveLength(1);
    });
  });

  describe('sorts (PLP-003, PLP-004)', () => {
    const scope = { scope: 'node', node: 'men' };
    it('price, newest, discount and rating, with out-of-stock always last', async () => {
      const asc = (await list({ ...scope, sort: 'price_asc' })).body.items;
      expect(asc.at(-1)?.id === 'p-echo' || asc.every((i) => !i.outOfStock)).toBe(true);
      const all = async (sort: string) => {
        const p1 = await list({ ...scope, sort });
        const p2 = await list({ ...scope, sort, cursor: p1.body.nextCursor! });
        return [...p1.body.items, ...p2.body.items];
      };
      const a = await all('price_asc');
      expect(a.at(-1)!.id).toBe('p-echo');
      const prices = a.slice(0, -1).map((i) => i.price.paise);
      expect(prices).toEqual([...prices].sort((x, y) => x - y));
      const d = await all('price_desc');
      expect(d[0]!.id).toBe('p-bravo');
      expect(d.at(-1)!.id).toBe('p-echo');
      expect((await all('new')).slice(0, 4).map((i) => i.id)).toEqual(['p-alpha', 'p-charlie', 'p-bravo', 'p-delta']);
      expect((await all('discount')).slice(0, 3).map((i) => i.id)).toEqual(['p-charlie', 'p-alpha', 'p-delta']);
      const byRating = await all('rating');
      expect(byRating.slice(0, 3).map((i) => i.id)).toEqual(['p-alpha', 'p-charlie', 'p-bravo']);
      expect(byRating.at(-1)!.id).toBe('p-echo');
    });

    it('Recommended (default) ranks the well-rated, recent product first', async () => {
      const r = await list(scope);
      expect(r.body.items[0]!.id).toBe('p-alpha');
    });
  });

  describe('carry-over pruning (PLP-009)', () => {
    it('drops filter values that have no matches in the new scope', async () => {
      const r = await list({ scope: 'node', node: 'women', brand: 'northlane,kestrel', size: 'XXL', priceMin: '90000', prune: '1' });
      expect(r.body.applied.brand).toEqual(['kestrel']);
      expect(r.body.applied.size).toEqual([]);
      expect(r.body.applied.priceMin).toBeUndefined();
      expect(ids(r)).toEqual(['p-delta']);
    });
  });

  it('sets a short public cache header', async () => {
    expect((await list({ scope: 'all' })).headers['cache-control']).toBe('public, max-age=5');
  });
});
