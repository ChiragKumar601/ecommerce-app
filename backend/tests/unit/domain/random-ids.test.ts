import { describe, expect, it } from 'vitest';
import { newId, randomUpperAlnum, shortId, slugify } from '../../../src/domain/ids.js';
import { cryptoRandom, pickOne, randomIntBetween, seededRandom, weightedPick } from '../../../src/domain/random.js';

describe('random', () => {
  it('is reproducible with a seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('stays within [0, 1) and integer bounds', () => {
    const rng = seededRandom(7);
    for (let i = 0; i < 1000; i += 1) {
      const n = randomIntBetween(rng, 2, 3);
      expect(n === 2 || n === 3).toBe(true);
      const c = cryptoRandom.next();
      expect(c >= 0 && c < 1).toBe(true);
    }
  });
  it('picks by weight roughly in proportion (70/15/10/5)', () => {
    const rng = seededRandom(123);
    const counts = { success: 0, failure: 0, cancelled: 0, timed_out: 0 };
    for (let i = 0; i < 20000; i += 1) counts[weightedPick(rng, { success: 70, failure: 15, cancelled: 10, timed_out: 5 })] += 1;
    expect(counts.success / 20000).toBeCloseTo(0.7, 1);
    expect(counts.timed_out / 20000).toBeCloseTo(0.05, 1);
    expect(() => weightedPick(rng, { a: 0 })).toThrow(RangeError);
    expect(pickOne(rng, ['only'])).toBe('only');
  });
});

describe('ids (SEC-006)', () => {
  it('creates non-sequential ids', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(newId()).not.toBe(newId());
    expect(shortId()).toMatch(/^[a-z0-9]{10}$/);
    expect(randomUpperAlnum(5)).toMatch(/^[A-Z0-9]{5}$/);
  });
  it('slugifies names for URLs', () => {
    expect(slugify('Kurta Sets')).toBe('kurta-sets');
    expect(slugify('Belts & Wallets')).toBe('belts-and-wallets');
    expect(slugify("Women's Footwear")).toBe('women-s-footwear');
    expect(slugify('Gen Z')).toBe('gen-z');
  });
});
