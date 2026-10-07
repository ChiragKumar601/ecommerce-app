import { seededRandom } from '../../domain/random.js';
import { isEventPhoto, isRelevant, isUnsuitablePhoto, keywordsFor } from './relevance.js';
import type { GenProduct } from './generate.js';

/** One openly licensed photo from the image manifest (D-22, OD-11). */
export interface ManifestPhoto {
  id: string;
  /** Served by the backend from storage/catalogue, e.g. `/media/catalogue/<id>.webp`. */
  url: string;
  alt: string;
  /** Author as credited by the source. */
  photographer: string;
  photographerUrl: string | null;
  /** The photo's page at its source (attribution link). */
  pageUrl: string;
  /** Short licence name, e.g. "CC BY-SA 4.0", "CC0", "Public domain". */
  licence: string;
  licenceUrl: string | null;
  /** 'wikimedia' or 'openverse:<provider>'. */
  source: string;
  /** Where the original file was downloaded from, so a fresh clone can rebuild the WebP. */
  downloadUrl: string;
}

/** `seed-data/images/manifest.json`: photos per search query, each with its own licence. */
export interface ImageManifest {
  sources: string[];
  fetchedAt: string;
  queries: Record<string, ManifestPhoto[]>;
  /**
   * Photo id → the `category/subcategory` labels it was reviewed and approved for (owner request,
   * 2026-10-07). When present, a subcategory only uses photos approved for its label.
   */
  approvedFor?: Map<string, Set<string>>;
}

export interface AssignedImage {
  productId: string;
  photo: ManifestPhoto;
  order: number;
}

/**
 * Repetition guardrails (OD-6, relaxed by OD-11): avoid reuse where the pool allows — a primary
 * image is shared by at most 2 products — and reuse more only when a pool is too small, never
 * with two neighbours sharing a primary image.
 */
export const MAX_PRODUCTS_PER_PRIMARY_IMAGE = 2;
export const MIN_IMAGES = 2;
export const MAX_IMAGES = 4;

/**
 * Assigns 2–4 images to every product (S3.10). Per subcategory, products are taken in their
 * default listing order and primary images are dealt round-robin from the pool, so:
 *  - a primary image is shared by at most 2 products in the subcategory;
 *  - products sharing a primary image are never next to each other in that order;
 *  - gallery images differ from the primary and their order varies.
 * When a query's pool is too small, the fallback queries (parent category, section) extend it.
 */
export function assignImages(
  products: GenProduct[],
  manifest: ImageManifest,
  orderKey: (p: GenProduct) => number,
  fallbackQueries: (p: GenProduct) => string[],
): { images: AssignedImage[]; problems: string[]; placeholderProductIds: string[] } {
  const images: AssignedImage[] = [];
  const problems: string[] = [];
  const placeholderProductIds: string[] = [];
  const bySubcat = new Map<string, GenProduct[]>();
  for (const p of products) bySubcat.set(p.primaryNodeId, [...(bySubcat.get(p.primaryNodeId) ?? []), p]);

  // Pass 1: each subcategory's pool of relevant photos.
  const pools = new Map<string, ManifestPhoto[]>();
  for (const [subcat, list] of bySubcat) pools.set(subcat, relevantPool(subcat, list, manifest, fallbackQueries));
  // A subcategory without one borrows from its sibling subcategories (same category), never from
  // unrelated ones (owner request, 2026-10-07).
  const categoryOf = (subcat: string) => subcat.split('/').slice(0, 2).join('/');
  // Siblings whose photos are approved for a different label still fit: same category, same kind of item.

  for (const [subcat, list] of bySubcat) {
    const ordered = [...list].sort((a, b) => orderKey(b) - orderKey(a));
    let pool = pools.get(subcat)!;
    if (pool.length < MIN_IMAGES && !NO_BORROWING.has(ordered[0]!.family)) {
      // Too few of its own: top up from sibling subcategories so every product shows 2–4 photos.
      const seen = new Set(pool.map((ph) => ph.id));
      // Same category first (e.g. women/sunglasses/*), then the same category in another section (men/sunglasses/*).
      const sameCategory = (s: string) => categoryOf(s) === categoryOf(subcat);
      const sameKind = (s: string) => s.split('/')[1] === subcat.split('/')[1];
      const siblings = [...[...pools].filter(([s]) => s !== subcat && sameCategory(s)), ...[...pools].filter(([s]) => !sameCategory(s) && sameKind(s))]
        .flatMap(([, p]) => p).filter((ph) => !seen.has(ph.id) && !!seen.add(ph.id));
      pool = [...pool, ...rotate(siblings, hashOf(subcat)).slice(0, MAX_IMAGES + 2 - pool.length)];
    }
    const needed = Math.ceil(ordered.length / MAX_PRODUCTS_PER_PRIMARY_IMAGE);
    if (pool.length === 0) {
      problems.push(`${subcat}: no relevant photo; using the on-theme placeholder`);
      placeholderProductIds.push(...ordered.map((p) => p.id));
      continue;
    }
    const rng = seededRandom(ordered.length * 7919 + pool.length);
    // A pool of 1 can't keep neighbours apart; that case is reported above.
    const primaries = pool.slice(0, Math.min(pool.length, Math.max(needed, 2)));
    ordered.forEach((p, i) => {
      const primary = primaries[i % primaries.length]!;
      const extras = pool.filter((ph) => ph.id !== primary.id).sort(() => rng.next() - 0.5);
      const count = Math.min(MAX_IMAGES, Math.max(MIN_IMAGES, 2 + Math.floor(rng.next() * 3)), 1 + extras.length);
      [primary, ...extras.slice(0, count - 1)].forEach((photo, order) => images.push({ productId: p.id, photo, order }));
    });
  }
  return { images, problems, placeholderProductIds };
}

