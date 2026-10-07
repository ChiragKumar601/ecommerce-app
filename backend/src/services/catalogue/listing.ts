import type { AppliedFilters, FacetValue, ListingFacets, ListingQuery, ListingResponse, ListingScopeInfo, ProductCardData } from '@app/shared';
import { DISCOUNT_BUCKETS, RATING_BUCKETS } from '@app/shared';
import type { AppContext } from '../../api/context.js';
import { discountPercent } from '../../domain/catalogue/discount.js';
import { recommendedScore } from '../../domain/catalogue/sortScore.js';
import { AppError } from '../../domain/errors.js';
import { money } from '../../domain/money.js';
import { ancestry, getDynamic, getSnapshot, type CatalogueSnapshot, type Rating, type SnapNode, type SnapProduct } from './snapshot.js';

// ListProducts (spec §11.2; PLP-001…015). Scope → filters → facets → sort → page.

export const GENDER_LABELS: Record<string, string> = { men: 'Men', women: 'Women', boys: 'Boys', girls: 'Girls', unisex: 'Unisex', infant: 'Infants' };

/** Per-request derived card values. */
export interface Derived {
  p: SnapProduct;
  /** Lowest-priced available variant, or the lowest-priced variant when none is available (SD-32). */
  price: number;
  mrp: number;
  discount: number;
  inStock: boolean;
  rating: Rating | undefined;
  average: number;
  availableSizes: Set<string>;
}

export function derive(p: SnapProduct, available: Map<string, number>, ratings: Map<string, Rating>): Derived {
  let best: SnapProduct['variants'][number] | undefined;
  let bestAny: SnapProduct['variants'][number] | undefined;
  const availableSizes = new Set<string>();
  for (const v of p.variants) {
    const a = available.get(v.id) ?? 0;
    if (a > 0) {
      availableSizes.add(v.sizeLabel);
      if (!best || v.sellingPrice < best.sellingPrice) best = v;
    }
    if (!bestAny || v.sellingPrice < bestAny.sellingPrice) bestAny = v;
  }
  const card = best ?? bestAny!;
  const rating = ratings.get(p.id);
  return {
    p, price: card.sellingPrice, mrp: card.mrp, discount: discountPercent(card.mrp, card.sellingPrice), inStock: !!best,
    rating, average: rating ? Math.round((rating.sum / rating.count) * 10) / 10 : 0, availableSizes,
  };
}

export function toCard(d: Derived): ProductCardData {
  const [img, hover] = d.p.images;
  return {
    id: d.p.id, slug: d.p.slug, href: d.p.href, brand: d.p.brandName, name: d.p.name, subtitle: d.p.subtitle,
    // Alt describes the product, not the stock photo's original caption (FE-004).
    image: img ? { url: img.url, alt: `${d.p.brandName} ${d.p.name}, ${d.p.colour}` } : null,
    hoverImage: hover ? { url: hover.url, alt: '' } : null,
    price: money(d.price), mrp: money(d.mrp), discountPercent: d.discount,
    rating: d.rating ? { average: d.average, count: d.rating.count } : null,
    outOfStock: !d.inStock,
  };
}

/** Size facet ordering: letter sizes, waist, shoe, kids' ages, baby months, bra, bed, volume, then one-size labels. */
const LETTER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
export function sizeRank(label: string): [number, number, string] {
  const l = label.trim();
  const letter = LETTER.indexOf(l.toUpperCase());
  if (letter >= 0) return [0, letter, l];
  if (/^\d{2}$/.test(l)) return [1, Number(l), l];
  const uk = /^UK (\d+)(C?)$/i.exec(l);
  if (uk) return [2, (uk[2] ? 0 : 100) + Number(uk[1]), l];
  const yrs = /^(\d+)-(\d+)Y$/i.exec(l);
  if (yrs) return [3, Number(yrs[1]), l];
  if (l === 'NB') return [4, -1, l];
  const mo = /^(\d+)-(\d+)M$/i.exec(l);
  if (mo) return [4, Number(mo[1]), l];
  const bra = /^(\d{2})([A-F])$/.exec(l);
  if (bra) return [5, Number(bra[1]) * 10 + bra[2]!.charCodeAt(0), l];
  const bed = ['Single', 'Double', 'Queen', 'King'].indexOf(l);
  if (bed >= 0) return [6, bed, l];
  const ml = /^(\d+) ?ml$/i.exec(l);
  if (ml) return [7, Number(ml[1]), l];
  return [8, 0, l];
}
const bySize = (a: string, b: string) => {
  const x = sizeRank(a);
  const y = sizeRank(b);
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
};

type FacetKey = 'gender' | 'category' | 'brand' | 'colour' | 'size' | 'price' | 'discount' | 'rating' | 'inStock' | 'bankOffer' | 'inclusiveSizing';
type Predicate = (d: Derived) => boolean;

