import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { slugify } from '../domain/ids.js';

export const SEED_DIR = resolve(import.meta.dirname, '../../seed-data');

/** First path segments the frontend router owns; section slugs must avoid them (SD-64). */
export const RESERVED_SEGMENTS = [
  'shop', 'collections', 'offers', 'search', 'p', 'bag', 'wishlist', 'login', 'signup', 'forgot-password',
  'checkout', 'orders', 'order-confirmation', 'account', 'pages', 'demo-help', 'api', 'dev',
] as const;

export interface TreeFile {
  version: number;
  sections: { name: string; categories: { name: string; subcategories: string[] }[] }[];
}

export type NodeType = 'section' | 'category' | 'subcategory';

export interface FlatNode {
  /** The node id is its slug path, e.g. `men/topwear/t-shirts` (stable and readable). */
  id: string;
  type: NodeType;
  name: string;
  slug: string;
  path: string;
  parentId: string | null;
  displayOrder: number;
  sectionId: string;
  categoryId: string | null;
}

export function loadTree(file = resolve(SEED_DIR, 'catalogue/tree.json')): TreeFile {
  return JSON.parse(readFileSync(file, 'utf8')) as TreeFile;
}

/** Flattens the tree into nodes; throws on any rule violation (DAT-001, SD-64, max 3 levels). */
export function flattenTree(tree: TreeFile): FlatNode[] {
  const nodes: FlatNode[] = [];
  const errors: string[] = [];
  const seenSiblings = new Map<string, Set<string>>();
  const add = (n: FlatNode) => {
    const key = n.parentId ?? '<root>';
    const siblings = seenSiblings.get(key) ?? new Set<string>();
    if (!n.slug) errors.push(`empty slug for "${n.name}"`);
    if (siblings.has(n.slug)) errors.push(`duplicate slug "${n.slug}" under ${key}`);
    siblings.add(n.slug);
    seenSiblings.set(key, siblings);
    nodes.push(n);
  };

  tree.sections.forEach((s, si) => {
    const sSlug = slugify(s.name);
    if ((RESERVED_SEGMENTS as readonly string[]).includes(sSlug)) errors.push(`section slug "${sSlug}" is reserved (SD-64)`);
    add({ id: sSlug, type: 'section', name: s.name, slug: sSlug, path: sSlug, parentId: null, displayOrder: si + 1, sectionId: sSlug, categoryId: null });
    if (s.categories.length === 0) errors.push(`section "${s.name}" has no categories`);
    s.categories.forEach((c, ci) => {
      const cSlug = slugify(c.name);
      const cPath = `${sSlug}/${cSlug}`;
      add({ id: cPath, type: 'category', name: c.name, slug: cSlug, path: cPath, parentId: sSlug, displayOrder: ci + 1, sectionId: sSlug, categoryId: cPath });
      if (c.subcategories.length === 0) errors.push(`category "${cPath}" has no subcategories`);
      c.subcategories.forEach((sub, ki) => {
        const kSlug = slugify(sub);
        const kPath = `${cPath}/${kSlug}`;
        add({ id: kPath, type: 'subcategory', name: sub, slug: kSlug, path: kPath, parentId: cPath, displayOrder: ki + 1, sectionId: sSlug, categoryId: cPath });
      });
    });
  });
  if (errors.length) throw new Error(`Catalogue tree is invalid:\n- ${errors.join('\n- ')}`);
  return nodes;
}

/** A node id plus all of its ancestors (used for coupon eligibility and tax lookup). */
export function withAncestors(nodeId: string): string[] {
  const parts = nodeId.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}
