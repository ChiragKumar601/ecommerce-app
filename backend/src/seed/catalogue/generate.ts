import { slugify } from '../../domain/ids.js';
import { seededRandom, type Random } from '../../domain/random.js';
import { MS } from '../../domain/time.js';
import { withAncestors, type FlatNode } from '../tree.js';
import { BRANDS, type BrandGroup } from './brands.js';
import { FAMILIES, SIZES, type Family } from './families.js';
import { DYNAMIC_MIRRORS, MIN_OVERRIDES, MIRROR_EXTRAS, MIRRORS, planFor, type Gender, type SubcatPlan } from './mapping.js';

/** The reference "today" for generated listing dates, so seeds are reproducible. */
export const SEED_DATE = new Date('2026-10-06T00:00:00+05:30');
export const MIN_PER_SUBCATEGORY = 6;
export const MIN_PER_CATEGORY = 48;

export interface GenVariant { id: string; sizeLabel: string; sortOrder: number; mrp: number; sellingPrice: number; onHand: number }
export interface GenProduct {
  id: string; slug: string; brand: string; name: string; subtitle: string; description: string; materialCare: string;
  specifications: { key: string; value: string }[]; primarySectionId: string; primaryNodeId: string; gender: Gender;
  colour: string; styleGroupId: string; listingDate: Date; bestSeller: boolean; bankOfferEligible: boolean;
  inclusiveSizing: boolean; sizeGuideId: string | null; family: string; imageQuery: string; noun: string;
  nodeIds: Set<string>; variants: GenVariant[];
}
export interface GenCatalogue {
  products: GenProduct[];
  brands: string[];
  curated: { productId: string; kind: 'bought_together' | 'complete_the_look'; targetId: string; order: number }[];
}

/** FNV-1a hash, so each subcategory has its own stable random stream. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

const pick = <T>(rng: Random, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;
const between = (rng: Random, min: number, max: number) => min + Math.floor(rng.next() * (max - min + 1));
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const rid = (rng: Random, n = 10) => Array.from({ length: n }, () => ALNUM[Math.floor(rng.next() * ALNUM.length)]).join('');

/** MRP ends in 99; selling price ends in 9 and never exceeds MRP (spec §4.1). */
function priceFor(rng: Random, band: [number, number], maxDiscount: number): { mrp: number; selling: number } {
  const mrpRupees = Math.max(149, Math.round(between(rng, band[0], band[1]) / 100) * 100 - 1);
  const discount = rng.next() < 0.25 ? 0 : between(rng, 10, maxDiscount);
  const raw = Math.floor((mrpRupees * (100 - discount)) / 100);
  const selling = discount === 0 ? mrpRupees : Math.max(99, Math.floor(raw / 10) * 10 - 1);
  return { mrp: mrpRupees * 100, selling: Math.min(selling, mrpRupees) * 100 };
}

function resolveGender(rng: Random, g: SubcatPlan['gender']): Gender {
  if (g === 'mixed-men') return rng.next() < 0.6 ? 'men' : 'unisex';
  if (g === 'mixed-women') { const x = rng.next(); return x < 0.55 ? 'women' : x < 0.85 ? 'unisex' : 'men'; }
  return g;
}

function describe(p: { brand: string; name: string; colour: string; material: string; detail: string; noun: string; family: Family }): string {
  const colour = p.colour === 'Assorted' ? '' : ` in ${p.colour.toLowerCase()}`;
  const group = p.family.key;
  const lines: Record<string, string> = {
    shoes: 'A comfortable pair built for all-day wear.',
    sandals: 'Easy to slip on and comfortable for long days.',
    beauty: 'Formulated to suit everyday routines.',
    fragrance: 'A long-lasting scent for every occasion.',
    furniture: 'Designed to be sturdy and easy to live with.',
    decor: 'An easy way to add character to any room.',
    kitchen: 'Made for everyday cooking and serving.',
    toy: 'Designed for safe, screen-free play.',
    gadget: 'Reliable everyday tech with a clean design.',
    smartwatch: 'Tracks your day and keeps you connected.',
  };
  return `${p.name} by ${p.brand}${colour}, finished with ${p.detail.toLowerCase()}. Made from ${p.material.toLowerCase()} for a look and feel that lasts. ${lines[group] ?? 'An easy everyday favourite that pairs well with the rest of your wardrobe.'}`;
}

