import type { AppContext } from '../../api/context.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { hrefForNode } from '../content.js';

/**
 * In-memory read model of the active catalogue (plan §7.4, PR-22). Listings, facets, search and
 * recommendations are computed from it, so a listing request never scans tables.
 *
 * - Static product data is rebuilt when `catalogue_version` changes (config:sync / re-seed).
 * - Stock (`available = onHand − held`) refreshes on a short TTL: listings may lag by a few
 *   seconds, but every purchase decision re-checks the database (INV-001).
 * - Rating aggregates refresh within REV-011's 1-minute bound, and immediately via `invalidateRatings`.
 */

export interface SnapVariant {
  id: string;
  sizeLabel: string;
  sortOrder: number;
  mrp: number;
  sellingPrice: number;
}

export interface SnapProduct {
  id: string;
  slug: string;
  href: string;
  name: string;
  subtitle: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  gender: string;
  colour: string;
  listingDate: number;
  bestSeller: boolean;
  bankOfferEligible: boolean;
  inclusiveSizing: boolean;
  primarySectionId: string;
  primaryNodeId: string;
  styleGroupId: string;
  nodeIds: Set<string>;
  variants: SnapVariant[];
  images: { url: string; alt: string }[];
}

export interface SnapNode {
  id: string;
  type: string;
  name: string;
  slug: string;
  path: string;
  parentId: string | null;
  displayOrder: number;
  href: string;
}

export interface CatalogueSnapshot {
  version: number;
  products: SnapProduct[];
  byId: Map<string, SnapProduct>;
  nodes: Map<string, SnapNode>;
  nodeByPath: Map<string, SnapNode>;
}

export interface Rating {
  count: number;
  sum: number;
}

interface DynamicState {
  available: Map<string, number>;
  stockLoadedAt: number;
  ratings: Map<string, Rating>;
  ratingsLoadedAt: number;
  globalMean: number;
  maxCount: number;
}

const STOCK_TTL_MS = 3_000;
const RATINGS_TTL_MS = 30_000;

interface Entry {
  snapshot?: CatalogueSnapshot;
  loading?: Promise<CatalogueSnapshot>;
  dyn?: DynamicState;
  stockLoading?: Promise<void>;
  ratingsLoading?: Promise<void>;
}

// Keyed by database client so parallel test apps never share state.
const entries = new WeakMap<PrismaClient, Entry>();
const entryFor = (db: PrismaClient): Entry => {
  let e = entries.get(db);
  if (!e) entries.set(db, (e = {}));
  return e;
};

async function load(db: PrismaClient, version: number): Promise<CatalogueSnapshot> {
  // Flat reads joined in memory: nested includes exceed SQLite's bound-parameter limit at this size.
  const [nodeRows, productRows, brandRows, linkRows, variantRows, imageRows] = await Promise.all([
    db.catalogueNode.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } }),
    db.product.findMany({
      where: { active: true },
      select: {
        id: true, slug: true, name: true, subtitle: true, gender: true, colour: true, listingDate: true, brandId: true,
        bestSeller: true, bankOfferEligible: true, inclusiveSizing: true, primarySectionId: true, primaryNodeId: true, styleGroupId: true,
      },
    }),
    db.brand.findMany({ select: { id: true, name: true, slug: true } }),
    db.productNode.findMany({ select: { productId: true, nodeId: true } }),
    db.variant.findMany({ where: { active: true }, select: { id: true, productId: true, sizeLabel: true, sortOrder: true, mrp: true, sellingPrice: true }, orderBy: { sortOrder: 'asc' } }),
    db.productImage.findMany({ select: { productId: true, url: true, alt: true }, orderBy: { order: 'asc' } }),
  ]);
  const group = <T extends { productId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) {
      const list = m.get(x.productId);
      if (list) list.push(x);
      else m.set(x.productId, [x]);
    }
    return m;
  };
  const brands = new Map(brandRows.map((b) => [b.id, b]));
  const links = group(linkRows);
  const variants = group(variantRows);
  const images = group(imageRows);
  const nodes = new Map<string, SnapNode>();
  const nodeByPath = new Map<string, SnapNode>();
  // A node is visible only when it and all its ancestors are active.
  const activeIds = new Set(nodeRows.map((n) => n.id));
  for (const n of nodeRows) {
    if (n.parentId && !activeIds.has(n.parentId)) continue;
    const node: SnapNode = { id: n.id, type: n.type, name: n.name, slug: n.slug, path: n.path, parentId: n.parentId, displayOrder: n.displayOrder, href: hrefForNode(n.path) };
    nodes.set(n.id, node);
  }
  for (const n of [...nodes.values()]) {
    let p = n.parentId;
    while (p) {
      const parent = nodes.get(p);
      if (!parent) {
        nodes.delete(n.id);
        break;
      }
      p = parent.parentId;
    }
  }
  for (const n of nodes.values()) nodeByPath.set(n.path, n);

  const products: SnapProduct[] = [];
  for (const r of productRows) {
    const vs = variants.get(r.id) ?? [];
    const brand = brands.get(r.brandId);
    if (vs.length === 0 || !brand) continue;
    const nodeIds = new Set((links.get(r.id) ?? []).map((x) => x.nodeId).filter((id) => nodes.has(id)));
    if (nodeIds.size === 0) continue;
    products.push({
      id: r.id, slug: r.slug, href: `/p/${r.slug}-${r.id}`, name: r.name, subtitle: r.subtitle,
      brandId: brand.id, brandName: brand.name, brandSlug: brand.slug, gender: r.gender, colour: r.colour,
      listingDate: r.listingDate.getTime(), bestSeller: r.bestSeller, bankOfferEligible: r.bankOfferEligible, inclusiveSizing: r.inclusiveSizing,
      primarySectionId: r.primarySectionId, primaryNodeId: r.primaryNodeId, styleGroupId: r.styleGroupId,
      nodeIds,
      variants: vs.map((v) => ({ id: v.id, sizeLabel: v.sizeLabel, sortOrder: v.sortOrder, mrp: v.mrp, sellingPrice: v.sellingPrice })),
      images: (images.get(r.id) ?? []).map((i) => ({ url: i.url, alt: i.alt })),
    });
  }
  return { version, products, byId: new Map(products.map((p) => [p.id, p])), nodes, nodeByPath };
}

