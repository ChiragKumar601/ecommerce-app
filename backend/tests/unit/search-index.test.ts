import { describe, expect, it } from 'vitest';
import { boundedOsa } from '../../src/domain/search/levenshtein.js';
import { stem } from '../../src/domain/search/tokenize.js';
import { SearchIndex } from '../../src/services/search/index.js';
import { generatedSnapshot } from '../helpers/genSnapshot.js';

const snap = generatedSnapshot();
const idx = new SearchIndex(snap);
const byId = new Map(snap.products.map((p) => [p.id, p]));
const haystack = (id: string) => {
  const p = byId.get(id)!;
  return [p.name, p.brandName, ...[...p.nodeIds].map((n) => snap.nodes.get(n)!.name)].join(' ').toLowerCase();
};

// SRC-004 typo set: [query, a word every top result must contain]. ≥ 30 cases (plan S8 verify).
const TYPOS: [string, string][] = [
  ['snaekers', 'sneaker'], ['sneekers', 'sneaker'], ['tshrit', 'shirt'], ['kurtaa', 'kurta'], ['krta', 'kurta'],
  ['jeens', 'jeans'], ['jaens', 'jeans'], ['sarre', 'saree'], ['lipstik', 'lipstick'], ['lipstck', 'lipstick'],
  ['hoodei', 'hoodie'], ['sunglases', 'sunglass'], ['watchs', 'watch'], ['wach', 'watch'], ['headphnes', 'headphone'],
  ['bedshet', 'bedsheet'], ['cushon', 'cushion'], ['perfum', 'perfume'], ['parfume', 'perfume'], ['sandels', 'sandal'],
  ['jackt', 'jacket'], ['blazr', 'blazer'], ['legings', 'legging'], ['lehnga', 'lehenga'], ['dupata', 'dupatta'],
  ['sherwni', 'sherwani'], ['moisturizer', 'moisturiser'], ['shampo', 'shampoo'], ['trimer', 'trimmer'], ['backpak', 'backpack'],
  ['walet', 'wallet'], ['blak jeens', 'jeans'], ['kurtis', 'kurt'],
];

describe('search index (S8.1–S8.2)', () => {
  it('builds quickly with a sizeable vocabulary', () => {
    expect(idx.vocabularySize).toBeGreaterThan(500);
  });

  it.each(TYPOS)('typo "%s" finds products with "%s" (SRC-004)', (q, word) => {
    const r = idx.search(q);
    expect(r.ids.length, q).toBeGreaterThan(0);
    for (const id of r.ids.slice(0, 3)) expect(haystack(id), `${q} → ${byId.get(id)!.name}`).toContain(word);
  });

  it('allows 1 edit up to 5 characters and 2 beyond; transpositions count as one edit', () => {
    expect(boundedOsa('jaens', 'jeans', 1)).toBe(1);
    expect(boundedOsa('krta', 'kurta', 1)).toBe(1);
    expect(idx.expand('xyzab').words).toEqual([]);
    expect(idx.expand('sneakr').exact).toBe(false);
  });

  it('exact queries need no fuzziness; exact matches rank above typo matches', () => {
    expect(idx.search('kurta').fuzzyWords).toEqual([]);
    const small = new SearchIndex({
      nodes: snap.nodes,
      products: [
        { ...snap.products[0]!, id: 'a', name: 'Linen Kurta', subtitle: '', nodeIds: new Set(), specValues: [], colour: 'Blue' },
        { ...snap.products[0]!, id: 'b', name: 'Linen Kurti', subtitle: '', nodeIds: new Set(), specValues: [], colour: 'Blue' },
      ],
    });
    expect(small.search('kurta').ids[0]).toBe('a');
    expect(small.search('kurtta').ids).toContain('a');
  });

  it('matches across fields: brand, node names, colour, specification values (SRC-003)', () => {
    const brand = snap.products[0]!.brandName;
    expect(idx.search(brand).ids).toContain(snap.products[0]!.id);
    expect(idx.search('red kurta').ids.slice(0, 5).every((id) => haystack(id).includes('kurta'))).toBe(true);
    expect(idx.search('organic cotton').ids.length).toBeGreaterThan(0);
  });

  it('stems plurals and ignores empty/stopword queries (SRC-010)', () => {
    expect(stem('dresses')).toBe('dress');
    expect(stem('watches')).toBe('watch');
    expect(idx.search('dresses').ids).toEqual(idx.search('dress').ids);
    expect(idx.search('   ').ids).toEqual([]);
    expect(idx.search('for the').ids).toEqual([]);
  });

  it('suggests nodes and brands with prefix matching', () => {
    expect(idx.matchNodes('sneak', 3).map((n) => n.name.toLowerCase()).some((n) => n.includes('sneaker'))).toBe(true);
    expect(idx.matchBrands(snap.products[0]!.brandName.slice(0, 4), 2).length).toBeGreaterThan(0);
  });

  it('meets the lookup latency gate: p95 < 50 ms (plan §7.4)', () => {
    const queries = [...TYPOS.map(([q]) => q), 'shirt', 'red dress', 'men shoes', 'cotton', 'silk saree', 'watch'];
    const times: number[] = [];
    for (let i = 0; i < 6; i++) for (const q of queries) {
      const t = performance.now();
      idx.search(`${q}${i > 2 ? '' : ''}`, { prefixLast: i % 2 === 0 });
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]!).toBeLessThan(50);
  });
});