interface Ctx { usedIds: Set<string>; usedSlugs: Set<string> }

/** Size guide by size system, so every apparel and footwear product links to a real guide (PDP-006). */
function sizeGuideFor(sizes: string, family: string): string | null {
  const bottoms = family === 'bottom';
  switch (sizes) {
    case 'apparelMen': case 'apparelInclusive': return bottoms ? 'men-bottoms' : 'men-tops';
    case 'apparelWomen': return bottoms ? 'women-bottoms' : 'women-tops';
    case 'waistMen': return 'men-bottoms';
    case 'waistWomen': return 'women-bottoms';
    case 'shoesMen': return 'men-footwear';
    case 'shoesWomen': return 'women-footwear';
    case 'shoesKids': return 'kids-footwear';
    case 'kids': return 'kids-clothing';
    case 'bra': return 'bras';
    default: return null;
  }
}

function makeProduct(rng: Random, ctx: Ctx, node: FlatNode, plan: SubcatPlan, family: Family, base: {
  brand: string; style: string; material: string; detail: string; colour: string; styleGroupId: string; gender: Gender; inclusive: boolean;
}): GenProduct {
  let id = rid(rng);
  while (ctx.usedIds.has(id)) id = rid(rng);
  ctx.usedIds.add(id);
  const name = plan.nameMode === 'apparel' ? `${base.style} ${base.material} ${plan.noun}` : `${base.style} ${plan.noun}`;
  let slug = slugify(`${base.brand} ${name} ${base.colour === 'Assorted' ? '' : base.colour}`);
  if (ctx.usedSlugs.has(slug)) slug = `${slug}-${id.slice(0, 4)}`;
  ctx.usedSlugs.add(slug);
  const subtitle = base.colour === 'Assorted' ? base.detail : `${base.colour} · ${base.detail}`;
  const sizeSystem = base.inclusive ? 'apparelInclusive' : plan.sizes;
  const sizes = [...SIZES[sizeSystem]];
  const band = plan.price ?? family.price;
  const { mrp, selling } = priceFor(rng, band, family.maxDiscount);
  const allOut = rng.next() < 0.02; // a few fully out-of-stock products (PLP-004, PDP-003)
  const variants: GenVariant[] = sizes.map((sizeLabel, i) => {
    const step = family.priceStep ? 1 + family.priceStep * i : 1;
    const vMrp = Math.round((mrp * step) / 100) * 100;
    const vSell = Math.min(vMrp, Math.round((selling * step) / 100) * 100);
    const onHand = allOut || rng.next() < 0.06 ? 0 : between(rng, 3, 40);
    return { id: `${id}-${slugify(sizeLabel) || 'os'}`, sizeLabel, sortOrder: i + 1, mrp: vMrp, sellingPrice: vSell, onHand };
  });
  const specsR = (xs: readonly string[]) => pick(rng, xs);
  const specifications = [
    ...family.specs(specsR).map(([key, value]) => ({ key, value })),
    { key: 'Material', value: base.material },
    ...(base.colour !== 'Assorted' ? [{ key: 'Colour', value: base.colour }] : []),
  ];
  const listingDate = new Date(SEED_DATE.getTime() - between(rng, 0, 180) * MS.day);
  return {
    id, slug, brand: base.brand, name, subtitle,
    description: describe({ brand: base.brand, name, colour: base.colour, material: base.material, detail: base.detail, noun: plan.noun, family }),
    materialCare: family.care, specifications,
    primarySectionId: node.sectionId, primaryNodeId: node.id, gender: base.gender, colour: base.colour,
    styleGroupId: base.styleGroupId, listingDate,
    bestSeller: rng.next() < 0.08,
    bankOfferEligible: selling >= 49900 && rng.next() < family.bankOfferShare,
    inclusiveSizing: base.inclusive,
    sizeGuideId: plan.sizeGuide ?? sizeGuideFor(sizeSystem, family.key),
    family: family.key, imageQuery: plan.imageQuery, noun: plan.noun,
    nodeIds: new Set([node.id]), variants,
  };
}