/** The current snapshot, rebuilt when the catalogue version changes. */
export async function getSnapshot(ctx: Pick<AppContext, 'db' | 'settings'>): Promise<CatalogueSnapshot> {
  const e = entryFor(ctx.db);
  const version = ctx.settings.catalogueVersion;
  if (e.snapshot && e.snapshot.version === version) return e.snapshot;
  if (!e.loading) {
    e.loading = load(ctx.db, version).then(
      (s) => {
        e.snapshot = s;
        e.loading = undefined;
        return s;
      },
      (err: unknown) => {
        e.loading = undefined;
        throw err;
      },
    );
  }
  return e.loading;
}

async function loadStock(db: PrismaClient, dyn: DynamicState) {
  const rows = await db.inventory.findMany({ select: { variantId: true, onHand: true, held: true } });
  dyn.available = new Map(rows.map((r) => [r.variantId, Math.max(0, r.onHand - r.held)]));
  dyn.stockLoadedAt = Date.now();
}

async function loadRatings(db: PrismaClient, dyn: DynamicState) {
  const rows = await db.ratingAggregate.findMany({ where: { count: { gt: 0 } }, select: { productId: true, count: true, sumRatings: true } });
  dyn.ratings = new Map(rows.map((r) => [r.productId, { count: r.count, sum: r.sumRatings }]));
  let sum = 0;
  let count = 0;
  let max = 0;
  for (const r of rows) {
    sum += r.sumRatings;
    count += r.count;
    max = Math.max(max, r.count);
  }
  dyn.globalMean = count ? sum / count : 0;
  dyn.maxCount = max;
  dyn.ratingsLoadedAt = Date.now();
}

/** Current availability and ratings (refreshed on their TTLs; concurrent callers share one load). */
export async function getDynamic(ctx: Pick<AppContext, 'db'>): Promise<DynamicState> {
  const e = entryFor(ctx.db);
  const dyn = (e.dyn ??= { available: new Map(), stockLoadedAt: 0, ratings: new Map(), ratingsLoadedAt: 0, globalMean: 0, maxCount: 0 });
  const now = Date.now();
  const waits: Promise<void>[] = [];
  if (now - dyn.stockLoadedAt > STOCK_TTL_MS) {
    e.stockLoading ??= loadStock(ctx.db, dyn).finally(() => (e.stockLoading = undefined));
    waits.push(e.stockLoading);
  }
  if (now - dyn.ratingsLoadedAt > RATINGS_TTL_MS) {
    e.ratingsLoading ??= loadRatings(ctx.db, dyn).finally(() => (e.ratingsLoading = undefined));
    waits.push(e.ratingsLoading);
  }
  await Promise.all(waits);
  return dyn;
}

/** Forces the next read to reload stock (after holds, commits or a stock reset in this process). */
export function invalidateStock(db: PrismaClient) {
  const d = entries.get(db)?.dyn;
  if (d) d.stockLoadedAt = 0;
}

/** Forces the next read to reload rating aggregates (after review changes, REV-011). */
export function invalidateRatings(db: PrismaClient) {
  const d = entries.get(db)?.dyn;
  if (d) d.ratingsLoadedAt = 0;
}

/** Drops everything for this database (tests, re-seeds). */
export function resetCatalogueCache(db: PrismaClient) {
  entries.delete(db);
}

/** Section → … → node chain, root first. */
export function ancestry(snap: CatalogueSnapshot, nodeId: string): SnapNode[] {
  const chain: SnapNode[] = [];
  let n = snap.nodes.get(nodeId);
  while (n) {
    chain.unshift(n);
    n = n.parentId ? snap.nodes.get(n.parentId) : undefined;
  }
  return chain;
}
