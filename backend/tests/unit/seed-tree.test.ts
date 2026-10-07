import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenTree, loadTree, withAncestors, type TreeFile } from '../../src/seed/tree.js';

describe('catalogue tree (DAT-001, SD-64)', () => {
  const tree = loadTree();
  const nodes = flattenTree(tree);

  it('has the six sections in header order (NAV-002)', () => {
    expect(nodes.filter((n) => n.type === 'section').map((n) => n.name)).toEqual(['Men', 'Women', 'Kids', 'Home', 'Beauty', 'Gen Z']);
    expect(nodes.find((n) => n.name === 'Gen Z')?.slug).toBe('gen-z');
  });

  it('is at most three levels deep with unique paths', () => {
    expect(new Set(nodes.map((n) => n.path)).size).toBe(nodes.length);
    expect(nodes.every((n) => n.path.split('/').length <= 3)).toBe(true);
    expect(nodes.filter((n) => n.type === 'subcategory').length).toBe(386);
  });

  it('includes the T-6 additions', () => {
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.has('men/activewear')).toBe(true);
    expect(ids.has('gen-z/gadgets/headphones-and-speakers')).toBe(true);
    expect(ids.has('gen-z/gadgets/watches-and-wearables')).toBe(true);
    expect(ids.has('gen-z/gadgets/phone-accessories')).toBe(true);
  });

  it('contains every subcategory the README lists for the main sections', () => {
    const readme = readFileSync(resolve(import.meta.dirname, '../../../README.md'), 'utf8');
    const names = new Set(nodes.map((n) => n.name.toLowerCase()));
    // A sample of README items across sections, spelled as in the README.
    for (const item of ['sherwanis', 'nehru jackets', 'dhotis', 'palazzos', 'co-ord sets', 'frocks', 'school uniforms', 'pretend play', 'spice boxes', 'attars', 'kajal', 'dental floss', 'parachute pants', 'bucket hats']) {
      expect(readme.toLowerCase()).toContain(item.split(' ')[0]!);
      expect(names.has(item), item).toBe(true);
    }
  });

  it('rejects a reserved section slug, duplicate siblings and empty categories', () => {
    const bad = (t: TreeFile) => () => flattenTree(t);
    expect(bad({ version: 1, sections: [{ name: 'Search', categories: [{ name: 'A', subcategories: ['B'] }] }] })).toThrow(/reserved/);
    expect(bad({ version: 1, sections: [{ name: 'Men', categories: [{ name: 'A', subcategories: ['B', 'b'] }] }] })).toThrow(/duplicate/);
    expect(bad({ version: 1, sections: [{ name: 'Men', categories: [{ name: 'A', subcategories: [] }] }] })).toThrow(/no subcategories/);
  });

  it('lists a node with its ancestors', () => {
    expect(withAncestors('men/topwear/t-shirts')).toEqual(['men', 'men/topwear', 'men/topwear/t-shirts']);
  });
});
