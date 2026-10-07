import { hrefForNode } from '../../src/services/content.js';
import type { SnapNode, SnapProduct } from '../../src/services/catalogue/snapshot.js';
import { generateCatalogue } from '../../src/seed/catalogue/generate.js';
import { flattenTree, loadTree } from '../../src/seed/tree.js';

/** The full deterministic seed catalogue as an in-memory snapshot (no database). */
export function generatedSnapshot(): { products: SnapProduct[]; nodes: Map<string, SnapNode> } {
  const flat = flattenTree(loadTree());
  const nodes = new Map<string, SnapNode>(flat.map((n) => [n.id, { id: n.id, type: n.type, name: n.name, slug: n.slug, path: n.path, parentId: n.parentId, displayOrder: n.displayOrder, href: hrefForNode(n.path) }]));
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const products = generateCatalogue(flat).products.map((p): SnapProduct => ({
    id: p.id, slug: p.slug, href: `/p/${p.slug}-${p.id}`, name: p.name, subtitle: p.subtitle, brandId: slug(p.brand), brandName: p.brand, brandSlug: slug(p.brand),
    gender: p.gender, colour: p.colour, listingDate: p.listingDate.getTime(), bestSeller: p.bestSeller, bankOfferEligible: p.bankOfferEligible,
    inclusiveSizing: p.inclusiveSizing, primarySectionId: p.primarySectionId, primaryNodeId: p.primaryNodeId, styleGroupId: p.styleGroupId,
    nodeIds: p.nodeIds, specValues: p.specifications.map((s) => s.value), variants: p.variants, images: [],
  }));
  return { products, nodes };
}