/** Generates `count` products for one owned subcategory, including colour siblings. */
function generateForSubcategory(node: FlatNode, plan: SubcatPlan, count: number, ctx: Ctx, salt = ''): GenProduct[] {
  const rng = seededRandom(hash(node.id + salt));
  const family = FAMILIES[plan.family];
  if (!family) throw new Error(`Unknown family ${plan.family} for ${node.id}`);
  const brandGroup: BrandGroup = plan.brandGroup ?? family.brandGroup;
  const out: GenProduct[] = [];
  const isApparel = ['apparelMen', 'apparelWomen'].includes(plan.sizes);
  while (out.length < count) {
    const style = pick(rng, family.styles);
    const material = pick(rng, family.materials);
    const detail = pick(rng, family.details);
    const brand = pick(rng, BRANDS[brandGroup]);
    const gender = resolveGender(rng, plan.gender);
    const inclusive = isApparel && rng.next() < 0.12;
    const styleGroupId = `sg-${rid(rng, 8)}`;
    const siblings = family.colourSiblings && rng.next() < family.colourSiblings ? between(rng, 1, 2) : 0;
    const colours = [...family.colours].sort(() => rng.next() - 0.5).slice(0, 1 + siblings);
    for (const colour of colours) {
      if (out.length >= count) break;
      out.push(makeProduct(rng, ctx, node, plan, family, { brand, style, material, detail, colour, styleGroupId, gender, inclusive }));
    }
  }
  return out;
}

/** Builds the whole catalogue (S3.8–S3.9): owned products, mirrors, category top-ups, curated recommendations. */
export function generateCatalogue(nodes: FlatNode[]): GenCatalogue {
  const ctx: Ctx = { usedIds: new Set(), usedSlugs: new Set() };
  const subcats = nodes.filter((n) => n.type === 'subcategory');
  const categories = nodes.filter((n) => n.type === 'category');
  const plans = new Map(subcats.map((n) => [n.id, planFor(n.path, n.name)]));
  const owned = (catId: string) => subcats.filter((s) => s.categoryId === catId && plans.get(s.id));

  // Pass 1: categories that borrow nothing. Pass 2: categories that also list mirrored products
  // (non-Gen-Z first, then Gen Z), which only generate what mirroring doesn't already cover.
  const allRules = [...MIRRORS, ...MIRROR_EXTRAS];
  const catOf = (path: string) => path.split('/').slice(0, 2).join('/');
  const borrowing = new Set(allRules.map((m) => catOf(m.target)));
  const products: GenProduct[] = [];
  const applyMirrors = () => {
    const byPrimary = new Map<string, GenProduct[]>();
    for (const p of products) byPrimary.set(p.primaryNodeId, [...(byPrimary.get(p.primaryNodeId) ?? []), p]);
    for (const m of allRules) {
      let pool = m.sources.flatMap((src) => byPrimary.get(src) ?? []);
      if (m.genders) pool = pool.filter((p) => m.genders!.includes(p.gender));
      for (const p of pool.slice(0, m.limit ?? pool.length)) p.nodeIds.add(m.target);
    }
  };
  const countIn = (catId: string) => products.filter((p) => [...p.nodeIds].some((n) => n.startsWith(`${catId}/`))).length;
  const fill = (cats: FlatNode[]) => {
    for (const cat of cats) {
      const own = owned(cat.id);
      if (own.length === 0) continue;
      const needed = Math.max(0, MIN_PER_CATEGORY - countIn(cat.id));
      const per = Math.max(MIN_PER_SUBCATEGORY, Math.ceil(needed / own.length));
      for (const s of own) products.push(...generateForSubcategory(s, plans.get(s.id)!, Math.max(per, MIN_OVERRIDES[s.id] ?? 0), ctx));
    }
    applyMirrors();
  };
  fill(categories.filter((c) => !borrowing.has(c.id)));
  fill(categories.filter((c) => borrowing.has(c.id) && c.sectionId !== 'gen-z'));
  fill(categories.filter((c) => borrowing.has(c.id) && c.sectionId === 'gen-z'));

  // Gen Z → Trending Now: best sellers and newest from fashion (DYNAMIC_MIRRORS).
  const fashion = products.filter((p) => ['men', 'women', 'gen-z'].includes(p.primarySectionId) && ['top', 'outer', 'bottom', 'dress', 'shoes'].includes(p.family));
  const [viral, newest] = DYNAMIC_MIRRORS;
  fashion.filter((p) => p.bestSeller).slice(0, 30).forEach((p) => p.nodeIds.add(viral));
  [...fashion].sort((a, b) => b.listingDate.getTime() - a.listingDate.getTime()).slice(0, 30).forEach((p) => p.nodeIds.add(newest));

  // Top up any category below 48 using its owned subcategories (DAT-002).
  const inCategory = (catId: string) => products.filter((p) => [...p.nodeIds].some((n) => n.startsWith(`${catId}/`))).length;
  for (const cat of categories) {
    const own = owned(cat.id);
    let missing = MIN_PER_CATEGORY - inCategory(cat.id);
    let round = 0;
    while (missing > 0 && own.length > 0) {
      const s = own[round % own.length]!;
      products.push(...generateForSubcategory(s, plans.get(s.id)!, 1, ctx, `topup-${round}`));
      missing -= 1;
      round += 1;
    }
  }

  // Product node memberships include every ancestor, so section and category listings find them.
  for (const p of products) for (const n of [...p.nodeIds]) for (const a of withAncestors(n)) p.nodeIds.add(a);

  return { products, brands: [...new Set(products.map((p) => p.brand))].sort(), curated: curate(products) };
}

