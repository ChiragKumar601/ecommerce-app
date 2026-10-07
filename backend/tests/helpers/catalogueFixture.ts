import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { syncConfig } from '../../src/seed/seedDb.js';
import { flattenTree, loadTree, withAncestors } from '../../src/seed/tree.js';

/** A small hand-written catalogue for exact listing/search/PDP assertions (plan S6 verify). */
export interface FxVariant {
  size: string;
  mrp: number; // rupees
  price: number; // rupees
  stock: number;
}
export interface FxProduct {
  id: string;
  name: string;
  brand: string;
  gender?: string;
  colour?: string;
  subtitle?: string;
  nodes: string[];
  variants: FxVariant[];
  daysAgo?: number;
  bestSeller?: boolean;
  bankOffer?: boolean;
  inclusive?: boolean;
  rating?: { count: number; avg: number };
  active?: boolean;
  styleGroup?: string;
  specs?: { key: string; value: string }[];
  sizeGuideId?: string;
}

export const FIXTURE_NOW = new Date('2026-10-07T06:30:00.000Z');
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export async function seedCatalogueFixture(db: PrismaClient, products: FxProduct[]) {
  for (const n of flattenTree(loadTree())) {
    await db.catalogueNode.create({ data: { id: n.id, type: n.type, name: n.name, slug: n.slug, path: n.path, parentId: n.parentId, displayOrder: n.displayOrder } });
  }
  await syncConfig(db);
  const brands = [...new Set(products.map((p) => p.brand))];
  await db.brand.createMany({ data: brands.map((b) => ({ id: `b-${slugify(b)}`, name: b, slug: slugify(b) })) });
  for (const p of products) {
    const nodeIds = new Set(p.nodes.flatMap((n) => withAncestors(n)));
    await db.product.create({
      data: {
        id: p.id, slug: slugify(`${p.brand} ${p.name}`), brandId: `b-${slugify(p.brand)}`, name: p.name, subtitle: p.subtitle ?? 'Regular fit',
        description: `${p.name} description.`, materialCare: 'Machine wash cold.', specifications: p.specs ?? [{ key: 'Fabric', value: 'Cotton' }],
        primarySectionId: p.nodes[0]!.split('/')[0]!, primaryNodeId: p.nodes[0]!, gender: p.gender ?? 'men', colour: p.colour ?? 'Black',
        styleGroupId: p.styleGroup ?? p.id, listingDate: new Date(FIXTURE_NOW.getTime() - (p.daysAgo ?? 30) * 86_400_000),
        bestSeller: !!p.bestSeller, bankOfferEligible: !!p.bankOffer, inclusiveSizing: !!p.inclusive, active: p.active ?? true,
        sizeGuideId: p.sizeGuideId ?? null,
        nodes: { create: [...nodeIds].map((nodeId) => ({ nodeId })) },
        images: { create: [0, 1].map((i) => ({ id: `${p.id}-img${i}`, url: `/media/placeholder/${i}.svg`, alt: `img ${i}`, order: i, source: 'test', sourcePageUrl: 'https://example.test', photographer: 'Test', licence: 'CC0' })) },
      },
    });
    for (const [i, v] of p.variants.entries()) {
      await db.variant.create({
        data: {
          id: `${p.id}-v${i}`, productId: p.id, sizeLabel: v.size, sortOrder: i, mrp: v.mrp * 100, sellingPrice: v.price * 100,
          inventory: { create: { onHand: v.stock, held: 0, baselineOnHand: v.stock } },
        },
      });
    }
    if (p.rating) {
      const sum = Math.round(p.rating.avg * p.rating.count);
      await db.ratingAggregate.create({ data: { productId: p.id, count: p.rating.count, sumRatings: sum, c1: 0, c2: 0, c3: 0, c4: 0, c5: p.rating.count } });
    }
  }
}

const tee = (id: string, over: Partial<FxProduct> = {}): FxProduct => ({
  id, name: `Tee ${id}`, brand: 'Filler Co', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'M', mrp: 999, price: 999, stock: 5 }], daysAgo: 200, ...over,
});

/** The default listing fixture: known products plus 26 fillers (so men/topwear spans two pages of 24). */
export function listingFixture(): FxProduct[] {
  const known: FxProduct[] = [
    { id: 'p-alpha', name: 'Alpha Crew Tee', brand: 'Northlane', colour: 'Black', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'S', mrp: 1999, price: 999, stock: 0 }, { size: 'M', mrp: 1999, price: 1299, stock: 4 }, { size: 'L', mrp: 1999, price: 1499, stock: 2 }], daysAgo: 1, rating: { count: 120, avg: 4.5 }, bestSeller: true, bankOffer: true },
    { id: 'p-bravo', name: 'Bravo Polo', brand: 'Northlane', colour: 'Navy', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'M', mrp: 2499, price: 2499, stock: 3 }], daysAgo: 10, rating: { count: 8, avg: 3.4 } },
    { id: 'p-charlie', name: 'Charlie Oxford Shirt', brand: 'Kestrel', colour: 'White', nodes: ['men/topwear/casual-shirts'], variants: [{ size: 'L', mrp: 3000, price: 1500, stock: 1 }], daysAgo: 5, rating: { count: 40, avg: 4.1 }, inclusive: true },
    { id: 'p-delta', name: 'Delta Slim Jeans', brand: 'Kestrel', colour: 'Blue', nodes: ['men/bottomwear/jeans', 'women/bottomwear/jeans'], gender: 'unisex', variants: [{ size: '32', mrp: 2999, price: 2099, stock: 6 }], daysAgo: 60, bankOffer: true },
    { id: 'p-echo', name: 'Echo Linen Shirt', brand: 'Northlane', colour: 'White', nodes: ['men/topwear/casual-shirts'], variants: [{ size: 'M', mrp: 1799, price: 899, stock: 0 }, { size: 'L', mrp: 1799, price: 799, stock: 0 }], daysAgo: 2, rating: { count: 300, avg: 4.8 } },
    { id: 'p-foxtrot', name: 'Foxtrot Cushion Cover', brand: 'Hearthly', colour: 'Mustard', gender: 'none', nodes: ['home/furnishings/cushions'], variants: [{ size: 'One Size', mrp: 799, price: 499, stock: 9 }], daysAgo: 3, bestSeller: true },
    { id: 'p-golf', name: 'Golf Wrap Dress', brand: 'Saffron Row', colour: 'Red', gender: 'women', nodes: ['women/dresses/casual-dresses'], variants: [{ size: 'S', mrp: 3999, price: 1199, stock: 2 }], daysAgo: 4, rating: { count: 15, avg: 3.9 } },
    { id: 'p-hotel', name: 'Hotel Retired Tee', brand: 'Northlane', colour: 'Grey', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'M', mrp: 999, price: 999, stock: 5 }], active: false },
  ];
  const fillers = Array.from({ length: 26 }, (_, i) => tee(`p-fill${String(i).padStart(2, '0')}`));
  return [...known, ...fillers];
}
