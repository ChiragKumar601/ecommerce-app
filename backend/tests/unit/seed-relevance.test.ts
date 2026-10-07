import { describe, expect, it } from 'vitest';
import { isRelevant, keywordsFor } from '../../src/seed/catalogue/relevance.js';

describe('image relevance filter', () => {
  it('accepts titles that name the product type, plural-tolerant', () => {
    expect(isRelevant("Men's long sleeve T shirt", keywordsFor('T-Shirt'))).toBe(true);
    expect(isRelevant('Black Converse sneakers', keywordsFor('Sneakers'))).toBe(true);
    expect(isRelevant('Rubber flip-flops on sand', keywordsFor('Slipper'))).toBe(true);
    expect(isRelevant('Crystal chandelier in hall', keywordsFor('Ceiling Light'))).toBe(true);
    expect(isRelevant('Blue khadi kurta', keywordsFor('Kurta Set'))).toBe(true);
    expect(isRelevant('A pile of cloth nappies', keywordsFor('Diapers'))).toBe(true);
  });
  it('rejects the off-topic results from the spot-check', () => {
    expect(isRelevant('Lightning over the town at night', keywordsFor('Ceiling Light'))).toBe(false);
    expect(isRelevant('Columbia wheel at the fair', keywordsFor('Decorative Lights'))).toBe(false);
    expect(isRelevant('R. Moore jockey at the races', keywordsFor('Slipper'))).toBe(false);
    expect(isRelevant('Agung Wicaksono', keywordsFor('Formal Shirt'))).toBe(false);
    expect(isRelevant('Battledress jacket of a general', keywordsFor('Diapers'))).toBe(false);
    expect(isRelevant('Singer in a white jacket at the concert', keywordsFor('Jacket'))).toBe(false);
  });
  it('does not match inside other words', () => {
    expect(isRelevant('Artist at work', keywordsFor('Wall Art'))).toBe(false);
    expect(isRelevant('Ringmaster in a circus', keywordsFor('Ring'))).toBe(false);
  });
});