/** Curated "frequently bought together" and "complete the look" lists (PDP-011, T-21). */
function curate(products: GenProduct[]): GenCatalogue['curated'] {
  const rng = seededRandom(hash('curated'));
  const COMPLEMENT: Record<string, string[]> = {
    top: ['bottom', 'shoes', 'watch', 'eyewear'], outer: ['top', 'bottom', 'shoes'], bottom: ['top', 'shoes', 'smallAccessory'],
    dress: ['sandals', 'bag', 'jewellery'], ethnic: ['sandals', 'jewellery', 'bag'], occasionEthnic: ['jewellery', 'sandals', 'bag'],
    shoes: ['top', 'bottom'], sandals: ['dress', 'bag'], active: ['shoes', 'active'], kidsWear: ['kidsShoes', 'kidsWear'],
  };
  const bySectionFamily = new Map<string, GenProduct[]>();
  for (const p of products) {
    const key = `${p.primarySectionId}|${p.family}`;
    bySectionFamily.set(key, [...(bySectionFamily.get(key) ?? []), p]);
  }
  const out: GenCatalogue['curated'] = [];
  for (const p of products) {
    const sameFamily = (bySectionFamily.get(`${p.primarySectionId}|${p.family}`) ?? []).filter((q) => q.id !== p.id && q.primaryNodeId !== p.primaryNodeId);
    const together = [...sameFamily].sort(() => rng.next() - 0.5).slice(0, 3);
    together.forEach((t, i) => out.push({ productId: p.id, kind: 'bought_together', targetId: t.id, order: i + 1 }));
    const comp = COMPLEMENT[p.family];
    if (comp) {
      const look = comp
        .map((f) => (bySectionFamily.get(`${p.primarySectionId}|${f}`) ?? []).filter((q) => q.id !== p.id && (q.gender === p.gender || q.gender === 'unisex')))
        .map((pool) => pool[Math.floor(rng.next() * pool.length)])
        .filter((q): q is GenProduct => !!q);
      [...new Map(look.map((q) => [q.id, q])).values()].slice(0, 4).forEach((t, i) => out.push({ productId: p.id, kind: 'complete_the_look', targetId: t.id, order: i + 1 }));
    }
  }
  return out;
}
