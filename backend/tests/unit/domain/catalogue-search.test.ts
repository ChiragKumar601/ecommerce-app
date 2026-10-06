import { describe, expect, it } from 'vitest';
import { discountPercent } from '../../../src/domain/catalogue/discount.js';
import { bayesianRating, recommendedScore } from '../../../src/domain/catalogue/sortScore.js';
import { boundedLevenshtein, withinTypoAllowance } from '../../../src/domain/search/levenshtein.js';
import { maxTyposFor, tokenize } from '../../../src/domain/search/tokenize.js';

describe('SD-05 discount %', () => {
  it('floors the percentage and is 0 without a discount', () => {
    expect(discountPercent(149900, 99900)).toBe(33); // 33.35 → 33
    expect(discountPercent(399900, 279900)).toBe(30); // 30.007 → 30
    expect(discountPercent(1000, 1000)).toBe(0);
    expect(discountPercent(0, 0)).toBe(0);
  });
});

describe('PLP-003 Recommended score', () => {
  const now = new Date('2026-10-06T00:00:00Z');
  const ctx = { now, globalMeanRating: 4, maxRatingCount: 1000 };
  it('stays in [0, 1] and rewards rating, count and recency', () => {
    const fresh = recommendedScore({ averageRating: 4.5, ratingCount: 200, listingDate: now }, ctx);
    const old = recommendedScore({ averageRating: 4.5, ratingCount: 200, listingDate: new Date('2026-01-01') }, ctx);
    const fewRatings = recommendedScore({ averageRating: 5, ratingCount: 1, listingDate: new Date('2026-01-01') }, ctx);
    const manyRatings = recommendedScore({ averageRating: 4.6, ratingCount: 900, listingDate: new Date('2026-01-01') }, ctx);
    for (const s of [fresh, old, fewRatings, manyRatings]) expect(s >= 0 && s <= 1).toBe(true);
    expect(fresh).toBeGreaterThan(old);
    expect(manyRatings).toBeGreaterThan(fewRatings);
  });
  it('pulls few ratings towards the mean', () => {
    expect(bayesianRating(5, 1, 4)).toBeCloseTo(4.09, 2);
    expect(bayesianRating(5, 1000, 4)).toBeCloseTo(4.99, 2);
  });
});

describe('SRC-004 typo tolerance helpers', () => {
  it('tokenizes text into lower-case words', () => {
    expect(tokenize('Men’s Oversized T-Shirt (Black)')).toEqual(['men', 's', 'oversized', 't', 'shirt', 'black']);
    expect(tokenize('Café')).toEqual(['cafe']);
  });
  it('allows 1 typo up to 5 characters, 2 for longer words', () => {
    expect(maxTyposFor('shirt')).toBe(1);
    expect(maxTyposFor('kurtas')).toBe(2);
  });
  it('"snaekers" is within 2 edits of "sneakers"', () => {
    expect(boundedLevenshtein('snaekers', 'sneakers', 2)).toBe(2);
    expect(withinTypoAllowance('snaekers', 'sneakers', maxTyposFor('snaekers'))).toBe(true);
  });
  it('applies the short-word limit of 1', () => {
    expect(withinTypoAllowance('shrt', 'shirt', maxTyposFor('shrt'))).toBe(true);
    expect(withinTypoAllowance('shrit', 'shirt', maxTyposFor('shrit'))).toBe(false);
  });
  it('returns max + 1 once the bound is exceeded', () => {
    expect(boundedLevenshtein('abc', 'xyz', 1)).toBe(2);
    expect(boundedLevenshtein('kurta', 'kurta', 2)).toBe(0);
    expect(boundedLevenshtein('', 'ab', 2)).toBe(2);
    expect(boundedLevenshtein('a', 'abcd', 2)).toBe(3);
  });
});