interface ResolvedScope {
  info: ListingScopeInfo;
  base: SnapProduct[];
  /** Nodes offered by the category facet. */
  categoryNodes: SnapNode[];
  bankOfferDefault: boolean;
}

function resolveScope(snap: CatalogueSnapshot, q: ListingQuery, searchIds?: string[]): ResolvedScope {
  const home = { label: 'Home', href: '/' };
  const categories = () => [...snap.nodes.values()].filter((n) => n.type === 'category');
  switch (q.scope) {
    case 'node': {
      const node = snap.nodeByPath.get(q.node!);
      if (!node) throw new AppError('NOT_FOUND');
      const chain = ancestry(snap, node.id);
      const children = [...snap.nodes.values()].filter((n) => n.parentId === node.id);
      return {
        info: {
          kind: node.type as 'section' | 'category' | 'subcategory',
          title: node.name,
          section: chain[0]!.slug,
          node: { id: node.id, name: node.name, path: node.path, type: node.type },
          breadcrumbs: [home, ...chain.map((n, i) => (i === chain.length - 1 ? { label: n.name } : { label: n.name, href: n.href }))],
        },
        base: snap.products.filter((p) => p.nodeIds.has(node.id)),
        categoryNodes: children,
        bankOfferDefault: false,
      };
    }
    case 'best-seller':
      return {
        info: { kind: 'best-seller', title: 'Best Seller Styles', section: null, breadcrumbs: [home, { label: 'Best Seller Styles' }] },
        base: snap.products.filter((p) => p.bestSeller),
        categoryNodes: categories(),
        bankOfferDefault: false,
      };
    case 'bank-offer':
      return {
        info: { kind: 'bank-offer', title: 'HDFC Bank Offer', section: null, breadcrumbs: [home, { label: 'HDFC Bank Offer' }] },
        base: snap.products,
        categoryNodes: categories(),
        bankOfferDefault: true,
      };
    case 'search': {
      const ids = searchIds ?? [];
      return {
        info: { kind: 'search', title: `Search: ${q.q}`, section: null, breadcrumbs: [home, { label: `Search results for "${q.q}"` }], q: q.q },
        base: ids.map((id) => snap.byId.get(id)).filter((p): p is SnapProduct => !!p),
        categoryNodes: categories(),
        bankOfferDefault: false,
      };
    }
    default: {
      // Optional node list narrows "all" (merchandising links); unknown ids are ignored.
      const picked = q.nodes.map((id) => snap.nodes.get(id)).filter((n): n is SnapNode => !!n);
      const title = picked.length
        ? picked.length <= 3 ? picked.map((n) => n.name).join(', ') : `${picked.slice(0, 2).map((n) => n.name).join(', ')} and more`
        : 'All products';
      return {
        info: { kind: 'all', title, section: null, breadcrumbs: [home, { label: title }] },
        base: picked.length ? snap.products.filter((p) => picked.some((n) => p.nodeIds.has(n.id))) : snap.products,
        categoryNodes: categories(),
        bankOfferDefault: false,
      };
    }
  }
}

const PAGE_SIZE_FALLBACK = 24;

function decodeCursor(c: string | undefined): number {
  if (!c) return 0;
  const n = Number(Buffer.from(c, 'base64url').toString('utf8'));
  if (!Number.isInteger(n) || n < 0) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'cursor', code: 'invalid', message: 'Invalid page.' }] });
  return n;
}
const encodeCursor = (n: number) => Buffer.from(String(n)).toString('base64url');

export interface ListOptions {
  /** Search scope: matched product ids with a relevance score (higher first). Stage 8. */
  search?: { ids: string[]; relevance: Map<string, number> };
}

