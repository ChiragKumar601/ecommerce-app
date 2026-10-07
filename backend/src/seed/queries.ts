import type { GenProduct } from './catalogue/generate.js';
import type { FlatNode } from './tree.js';

const SECTION_WORD: Record<string, string> = { men: 'men', women: 'women', kids: 'kids', home: 'home', beauty: 'beauty', 'gen-z': 'streetwear' };

/** Fallback image queries for a product: its category, then its section (S3.7, S3.10). */
export function fallbackQueriesFor(nodesById: Map<string, FlatNode>) {
  return (p: GenProduct): string[] => {
    const node = nodesById.get(p.primaryNodeId);
    const category = node?.categoryId ? nodesById.get(node.categoryId) : undefined;
    const word = SECTION_WORD[p.primarySectionId] ?? '';
    return [
      `${word} ${category?.name ?? ''}`.trim().toLowerCase(),
      p.primarySectionId === 'home' ? 'home interior decor' : p.primarySectionId === 'beauty' ? 'beauty products' : `${word} fashion`,
    ];
  };
}