/**
 * Labels whose approved photos also fit another label: the same kind of item sold under a
 * different category (mostly Gen Z edits of the main fashion categories).
 */
const LABEL_ALIASES: Record<string, string[]> = {
  'streetwear/varsity-jackets': ['topwear/jackets', 'western-wear/jackets'],
  'streetwear/bomber-jackets': ['topwear/jackets', 'western-wear/jackets'],
  'streetwear/parachute-pants': ['bottomwear/cargos', 'bottomwear/track-pants', 'western-wear/joggers'],
  'y2k/crop-tops': ['western-wear/tops'],
  'y2k/mini-skirts': ['western-wear/skirts', 'girls-clothing/skirts'],
  'y2k/denim-skirts': ['western-wear/skirts'],
  'co-ords/co-ord-sets': ['western-wear/co-ord-sets', 'co-ords/co-ord-sets'],
  'accessories/bucket-hats': ['accessories/caps-and-hats'],
  'sunglasses/cat-eye-sunglasses': ['sunglasses/round-sunglasses', 'sunglasses/wayfarers'],
  'sunglasses/oversized-sunglasses': ['sunglasses/aviators', 'sunglasses/wayfarers'],
};

/** `category/subcategory` of a node path, the label photos are approved for. */
export const approvalLabel = (nodeId: string) => nodeId.split('/').slice(1).join('/');

/**
 * Photos for a subcategory. With approvals: only photos approved for its label, its own search first.
 * Without approvals (fresh clone, no review yet): photos whose title names the product type.
 */
function relevantPool(subcat: string, list: GenProduct[], manifest: ImageManifest, fallbackQueries: (p: GenProduct) => string[]): ManifestPhoto[] {
  const first = list[0]!;
  const queries = [first.imageQuery, ...fallbackQueries(first)];
  const labels = [approvalLabel(subcat), ...(LABEL_ALIASES[approvalLabel(subcat)] ?? [])];
  const ok = manifest.approvedFor
    ? (ph: ManifestPhoto) => labels.some((l) => manifest.approvedFor!.get(ph.id)?.has(l))
    : (ph: ManifestPhoto) => isRelevant(ph.alt, keywordsFor(first.noun));
  const own = queries.flatMap((q) => manifest.queries[q] ?? []);
  const ranked = [...own.filter(ok), ...rotate(globalPool(manifest), hashOf(subcat)).filter(ok)];
  const needed = Math.ceil(list.length / MAX_PRODUCTS_PER_PRIMARY_IMAGE);
  const pool: ManifestPhoto[] = [];
  const seen = new Set<string>();
  for (const photo of ranked) {
    if (seen.has(photo.id) || isEventPhoto(photo.alt) || isUnsuitablePhoto(photo.alt)) continue;
    seen.add(photo.id);
    pool.push(photo);
    if (pool.length >= Math.max(needed, MAX_IMAGES + 1)) break;
  }
  return pool;
}

/** Innerwear, lingerie and similar: never borrow photos from other subcategories. */
const NO_BORROWING = new Set(['intimate']);

let cachedGlobal: { manifest: ImageManifest; photos: ManifestPhoto[] } | null = null;
/** Every distinct photo in the manifest (the last-resort pool). */
function globalPool(manifest: ImageManifest): ManifestPhoto[] {
  if (cachedGlobal?.manifest === manifest) return cachedGlobal.photos;
  const byId = new Map<string, ManifestPhoto>();
  for (const photos of Object.values(manifest.queries)) for (const ph of photos) byId.set(ph.id, ph);
  cachedGlobal = { manifest, photos: [...byId.values()] };
  return cachedGlobal.photos;
}

/** Starts the list at a stable offset so different subcategories borrow different photos. */
function rotate<T>(xs: T[], offset: number): T[] {
  if (xs.length === 0) return xs;
  const k = offset % xs.length;
  return [...xs.slice(k), ...xs.slice(0, k)];
}

function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