export async function listProducts(ctx: AppContext, q: ListingQuery, opts: ListOptions = {}): Promise<ListingResponse> {
  const snap = await getSnapshot(ctx);
  const dyn = await getDynamic(ctx);
  const scope = resolveScope(snap, q, opts.search?.ids);
  const nodeLabel = (n: SnapNode) => {
    if (scope.info.node) return n.name;
    const section = n.parentId ? snap.nodes.get(n.parentId) : undefined;
    return section ? `${n.name} (${section.name})` : n.name;
  };

  const all = scope.base.map((p) => derive(p, dyn.available, dyn.ratings));

  // ── Applied filters (optionally pruned to values that exist in this scope — PLP-009).
  const applied: AppliedFilters = {
    gender: q.gender, category: q.category, brand: q.brand, colour: q.colour, size: q.size,
    priceMin: q.priceMin, priceMax: q.priceMax, discount: q.discount, rating: q.rating,
    inStock: q.inStock, bankOffer: scope.bankOfferDefault ? q.bankOffer !== '0' : false, inclusiveSizing: q.inclusiveSizing,
  };
  const categoryIds = new Set(scope.categoryNodes.map((n) => n.id));
  applied.category = applied.category.filter((c) => categoryIds.has(c));
  if (q.prune) {
    const has = (pick: (d: Derived) => Iterable<string>) => {
      const s = new Set<string>();
      for (const d of all) for (const v of pick(d)) s.add(v);
      return s;
    };
    const brands = has((d) => [d.p.brandSlug]);
    const colours = has((d) => [d.p.colour]);
    const sizes = has((d) => d.availableSizes);
    const genders = has((d) => [d.p.gender]);
    const cats = has((d) => [...d.p.nodeIds].filter((id) => categoryIds.has(id)));
    applied.brand = applied.brand.filter((v) => brands.has(v));
    applied.colour = applied.colour.filter((v) => colours.has(v));
    applied.size = applied.size.filter((v) => sizes.has(v));
    applied.gender = applied.gender.filter((v) => genders.has(v));
    applied.category = applied.category.filter((v) => cats.has(v));
    const prices = all.map((d) => d.price);
    const lo = Math.floor(Math.min(...prices) / 100);
    const hi = Math.ceil(Math.max(...prices) / 100);
    if (!prices.length || (applied.priceMin ?? 0) > hi || (applied.priceMax ?? Infinity) < lo) {
      applied.priceMin = undefined;
      applied.priceMax = undefined;
    }
    if (applied.discount && !all.some((d) => d.discount >= applied.discount!)) applied.discount = undefined;
    if (applied.rating && !all.some((d) => d.rating && d.average >= applied.rating!)) applied.rating = undefined;
    if (applied.inStock && !all.some((d) => d.inStock)) applied.inStock = false;
  }

  // ── Predicates, one per facet.
  const preds = new Map<FacetKey, Predicate>();
  const setOf = (xs: string[]) => new Set(xs);
  if (applied.gender.length) {
    const s = setOf(applied.gender);
    preds.set('gender', (d) => s.has(d.p.gender));
  }
  if (applied.category.length) {
    const s = applied.category;
    preds.set('category', (d) => s.some((id) => d.p.nodeIds.has(id)));
  }
  if (applied.brand.length) {
    const s = setOf(applied.brand);
    preds.set('brand', (d) => s.has(d.p.brandSlug));
  }
  if (applied.colour.length) {
    const s = setOf(applied.colour);
    preds.set('colour', (d) => s.has(d.p.colour));
  }
  if (applied.size.length) {
    const s = applied.size;
    preds.set('size', (d) => s.some((x) => d.availableSizes.has(x)));
  }
  if (applied.priceMin !== undefined || applied.priceMax !== undefined) {
    const lo = (applied.priceMin ?? 0) * 100;
    const hi = applied.priceMax !== undefined ? applied.priceMax * 100 : Infinity;
    preds.set('price', (d) => d.price >= lo && d.price <= hi);
  }
  if (applied.discount) {
    const n = applied.discount;
    preds.set('discount', (d) => d.discount >= n);
  }
  if (applied.rating) {
    const n = applied.rating;
    preds.set('rating', (d) => !!d.rating && d.average >= n);
  }
  if (applied.inStock) preds.set('inStock', (d) => d.inStock);
  if (applied.bankOffer) preds.set('bankOffer', (d) => d.p.bankOfferEligible);
  if (applied.inclusiveSizing) preds.set('inclusiveSizing', (d) => d.p.inclusiveSizing);

  const passes = (d: Derived, except?: FacetKey) => {
    for (const [k, fn] of preds) if (k !== except && !fn(d)) return false;
    return true;
  };
  const without = (k: FacetKey) => all.filter((d) => passes(d, k));

  // ── Facets (disjunctive counts: each facet ignores its own selection — PLP-002).
  const facets: ListingFacets = {};
  const countValues = (rows: Derived[], pick: (d: Derived) => Iterable<string>) => {
    const m = new Map<string, number>();
    for (const d of rows) for (const v of new Set(pick(d))) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };
  const listFacet = (counts: Map<string, number>, selected: string[], label: (v: string) => string, order: (a: FacetValue, b: FacetValue) => number) => {
    for (const s of selected) if (!counts.has(s)) counts.set(s, 0);
    const vals = [...counts].map(([value, count]) => ({ value, label: label(value), count })).sort(order);
    return vals.some((v) => v.count > 0) ? vals : undefined;
  };
  const byCount = (a: FacetValue, b: FacetValue) => b.count - a.count || a.label.localeCompare(b.label);

  const brandNames = new Map(all.map((d) => [d.p.brandSlug, d.p.brandName]));
  facets.gender = listFacet(
    countValues(without('gender'), (d) => (d.p.gender in GENDER_LABELS ? [d.p.gender] : [])),
    applied.gender, (v) => GENDER_LABELS[v] ?? v,
    (a, b) => Object.keys(GENDER_LABELS).indexOf(a.value) - Object.keys(GENDER_LABELS).indexOf(b.value),
  );
  if (scope.categoryNodes.length) {
    const order = new Map(scope.categoryNodes.map((n, i) => [n.id, i]));
    facets.category = listFacet(
      countValues(without('category'), (d) => [...d.p.nodeIds].filter((id) => categoryIds.has(id))),
      applied.category, (v) => nodeLabel(snap.nodes.get(v)!), (a, b) => order.get(a.value)! - order.get(b.value)!,
    );
  }
  facets.brand = listFacet(countValues(without('brand'), (d) => [d.p.brandSlug]), applied.brand, (v) => brandNames.get(v) ?? v, byCount);
  facets.colour = listFacet(countValues(without('colour'), (d) => [d.p.colour]), applied.colour, (v) => v, byCount);
  facets.size = listFacet(countValues(without('size'), (d) => d.availableSizes), applied.size, (v) => v, (a, b) => bySize(a.value, b.value));
  const discRows = without('discount');
  facets.discount = listFacet(
    new Map(DISCOUNT_BUCKETS.map((b) => [String(b), discRows.filter((d) => d.discount >= b).length] as const).filter(([, c]) => c > 0)),
    applied.discount ? [String(applied.discount)] : [], (v) => `${v}% and above`, (a, b) => Number(a.value) - Number(b.value),
  );
  const rateRows = without('rating');
  facets.rating = listFacet(
    new Map(RATING_BUCKETS.map((b) => [String(b), rateRows.filter((d) => d.rating && d.average >= b).length] as const).filter(([, c]) => c > 0)),
    applied.rating ? [String(applied.rating)] : [], (v) => `${v}★ & above`, (a, b) => Number(b.value) - Number(a.value),
  );
  const priceRows = without('price');
  if (priceRows.length) {
    let lo = Infinity;
    let hi = 0;
    for (const d of priceRows) {
      lo = Math.min(lo, d.price);
      hi = Math.max(hi, d.price);
    }
    facets.price = { min: Math.floor(lo / 100), max: Math.ceil(hi / 100) };
  }
  const stockCount = without('inStock').filter((d) => d.inStock).length;
  if (stockCount > 0) facets.inStock = { count: stockCount };
  for (const k of Object.keys(facets) as (keyof ListingFacets)[]) if (facets[k] === undefined) delete facets[k];

  // ── Results, sorted; out-of-stock always last (PLP-004).
  const rows = all.filter((d) => passes(d));
  const now = ctx.clock.now();
  const score = new Map<string, number>();
  if (q.sort === 'recommended') {
    for (const d of rows) {
      score.set(d.p.id, recommendedScore(
        { averageRating: d.rating ? d.rating.sum / d.rating.count : 0, ratingCount: d.rating?.count ?? 0, listingDate: new Date(d.p.listingDate) },
        { now, globalMeanRating: dyn.globalMean, maxRatingCount: dyn.maxCount },
      ));
    }
  }
  const rel = opts.search?.relevance;
  const cmp: (a: Derived, b: Derived) => number = {
    recommended: (a: Derived, b: Derived) => (rel ? (rel.get(b.p.id) ?? 0) - (rel.get(a.p.id) ?? 0) : 0) || score.get(b.p.id)! - score.get(a.p.id)!,
    new: (a: Derived, b: Derived) => b.p.listingDate - a.p.listingDate,
    price_asc: (a: Derived, b: Derived) => a.price - b.price,
    price_desc: (a: Derived, b: Derived) => b.price - a.price,
    discount: (a: Derived, b: Derived) => b.discount - a.discount,
    rating: (a: Derived, b: Derived) => b.average - a.average || (b.rating?.count ?? 0) - (a.rating?.count ?? 0),
  }[q.sort];
  rows.sort((a, b) => Number(b.inStock) - Number(a.inStock) || cmp(a, b) || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0));

  const pageSize = await ctx.settings.get<number>('listing.pageSize', PAGE_SIZE_FALLBACK);
  const offset = decodeCursor(q.cursor);
  const page = rows.slice(offset, offset + pageSize);
  const next = offset + pageSize < rows.length ? encodeCursor(offset + pageSize) : null;

  const labels: Record<string, string> = {};
  for (const v of applied.brand) labels[`brand:${v}`] = brandNames.get(v) ?? v;
  for (const v of applied.category) labels[`category:${v}`] = nodeLabel(snap.nodes.get(v)!);
  for (const v of applied.gender) labels[`gender:${v}`] = GENDER_LABELS[v] ?? v;

  return { scope: scope.info, items: page.map(toCard), totalCount: rows.length, nextCursor: next, facets, applied, labels };
}
