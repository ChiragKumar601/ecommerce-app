import type { AppContext } from '../api/context.js';
import { AppError } from '../domain/errors.js';

export interface NavNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  href: string;
  children: NavNode[];
}

/** Listing URL for a catalogue node (spec §10.1, T-5): sections use /shop/<section>. */
export function hrefForNode(path: string): string {
  const parts = path.split('/');
  return parts.length === 1 ? `/shop/${parts[0]}` : `/${path}`;
}

let navCache: { version: number; tree: NavNode[] } | null = null;

/** Section → category → subcategory tree from active nodes (NAV-002, NAV-007). Cached per catalogue version. */
export async function getNavigation(ctx: AppContext): Promise<NavNode[]> {
  const version = ctx.settings.catalogueVersion;
  if (navCache && navCache.version === version) return navCache.tree;
  const rows = await ctx.db.catalogueNode.findMany({ where: { active: true }, orderBy: [{ displayOrder: 'asc' }] });
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
  const build = (parentId: string | null): NavNode[] =>
    (byParent.get(parentId) ?? []).map((n) => ({ id: n.id, name: n.name, slug: n.slug, path: n.path, href: hrefForNode(n.path), children: build(n.id) }));
  const tree = build(null);
  navCache = { version, tree };
  return tree;
}

export function resetNavigationCache() {
  navCache = null;
}

export async function getContentPage(ctx: AppContext, slug: string) {
  const page = await ctx.db.contentPage.findUnique({ where: { slug } });
  if (!page) throw new AppError('NOT_FOUND');
  return page;
}

export async function getFaqs(ctx: AppContext) {
  const rows = await ctx.db.faqEntry.findMany({ orderBy: { order: 'asc' } });
  const topics: { topic: string; items: { id: string; question: string; answer: string }[] }[] = [];
  for (const r of rows) {
    let t = topics.find((x) => x.topic === r.topic);
    if (!t) topics.push((t = { topic: r.topic, items: [] }));
    t.items.push({ id: r.id, question: r.question, answer: r.answer });
  }
  return topics;
}

/** Footer content in the LND-007 order, plus popular searches and sample company details. */
export async function getSiteInfo(ctx: AppContext) {
  const popular = await ctx.db.popularSearch.findMany({ orderBy: { order: 'asc' } });
  return {
    brandName: await ctx.settings.get<string>('brand.name', 'Wardrobe & Co.'),
    demoBanner: await ctx.settings.get<string>('demoBanner.text', 'Demo store — for showcase only. No real orders, payments or deliveries.'),
    footer: await ctx.settings.get<Record<string, unknown>>('footer', {}),
    company: await ctx.settings.get<Record<string, string>>('company.sampleDetails', {}),
    popularSearches: popular.map((p) => p.term),
  };
}
