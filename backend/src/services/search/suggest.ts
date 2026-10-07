import type { AppContext } from '../../api/context.js';
import { formatINR } from '../../domain/money.js';
import { ancestry, getDynamic, getSnapshot } from '../catalogue/snapshot.js';
import { derive } from '../catalogue/listing.js';
import { indexFor, SearchIndex } from './index.js';

export interface Suggestions {
  categories: { label: string; context: string; href: string }[];
  brands: { label: string; href: string }[];
  products: { label: string; brand: string; href: string; image: string | null; price: string }[];
  popular: string[];
}

/**
 * Grouped suggestions (SRC-001, SRC-005): categories, brands, products, popular searches — at
 * most 8 in total. Matching recent searches are prepended by the client (they live on the device
 * for guests; on the account from Stage 10), which then trims to 8.
 */
export async function suggest(ctx: AppContext, q: string): Promise<Suggestions> {
  const empty: Suggestions = { categories: [], brands: [], products: [], popular: [] };
  const settings = await ctx.settings.get<{ minChars: number; maxItems: number }>('search.suggest', { minChars: 2, maxItems: 8 });
  const term = q.trim().slice(0, 100);
  if ([...term].length < settings.minChars || SearchIndex.queryWords(term).length === 0) return empty;
  const snap = await getSnapshot(ctx);
  const dyn = await getDynamic(ctx);
  const idx = indexFor(snap);
  const max = settings.maxItems;

  const nodes = idx.matchNodes(term, 3);
  const brands = idx.matchBrands(term, 2);
  const match = idx.search(term, { prefixLast: true });
  const products = match.ids.slice(0, 4).map((id) => snap.byId.get(id)!).filter(Boolean);
  const lower = term.toLowerCase();
  const popularRows = await ctx.db.popularSearch.findMany({ orderBy: { order: 'asc' } });
  const popular = popularRows.map((p) => p.term).filter((t) => t.toLowerCase().includes(lower) && t.toLowerCase() !== lower).slice(0, 3);

  const out: Suggestions = {
    categories: nodes.map((n) => ({
      label: n.name,
      context: ancestry(snap, n.id).slice(0, -1).map((a) => a.name).join(' › '),
      href: n.href,
    })),
    brands: brands.map((b) => ({ label: b.name, href: `/search?q=${encodeURIComponent(b.name)}&brand=${encodeURIComponent(b.slug)}` })),
    products: products.map((p) => {
      const d = derive(p, dyn.available, dyn.ratings);
      return { label: p.name, brand: p.brandName, href: p.href, image: p.images[0]?.url ?? null, price: formatINR(d.price) };
    }),
    popular,
  };
  // Enforce the overall cap in group order.
  let left = max;
  for (const k of ['categories', 'brands', 'products', 'popular'] as const) {
    (out[k] as unknown[]) = (out[k] as unknown[]).slice(0, left);
    left -= out[k].length;
  }
  return out;
}
